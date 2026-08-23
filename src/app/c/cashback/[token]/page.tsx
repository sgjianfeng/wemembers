import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { loadClaimToken, claimTokenErrorMessage } from "@/lib/cashback-token";
import { parseCashbackRules } from "@/lib/cashback";
import { CashbackClaimClient } from "./CashbackClaimClient";
import { Card, CardContent } from "@/components/ui/Card";

/**
 * 顾客扫码领取页（公开路由 /c/*）
 *
 * 金额来自令牌（店员收银时录入），顾客不可填——这是防作弊的关键：
 * 顾客自填金额可以填 S$800 实花 S$5。
 */
export default async function CashbackClaimPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const loaded = await loadClaimToken(prisma, token);

  if (!loaded) {
    return (
      <div className="p-4 min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardContent className="p-8 text-center space-y-2">
            <p className="text-4xl">❓</p>
            <p className="font-semibold">二维码无效</p>
            <p className="text-sm text-muted-foreground">
              请让店员重新生成
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: loaded.campaignId },
    select: { rulesSnapshot: true },
  });
  const rules = parseCashbackRules(campaign?.rulesSnapshot ?? null);

  const session = await getSession();
  let myPhone: string | null = null;
  if (session?.role === "customer") {
    const me = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { phone: true },
    });
    myPhone = me?.phone ?? null;
  }

  return (
    <CashbackClaimClient
      token={loaded.token}
      state={loaded.state}
      stateMessage={
        loaded.state === "pending" ? null : claimTokenErrorMessage(loaded.state)
      }
      amountCents={loaded.amountCents}
      storeName={loaded.storeName}
      businessName={loaded.businessName}
      estimatedCashbackCents={Math.floor(
        (loaded.amountCents * rules.cashbackPercent) / 100
      )}
      cashbackPercent={rules.cashbackPercent}
      inactivityMonths={rules.inactivityMonths}
      myPhone={myPhone}
    />
  );
}

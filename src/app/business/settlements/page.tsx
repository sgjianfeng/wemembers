import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { timeAgo } from "@/lib/utils";
import { Gem } from "lucide-react";

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const sp = await searchParams;
  const role = sp.role || "all";

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const account = await prisma.tokenAccount.findUnique({
    where: { userId: session.userId },
  });

  const where: any = {
    ...(role === "issuer" ? { issuerBusinessId: session.userId } : {}),
    ...(role === "redeemer" ? { redeemerBusinessId: session.userId } : {}),
    ...(role === "all" ? { OR: [{ issuerBusinessId: session.userId }, { redeemerBusinessId: session.userId }] } : {}),
  };

  const settlements = await prisma.settlement.findMany({
    where,
    include: {
      redemption: {
        select: {
          redeemedAt: true,
          amountSaved: true,
          claim: { select: { coupon: { select: { title: true } } } },
        },
      },
      issuer: { select: { businessName: true } },
      redeemer: { select: { businessName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const summary = {
    totalPlatformFee: settlements.reduce((s, t) => s + t.platformFee, 0),
    totalIssuerFee: settlements.filter((t) => t.issuerBusinessId === session.userId).reduce((s, t) => s + t.issuerFee, 0),
    totalRedeemerIncome: settlements.filter((t) => t.redeemerBusinessId === session.userId).reduce((s, t) => s + t.redeemerIncome, 0),
  };

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-border sticky top-0 bg-card z-10">
        <h1 className="text-lg font-semibold text-foreground">{t("business.settlements.title", lang)}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t("business.settlements.subtitle", lang)}</p>
      </div>

      {/* 余额概览 */}
      {account && (
        <div className="px-4 mt-4">
          <div className="grid grid-cols-3 gap-2">
            <Card className="bg-muted/50 border-0">
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-foreground nums">{(account.balance / 100).toFixed(0)}</p>
                <p className="text-[10px] text-muted-foreground">{t("business.settlements.balance", lang)}</p>
              </CardContent>
            </Card>
            <Card className="bg-amber-50 dark:bg-amber-950/40 border-0">
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-amber-700 dark:text-amber-400 nums">{(account.frozenBalance / 100).toFixed(0)}</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-400">{t("business.settlements.frozen", lang)}</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 dark:bg-green-950/40 border-0">
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-green-700 dark:text-green-400 nums">{((account.totalEarned) / 100).toFixed(0)}</p>
                <p className="text-[10px] text-green-600 dark:text-green-400">{t("business.settlements.totalEarned", lang)}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* 汇总 */}
      <div className="px-4 mt-4">
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label={t("business.settlements.myPromoFee", lang)} value={`S$${(summary.totalIssuerFee / 100).toFixed(2)}`} />
          <MiniStat label={t("business.settlements.myRedeemIncome", lang)} value={`S$${(summary.totalRedeemerIncome / 100).toFixed(2)}`} />
          <MiniStat label={t("business.settlements.platformFee", lang)} value={`S$${(summary.totalPlatformFee / 100).toFixed(2)}`} />
        </div>
      </div>

      {/* 筛选 */}
      <div className="px-4 mt-4 flex gap-1.5">
        {["all", "issuer", "redeemer"].map((key) => {
          const isActive = role === key;
          return (
            <a
              key={key}
              href={`/business/settlements?role=${key}`}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.97] ${
                isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {t(`business.settlements.${key === "all" ? "all" : key === "issuer" ? "iIssued" : "iRedeemed"}`, lang)}
            </a>
          );
        })}
      </div>

      {/* 列表 */}
      <div className="px-4 mt-3 space-y-2">
        {settlements.map((s) => {
          const isIssuer = s.issuerBusinessId === session.userId;
          const isRedeemer = s.redeemerBusinessId === session.userId;
          return (
            <Card key={s.id}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Gem size={12} className="text-muted-foreground" aria-hidden />
                    <span className="text-sm font-medium text-foreground nums">
                      S${(s.totalAmount / 100).toFixed(2)}
                    </span>
                    <Badge variant={isIssuer ? "amber" : "blue"} size="sm">
                      {isIssuer ? t("business.settlements.myVoucher", lang) : t("business.settlements.iRedeemed", lang)}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{timeAgo(s.createdAt)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {s.redemption?.claim?.coupon?.title || t("business.settlements.unknownVoucher", lang)} ·{" "}
                  {s.issuer.businessName} → {s.redeemer.businessName}
                </p>
                <div className="flex items-center gap-2 mt-1.5 text-[10px] nums">
                  <span className="text-muted-foreground">
                    {t("business.settlements.platform", lang)} S${(s.platformFee / 100).toFixed(2)}
                  </span>
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    {t("business.settlements.promo", lang)} S${(s.issuerFee / 100).toFixed(2)}
                  </span>
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    {t("business.settlements.redeem", lang)} S${(s.redeemerIncome / 100).toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {settlements.length === 0 && (
          <EmptyState
            icon="earnings"
            tone="calm"
            title={t("business.settlements.noRecords", lang)}
            className="py-12"
          />
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center py-2 bg-muted/50 rounded-xl">
      <p className="text-sm font-bold text-foreground nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

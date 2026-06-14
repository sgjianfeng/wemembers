import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { timeAgo } from "@/lib/utils";

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const sp = await searchParams;
  const role = sp.role || "all";

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
      <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
        <h1 className="text-lg font-semibold">结算记录</h1>
        <p className="text-xs text-slate-400 mt-0.5">跨商家核销的结算明细</p>
      </div>

      {/* 余额概览 */}
      {account && (
        <div className="px-4 mt-4">
          <div className="grid grid-cols-3 gap-2">
            <Card className="bg-slate-50 border-0">
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-slate-900">{(account.balance / 100).toFixed(0)}</p>
                <p className="text-[10px] text-slate-400">可用余额</p>
              </CardContent>
            </Card>
            <Card className="bg-amber-50 border-0">
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-amber-700">{(account.frozenBalance / 100).toFixed(0)}</p>
                <p className="text-[10px] text-amber-600">冻结中</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 border-0">
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-green-700">{((account.totalEarned) / 100).toFixed(0)}</p>
                <p className="text-[10px] text-green-600">累计收益</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* 汇总 */}
      <div className="px-4 mt-4">
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="我的推广费" value={`¥${(summary.totalIssuerFee / 100).toFixed(2)}`} />
          <MiniStat label="我的核销收入" value={`¥${(summary.totalRedeemerIncome / 100).toFixed(2)}`} />
          <MiniStat label="平台手续费" value={`¥${(summary.totalPlatformFee / 100).toFixed(2)}`} />
        </div>
      </div>

      {/* 筛选 */}
      <div className="px-4 mt-4 flex gap-1.5">
        {[{ key: "all", label: "全部" }, { key: "issuer", label: "我发券" }, { key: "redeemer", label: "我核销" }].map((f) => {
          const isActive = role === f.key;
          return (
            <a
              key={f.key}
              href={`/business/settlements?role=${f.key}`}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                isActive ? "bg-[#1A6EFF] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {f.label}
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
                    <span className="text-xs">💎</span>
                    <span className="text-sm font-medium text-slate-900">
                      ¥{(s.totalAmount / 100).toFixed(2)}
                    </span>
                    <Badge variant={isIssuer ? "amber" : "blue"} size="sm">
                      {isIssuer ? "我的券" : "我核销"}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-slate-400">{timeAgo(s.createdAt)}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {s.redemption?.claim?.coupon?.title || "未知券"} ·{" "}
                  {s.issuer.businessName} → {s.redeemer.businessName}
                </p>
                <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                  <span className="text-slate-400">
                    平台 ¥{(s.platformFee / 100).toFixed(2)}
                  </span>
                  <span className="text-amber-600 font-medium">
                    推广 ¥{(s.issuerFee / 100).toFixed(2)}
                  </span>
                  <span className="text-green-600 font-medium">
                    核销 ¥{(s.redeemerIncome / 100).toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {settlements.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <p className="text-3xl mb-2">📊</p>
            <p className="text-sm">暂无结算记录</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center py-2 bg-slate-50 rounded-xl">
      <p className="text-sm font-bold text-slate-900">{value}</p>
      <p className="text-[10px] text-slate-400">{label}</p>
    </div>
  );
}

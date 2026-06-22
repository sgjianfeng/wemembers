import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { timeAgo } from "@/lib/utils";
import { PointsActions } from "./PointsActions";
import { TierProgress } from "./TierProgress";

const tierDisplay: Record<string, { label: string; variant: "slate" | "amber" | "purple" | "blue" }> = {
  regular: { label: "普通", variant: "slate" },
  silver: { label: "银卡", variant: "blue" },
  gold: { label: "金卡", variant: "amber" },
  platinum: { label: "铂金", variant: "purple" },
};

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff"))
    redirect("/auth/login");

  const { id: customerId } = await params;

  const membership = await prisma.membership.findFirst({
    where: { businessId: session.userId, customerId },
    include: {
      customer: {
        select: {
          id: true,
          displayName: true,
          phone: true,
          membershipTier: true,
          pointsBalance: true,
          lifetimePoints: true,
          createdAt: true,
        },
      },
    },
  });

  if (!membership)
    return <div className="p-8 text-center text-slate-400">会员不存在</div>;

  const td = tierDisplay[membership.tier] || tierDisplay.regular;

  const { getTierConfigs } = await import("@/lib/points");
  const tierConfigs = await getTierConfigs(session.userId);

  const pointsLogs = await prisma.pointsLog.findMany({
    where: { membershipId: membership.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const claims = await prisma.customerCoupon.findMany({
    where: { customerId, coupon: { businessId: session.userId } },
    include: { coupon: { select: { title: true, valueCents: true } } },
    orderBy: { claimedAt: "desc" },
    take: 10,
  });

  const redemptions = await prisma.redemptionLog.findMany({
    where: { businessId: session.userId, customerId },
    orderBy: { redeemedAt: "desc" },
    take: 10,
  });

  const claimedTotal = claims.reduce((sum, c) => sum + c.coupon.valueCents, 0);
  const usedTotal = redemptions.reduce((sum, r) => sum + r.amountSaved, 0);

  const typeLabels: Record<string, string> = {
    checkin: "📅 签到",
    redeem_bonus: "💎 消费奖励",
    manual_grant: "⭐ 手动发放",
    manual_deduct: "📉 手动扣减",
  };

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
        <h1 className="text-lg font-semibold">会员详情</h1>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* 档案卡片 */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1A6EFF] to-[#3B82F6] flex items-center justify-center text-white text-xl font-bold">
                {(membership.customer.displayName || "会").charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold text-slate-900">
                    {membership.customer.displayName || "未命名"}
                  </p>
                  <Badge variant={td.variant}>{td.label}会员</Badge>
                </div>
                <p className="text-sm text-slate-400">
                  {membership.customer.phone}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  加入于{" "}
                  {membership.createdAt.toLocaleDateString("zh-CN")} ·{" "}
                  {membership.visitsCount}次到店
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-50">
              <MiniStat label="积分" value={membership.points.toString()} />
              <MiniStat
                label="总消费"
                value={`S$${membership.totalSpent.toFixed(0)}`}
              />
              <MiniStat
                label="总领取"
                value={`S$${(claimedTotal / 100).toFixed(0)}`}
              />
            </div>

            <TierProgress
              points={membership.points}
              tierConfigs={JSON.parse(JSON.stringify(tierConfigs))}
            />

            <div className="mt-3">
              <PointsActions customerId={customerId} />
            </div>
          </CardContent>
        </Card>

        {/* 积分流水 */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">
            📋 积分流水
          </h3>
          {pointsLogs.length > 0 ? (
            <div className="space-y-1">
              {pointsLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-slate-50 text-xs"
                >
                  <div>
                    <p className="text-slate-700">
                      {typeLabels[log.type] || log.type} {log.reason}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {timeAgo(log.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`font-mono font-medium ${
                      log.amount > 0 ? "text-green-600" : "text-red-500"
                    }`}
                  >
                    {log.amount > 0 ? "+" : ""}
                    {log.amount}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-slate-400 py-4">
              暂无积分记录
            </p>
          )}
        </div>

        {/* 领券历史 */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">
            🎫 领券记录
          </h3>
          <div className="space-y-1">
            {claims.map((claim) => (
              <div
                key={claim.id}
                className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-slate-50 text-xs"
              >
                <div className="min-w-0">
                  <p className="text-slate-700 truncate">
                    {claim.coupon.title}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {timeAgo(claim.claimedAt)}
                  </p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-slate-900 font-medium">
                    S${(claim.coupon.valueCents / 100).toFixed(0)}
                  </p>
                  <Badge
                    variant={
                      claim.status === "used"
                        ? "green"
                        : claim.status === "available"
                        ? "orange"
                        : "slate"
                    }
                    size="sm"
                  >
                    {claim.status === "used"
                      ? "已用"
                      : claim.status === "available"
                      ? "可用"
                      : claim.status}
                  </Badge>
                </div>
              </div>
            ))}
            {claims.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-4">
                暂无记录
              </p>
            )}
          </div>
        </div>

        {/* 核销历史 */}
        {redemptions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              ✅ 核销记录
            </h3>
            <div className="space-y-1">
              {redemptions.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-slate-50 text-xs"
                >
                  <span className="text-slate-500">
                    核销 S${r.amountSaved}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {timeAgo(r.redeemedAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold text-slate-900">{value}</p>
      <p className="text-[10px] text-slate-400">{label}</p>
    </div>
  );
}

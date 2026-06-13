import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { timeAgo, daysUntil } from "@/lib/utils";
import Link from "next/link";
import { StatusToggle } from "./StatusToggle";

export default async function CouponDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const { id } = await params;
  const coupon = await prisma.coupon.findFirst({
    where: { id, businessId: session.userId },
    include: {
      claims: { take: 10, orderBy: { claimedAt: "desc" }, include: { customer: { select: { displayName: true, phone: true } } } },
    },
  });

  if (!coupon) return <div className="p-8 text-center text-slate-400">券不存在</div>;

  const statusBadge: Record<string, { variant: "green" | "orange" | "red" | "slate"; label: string }> = {
    published: { variant: "green", label: "进行中" }, draft: { variant: "slate", label: "草稿" },
    paused: { variant: "orange", label: "已暂停" }, ended: { variant: "red", label: "已结束" },
  };
  const sb = statusBadge[coupon.status] || { variant: "slate" as const, label: coupon.status };
  const rate = coupon.claimedCount > 0 ? Math.round((coupon.usedCount / coupon.claimedCount) * 100) : 0;
  const daysLeft = daysUntil(coupon.validUntil);

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
        <Link href="/business/coupons" className="text-sm text-slate-500">← 返回</Link>
        <h1 className="text-sm font-semibold">券详情</h1>
        <Badge variant={sb.variant}>{sb.label}</Badge>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* 概览卡片 */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3"><span className="text-3xl">🎫</span><div><p className="text-lg font-bold text-slate-900">{coupon.title}</p><p className="text-xs text-slate-500">{coupon.description || "暂无描述"}</p></div></div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Info label="券类型" value={{ fixed_amount: "定额减免", percentage: "折扣券", free_item: "免单券" }[coupon.type] || coupon.type} />
              <Info label="面值" value={`¥${(coupon.valueCents / 100).toFixed(coupon.type === "percentage" ? 1 : 0)}${coupon.type === "percentage" ? "折" : ""}`} />
              <Info label="所需积分" value={`${coupon.pointsRequired}⭐`} />
              <Info label="最低消费" value={coupon.minSpendCents > 0 ? `¥${(coupon.minSpendCents / 100).toFixed(0)}` : "无"} />
              <Info label="有效期" value={`${coupon.validFrom.toLocaleDateString("zh-CN")} ~ ${coupon.validUntil.toLocaleDateString("zh-CN")}`} />
              <Info label="数量" value={coupon.totalQuantity ? `${coupon.claimedCount}/${coupon.totalQuantity}` : `${coupon.claimedCount}/∞`} />
              <Info label="每人限领" value={`${coupon.perCustomerLimit}张`} />
              <Info label="转赠" value={coupon.isGiftable ? "允许" : "禁止"} />
            </div>
          </CardContent>
        </Card>

        {/* 核销漏斗 */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">📊 转化漏斗</h3>
            <div className="flex items-center gap-3">
              <FunnelStep label="已领取" value={coupon.claimedCount} color="bg-[#1A6EFF]" />
              <span className="text-slate-300 text-lg">→</span>
              <FunnelStep label="已核销" value={coupon.usedCount} color="bg-[#16A34A]" />
              <span className="text-slate-300 text-lg">→</span>
              <div className="text-center">
                <p className="text-2xl font-bold text-[#FF6B35]">{rate}%</p>
                <p className="text-[10px] text-slate-400">核销率</p>
              </div>
            </div>
            {coupon.claimedCount > 0 && coupon.usedCount > 0 && (
              <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#1A6EFF] to-[#16A34A]" style={{ width: `${rate}%` }} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* 状态操作 */}
        {coupon.status !== "ended" && <StatusToggle couponId={coupon.id} currentStatus={coupon.status} />}

        {/* 最近领取 */}
        {coupon.claims.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-slate-900">📋 最近领取</h3>
            <div className="space-y-1">
              {coupon.claims.map((claim) => (
                <div key={claim.id} className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-slate-50 text-xs">
                  <span className="text-slate-600">{claim.customer.displayName || claim.customer.phone}</span>
                  <Badge variant={claim.status === "used" ? "green" : claim.status === "available" ? "orange" : "slate"} size="sm">
                    {claim.status === "used" ? "已核销" : claim.status === "available" ? "待使用" : claim.status}
                  </Badge>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-slate-400 text-xs">{label}</span><span className="text-slate-900 text-xs font-medium">{value}</span></div>;
}

function FunnelStep({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`w-10 h-10 ${color} rounded-full flex items-center justify-center text-white font-bold mx-auto`}>{value}</div>
      <p className="text-[10px] text-slate-400 mt-1">{label}</p>
    </div>
  );
}

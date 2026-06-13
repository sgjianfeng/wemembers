import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { daysUntil } from "@/lib/utils";
import { ClaimButton } from "./ClaimButton";
import { getSession } from "@/lib/auth";
import { GiftBadge } from "./GiftBadge";

export default async function CouponDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coupon = await prisma.coupon.findUnique({
    where: { id },
    include: { business: { select: { id: true, businessName: true, businessLogo: true, businessCategory: true } } },
  });

  if (!coupon || coupon.status !== "published") {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-center text-slate-400"><p className="text-4xl mb-2">🎫</p><p className="text-sm">券不存在或已下架</p></div></div>;
  }

  const typeLabel = { fixed_amount: "定额减免", percentage: "折扣券", free_item: "免单券" }[coupon.type] || coupon.type;
  const daysLeft = daysUntil(coupon.validUntil);
  const soldOut = coupon.remainingQuantity !== null && coupon.remainingQuantity <= 0;
  const expired = coupon.validUntil < new Date();

  const session = await getSession();
  const isCustomer = session?.role === "customer";

  return (
    <div className="pb-4 min-h-screen">
      {/* Hero Card */}
      <div className="bg-gradient-to-b from-[#1A6EFF] to-white px-4 pt-8 pb-6">
        <Card className="max-w-sm mx-auto overflow-hidden border-0 shadow-sm">
          <div className="bg-gradient-to-r from-[#FF6B35] to-orange-400 p-6 text-white text-center">
            <p className="text-white/70 text-xs mb-1">{coupon.business?.businessName}</p>
            <p className="text-4xl font-bold">
              {coupon.type === "percentage" ? `${(coupon.valueCents / 100).toFixed(0)}折` : coupon.type === "free_item" ? "免单" : `¥${(coupon.valueCents / 100).toFixed(0)}`}
            </p>
            <p className="text-sm font-medium mt-1">{coupon.title}</p>
            {coupon.description && <p className="text-xs text-white/70 mt-2">{coupon.description}</p>}
          </div>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-xs"><span className="text-slate-400">券类型</span><span className="text-slate-900">{typeLabel}</span></div>
            <div className="flex justify-between text-xs"><span className="text-slate-400">所需积分</span><span className="text-[#FF6B35] font-bold">{coupon.pointsRequired}⭐</span></div>
            <div className="flex justify-between text-xs"><span className="text-slate-400">最低消费</span><span className="text-slate-900">{coupon.minSpendCents > 0 ? `¥${(coupon.minSpendCents / 100).toFixed(0)}` : "无"}</span></div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">有效期</span>
              <span className={`${daysLeft <= 3 ? "text-red-500" : "text-slate-900"}`}>
                {coupon.validFrom.toLocaleDateString("zh-CN")} ~ {coupon.validUntil.toLocaleDateString("zh-CN")}
                <span className="ml-1">({daysLeft}天)</span>
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">剩余</span>
              <span className="text-slate-900">{coupon.remainingQuantity ?? "不限量"}{coupon.remainingQuantity !== null ? `/${coupon.totalQuantity}` : ""} 张</span>
            </div>
            <div className="flex justify-between text-xs"><span className="text-slate-400">每人限领</span><span className="text-slate-900">{coupon.perCustomerLimit}张</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Gift Badge */}
      {coupon.giftType && coupon.giftType !== "none" && (() => {
        try { return JSON.parse(coupon.giftData || "{}"); } catch { return null; }
      })() && (
        <div className="px-4 mt-4">
          <GiftBadge type={coupon.giftType} data={coupon.giftData!} />
        </div>
      )}

      {/* Claim Section */}
      <div className="px-4 mt-4">
        {isCustomer ? (
          <ClaimButton couponId={coupon.id} pointsRequired={coupon.pointsRequired} soldOut={soldOut} expired={expired} />
        ) : (
          <div className="text-center p-4 bg-slate-50 rounded-xl">
            <p className="text-sm text-slate-400">请先登录以领取此券</p>
          </div>
        )}

        {coupon.isGiftable && (
          <p className="text-center text-xs text-slate-400 mt-3">
            🎁 此券支持转赠好友
          </p>
        )}
      </div>
    </div>
  );
}

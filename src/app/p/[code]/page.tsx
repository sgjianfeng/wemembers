import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { daysUntil } from "@/lib/utils";
import Link from "next/link";

export default async function PromoLandingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  // 查找推广链接
  const link = await prisma.promoterLink.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      coupon: { include: { business: { select: { businessName: true, businessLogo: true } } } },
      promoter: { select: { displayName: true, phone: true } },
    },
  });

  if (!link || !link.isActive) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center px-6">
          <p className="text-5xl mb-4">🔗</p>
          <h1 className="text-lg font-semibold text-slate-900">链接已失效</h1>
          <p className="text-sm text-slate-400 mt-2">该推广链接不存在或已下线</p>
          <Link href="/home" className="inline-block mt-6 px-6 py-2 bg-[#1A6EFF] text-white rounded-full text-sm">前往首页</Link>
        </div>
      </div>
    );
  }

  // 更新点击计数
  await prisma.promoterLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } });

  const coupon = link.coupon;
  const daysLeft = daysUntil(coupon.validUntil);

  // 奖励展示
  const rewardType = coupon.rewardType || "cash";
  let rewardDisplay = "";
  let rewardIcon = "💰";
  if (rewardType === "cash" && coupon.commissionType && coupon.commissionValue) {
    rewardDisplay = coupon.commissionType === "percentage"
      ? `${coupon.commissionValue}%（约 ¥${((coupon.valueCents * coupon.commissionValue) / 10000).toFixed(2)}）`
      : `¥${(coupon.commissionValue / 100).toFixed(2)}`;
  } else if (rewardType === "item" && coupon.itemRewardName) {
    rewardDisplay = coupon.itemRewardName;
    rewardIcon = "🎁";
  } else if (rewardType === "lottery") {
    rewardDisplay = "幸运抽奖";
    rewardIcon = "🎰";
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FF6B35] via-orange-50 to-white">
      {/* 推广者标签 */}
      <div className="px-4 pt-6 pb-2 text-center">
        <p className="text-white/70 text-xs">
          {link.promoter.displayName || link.promoter.phone || "好友"} 推荐给你一张代金券
        </p>
      </div>

      {/* 券卡片 */}
      <div className="px-4 mt-4">
        <Card className="max-w-sm mx-auto overflow-hidden border-0 shadow-lg">
          <div className="bg-gradient-to-r from-[#FF6B35] to-orange-400 p-6 text-white text-center">
            <p className="text-white/70 text-xs mb-1">{coupon.business?.businessName}</p>
            <p className="text-5xl font-bold">
              {coupon.type === "percentage" ? `${(coupon.valueCents / 100).toFixed(0)}折` : `¥${(coupon.valueCents / 100).toFixed(0)}`}
            </p>
            <p className="text-sm font-medium mt-1">{coupon.title}</p>
            {coupon.description && <p className="text-xs text-white/70 mt-2">{coupon.description}</p>}
          </div>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-xs"><span className="text-slate-400">所需积分</span><span className="text-[#FF6B35] font-bold">{coupon.pointsRequired}⭐</span></div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">有效期</span>
              <span className={daysLeft <= 3 ? "text-red-500" : "text-slate-900"}>{coupon.validUntil.toLocaleDateString("zh-CN")} ({daysLeft}天)</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">推广奖励</span>
              <span className="text-green-600 font-semibold">{rewardIcon} {rewardDisplay}/张</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CTA */}
      <div className="px-6 mt-6 max-w-sm mx-auto">
        <Link
          href={`/coupons/${coupon.id}?ref=${link.code}`}
          className="block w-full py-3 bg-[#FF6B35] text-white text-center rounded-full font-semibold text-base active:scale-95 transition-transform"
        >
          查看并领取
        </Link>
        <p className="text-center text-xs text-slate-400 mt-3">
          领取此券即可为推荐人赚取 {rewardIcon} {rewardDisplay} 奖励
        </p>

        {/* 推广者信息 */}
        <div className="mt-6 p-4 bg-white rounded-xl border border-slate-100">
          <p className="text-xs text-slate-400 text-center mb-2">💡 你也可以成为推广者</p>
          <p className="text-xs text-slate-500 text-center">
            分享代金券给好友，每张赚取佣金 — 不限时间地点，随时提现
          </p>
          <Link
            href="/promoter"
            className="block text-center mt-3 text-sm text-[#1A6EFF] font-medium"
          >
            了解推广计划 →
          </Link>
        </div>
      </div>
    </div>
  );
}

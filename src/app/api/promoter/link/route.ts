import { NextRequest, NextResponse } from "next/server";

// POST /api/promoter/link — 生成推广链接
export async function POST(request: NextRequest) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { prisma } = await import("@/lib/db");

  const account = await prisma.promoterAccount.findUnique({ where: { userId: session.userId } });
  if (!account || !account.isActive) return NextResponse.json({ error: "请先开启推广模式" }, { status: 400 });

  const { couponId } = await request.json();
  if (!couponId) return NextResponse.json({ error: "请选择代金券" }, { status: 400 });

  const coupon = await prisma.coupon.findUnique({ where: { id: couponId } });
  if (!coupon || !coupon.allowPromotion) return NextResponse.json({ error: "此券不允许推广" }, { status: 400 });

  // 检查是否已有
  const existing = await prisma.promoterLink.findFirst({
    where: { promoterId: session.userId, couponId, isActive: true },
  });
  if (existing) return NextResponse.json({ data: existing });

  // 生成短码
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();

  const link = await prisma.promoterLink.create({
    data: { promoterId: session.userId, couponId, code },
  });

  return NextResponse.json({
    data: {
      ...link,
      shareUrl: `/p/${code}`,
      fullUrl: `wemembers://promo/${code}`,
      rewardType: coupon.rewardType || "cash",
      commissionDisplay: coupon.rewardType === "item" ? `🎁 ${coupon.itemRewardName || "奖品"}/张`
        : coupon.rewardType === "lottery" ? "🎰 抽奖机会/张"
        : (coupon.commissionType === "percentage" ? `${coupon.commissionValue}%（≈¥${((coupon.valueCents * (coupon.commissionValue!)) / 10000).toFixed(2)}/张）` : `¥${((coupon.commissionValue || 0) / 100).toFixed(2)}/张`),
    },
  });
}

// GET /api/promoter/link — 获取我的推广链接列表
export async function GET() {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { prisma } = await import("@/lib/db");

  const links = await prisma.promoterLink.findMany({
    where: { promoterId: session.userId },
    include: { coupon: { select: { title: true, valueCents: true, rewardType: true, commissionType: true, commissionValue: true, itemRewardName: true, business: { select: { businessName: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    data: links.map((l) => ({
      ...l,
      shareUrl: `/p/${l.code}`,
      rewardType: l.coupon.rewardType || "cash",
      commissionDisplay: (l.coupon.rewardType || "cash") === "item" ? `🎁 ${l.coupon.itemRewardName || "奖品"}/张`
        : (l.coupon.rewardType || "cash") === "lottery" ? "🎰 抽奖机会/张"
        : l.coupon.commissionType === "percentage" ? `${l.coupon.commissionValue}%（≈¥${((l.coupon.valueCents * (l.coupon.commissionValue!)) / 10000).toFixed(2)}/张）`
        : `¥${((l.coupon.commissionValue || 0) / 100).toFixed(2)}/张`,
    })),
  });
}

import { NextResponse } from "next/server";

export async function GET() {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { prisma } = await import("@/lib/db");

  const account = await prisma.promoterAccount.findUnique({ where: { userId: session.userId } });
  if (!account || !account.isActive) return NextResponse.json({ error: "请先开启推广模式" }, { status: 400 });

  const [links, todayEarnings, recentEarnings] = await Promise.all([
    prisma.promoterLink.findMany({
      where: { promoterId: session.userId, isActive: true },
      include: { coupon: { select: { title: true, valueCents: true, business: { select: { businessName: true } } } } },
      orderBy: { createdAt: "desc" }, take: 20,
    }),
    prisma.promoterEarning.aggregate({
      where: { promoterId: session.userId, status: { in: ["confirmed", "paid"] }, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      _sum: { amountCents: true },
    }),
    prisma.promoterEarning.findMany({
      where: { promoterId: session.userId },
      orderBy: { createdAt: "desc" }, take: 20,
    }),
  ]);

  // 可推广的券
  const promotableCoupons = await prisma.coupon.findMany({
    where: { allowPromotion: true, status: "published", validUntil: { gt: new Date() } },
    include: { business: { select: { businessName: true } } },
    orderBy: { createdAt: "desc" }, take: 20,
  });

  return NextResponse.json({
    data: {
      account,
      todayEarnings: todayEarnings._sum.amountCents || 0,
      links,
      recentEarnings,
      promotableCoupons,
    },
  });
}

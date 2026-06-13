import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/business/coupons/[id]/stats — 券核销数据
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "无权操作" }, { status: 403 });

  const { id } = await params;
  const coupon = await prisma.coupon.findFirst({ where: { id, businessId: session.userId } });
  if (!coupon) return NextResponse.json({ error: "券不存在" }, { status: 404 });

  // 最近7天核销
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i)); d.setHours(0, 0, 0, 0);
    return d;
  });

  const redemptions = await prisma.redemptionLog.findMany({
    where: { couponId: id, redeemedAt: { gte: last7Days[0] } },
    orderBy: { redeemedAt: "desc" }, take: 100,
  });

  // 按天聚合
  const daily = last7Days.map((day) => {
    const next = new Date(day); next.setDate(next.getDate() + 1);
    const count = redemptions.filter((r) => r.redeemedAt >= day && r.redeemedAt < next).length;
    return { date: day.toISOString().slice(0, 10), count };
  });

  return NextResponse.json({
    data: {
      coupon,
      dailyRedemptions: daily,
      recentRedemptions: redemptions.slice(0, 10),
      funnel: { claimed: coupon.claimedCount, used: coupon.usedCount, rate: coupon.claimedCount > 0 ? Math.round((coupon.usedCount / coupon.claimedCount) * 100) : 0 },
    },
  });
}

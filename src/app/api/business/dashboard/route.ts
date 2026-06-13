import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/business/dashboard — 工作台数据
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "无权操作" }, { status: 403 });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);

  const [memberCount, memberCountLastWeek, couponCount, claimsToday, claimsLastWeek, redemptionsToday, redemptionsLastWeek] = await Promise.all([
    prisma.membership.count({ where: { businessId: session.userId } }),
    prisma.membership.count({ where: { businessId: session.userId, createdAt: { lt: weekAgo } } }),
    prisma.coupon.count({ where: { businessId: session.userId, status: "published" } }),
    prisma.customerCoupon.count({ where: { coupon: { businessId: session.userId }, claimedAt: { gte: today, lt: tomorrow } } }),
    prisma.customerCoupon.count({ where: { coupon: { businessId: session.userId }, claimedAt: { gte: weekAgo, lt: today } } }),
    prisma.redemptionLog.count({ where: { businessId: session.userId, redeemedAt: { gte: today, lt: tomorrow } } }),
    prisma.redemptionLog.count({ where: { businessId: session.userId, redeemedAt: { gte: weekAgo, lt: today } } }),
  ]);

  const memberTrend = memberCountLastWeek > 0 ? Math.round(((memberCount - memberCountLastWeek) / memberCountLastWeek) * 100) : 0;
  const claimsAvg = Math.round(claimsLastWeek / 7) || 0;
  const claimsTrend = claimsAvg > 0 ? Math.round(((claimsToday - claimsAvg) / claimsAvg) * 100) : 0;
  const redeemAvg = Math.round(redemptionsLastWeek / 7) || 0;
  const redeemTrend = redeemAvg > 0 ? Math.round(((redemptionsToday - redeemAvg) / redeemAvg) * 100) : 0;

  return NextResponse.json({
    data: { memberCount, couponCount, claimsToday, redemptionsToday, trends: { members: memberTrend, claims: claimsTrend, redemptions: redeemTrend } },
  });
}

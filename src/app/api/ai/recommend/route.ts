import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { callAi } from "@/services/ai/client";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  // 获取用户偏好
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { membershipTier: true, pointsBalance: true },
  });

  const claims = await prisma.customerCoupon.findMany({
    where: { customerId: session.userId },
    select: { coupon: { select: { businessCategory: true, valueCents: true } } },
    orderBy: { claimedAt: "desc" }, take: 20,
  });

  const categories = [...new Set(claims.map(c => c.coupon.businessCategory).filter(Boolean))] as string[];
  const avgValue = claims.length > 0 ? claims.reduce((s, c) => s + c.coupon.valueCents, 0) / claims.length : 1500;

  // 获取可用券
  const coupons = await prisma.coupon.findMany({
    where: { status: "published", validUntil: { gt: new Date() } },
    include: { business: { select: { businessName: true, businessCategory: true } } },
    orderBy: { createdAt: "desc" }, take: 30,
  });

  // 构建 prompt
  const couponList = coupons.map(c => ({
    id: c.id, title: c.title, value: c.valueCents / 100,
    points: c.pointsRequired, category: c.businessCategory || "other",
    popularity: c.claimedCount, expiresIn: Math.ceil((c.validUntil.getTime() - Date.now()) / 86400000),
  }));

  const result = await callAi<{ rankedIds: string[]; explanation: string }>(
    "你是推荐系统。根据用户偏好排序代金券。输出JSON。",
    `用户: 等级${user?.membershipTier}, 积分${user?.pointsBalance}
偏好类别: ${categories.join(", ") || "未知"}
常领面值: S$${(avgValue / 100).toFixed(0)}
可选券: ${JSON.stringify(couponList)}
输出: { "rankedIds": ["id1","id2"...], "explanation": "推荐理由(≤50字)" }`,
    { temperature: 0.2, cacheTTL: 3600 }
  );

  if (!result.success || !result.data) {
    // 降级: 按领取量排序
    const sorted = coupons.sort((a, b) => b.claimedCount - a.claimedCount).map(c => c.id);
    return NextResponse.json({ data: { rankedIds: sorted.slice(0, 10), explanation: "热门推荐" }, fallback: true });
  }

  return NextResponse.json({ data: result.data, meta: { cached: result.cached } });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/coupons/discover — 客户发现页券列表
export async function GET(request: NextRequest) {
  const coupons = await prisma.coupon.findMany({
    where: {
      status: "published",
      validUntil: { gt: new Date() },
      OR: [{ remainingQuantity: { gte: 1 } }, { remainingQuantity: null }],
    },
    include: { business: { select: { businessName: true, businessLogo: true, businessCategory: true } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return NextResponse.json({ data: coupons });
}

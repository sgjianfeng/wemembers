import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/me/coupons — 我的券包
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;

  const where: any = { customerId: session.userId };
  if (status) where.status = status;

  const coupons = await prisma.customerCoupon.findMany({
    where,
    include: { coupon: { include: { business: { select: { businessName: true } } } } },
    orderBy: { claimedAt: "desc" },
  });

  return NextResponse.json({ data: coupons });
}

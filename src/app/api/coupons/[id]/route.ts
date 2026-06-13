import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/coupons/[id] — 券详情
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coupon = await prisma.coupon.findUnique({
    where: { id },
    include: { business: { select: { businessName: true, businessLogo: true, businessCategory: true } } },
  });

  if (!coupon || coupon.status !== "published") return NextResponse.json({ error: "券不存在或已下架" }, { status: 404 });

  return NextResponse.json({ data: coupon });
}

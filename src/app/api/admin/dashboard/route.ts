import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/admin/dashboard — 后台概览
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const [businessCount, customerCount, couponCount, platformFees] = await Promise.all([
    prisma.user.count({ where: { role: "business", status: "active" } }),
    prisma.user.count({ where: { role: "customer", status: "active" } }),
    prisma.coupon.count(),
    prisma.tokenTransaction.aggregate({
      _sum: { amount: true },
      where: { type: "platform_fee" },
    }),
  ]);

  return NextResponse.json({
    data: {
      businessCount,
      customerCount,
      couponCount,
      platformFeeCents: platformFees._sum.amount || 0,
      /** @deprecated use platformFeeCents */
      tokenIssued: 0,
    },
  });
}

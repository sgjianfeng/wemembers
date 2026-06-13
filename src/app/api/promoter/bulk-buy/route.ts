import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { prisma } = await import("@/lib/db");
  const { couponId, quantity } = await request.json();

  if (!couponId || !quantity || quantity < 1) return NextResponse.json({ error: "参数错误" }, { status: 400 });

  const account = await prisma.promoterAccount.findUnique({ where: { userId: session.userId } });
  if (!account || !account.isActive) return NextResponse.json({ error: "请先开启推广模式" }, { status: 400 });

  const coupon = await prisma.coupon.findUnique({ where: { id: couponId } });
  if (!coupon || !coupon.allowBulkPurchase || !coupon.bulkDiscount) return NextResponse.json({ error: "此券不允许囤货" }, { status: 400 });

  const unitPrice = Math.round(coupon.valueCents * (coupon.bulkDiscount / 100));
  const totalCost = unitPrice * quantity;

  // MVP: 不使用真实支付，直接创建记录
  const purchase = await prisma.bulkPurchase.create({
    data: { promoterId: session.userId, couponId, quantity, unitPrice, totalCost, status: "active" },
  });

  return NextResponse.json({
    data: {
      purchase,
      message: `成功囤货 ${quantity} 张券，成本 ¥${(totalCost / 100).toFixed(2)}，预计利润 ¥${(((coupon.valueCents - unitPrice) * quantity) / 100).toFixed(2)}`,
    },
  });
}

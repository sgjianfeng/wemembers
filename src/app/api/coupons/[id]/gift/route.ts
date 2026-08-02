import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// POST /api/coupons/[id]/gift — 转赠券
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "customer") return NextResponse.json({ error: "请登录" }, { status: 401 });

  const { id } = await params;
  const { targetPhone, message } = await request.json();

  if (!targetPhone) return NextResponse.json({ error: "请输入好友手机号" }, { status: 400 });

  // 验证券属于当前用户
  const claim = await prisma.customerCoupon.findFirst({
    where: { id, customerId: session.userId, status: "available" },
    include: { coupon: true },
  });
  if (!claim) return NextResponse.json({ error: "无法转赠此券" }, { status: 400 });
  if (!claim.coupon.isGiftable) return NextResponse.json({ error: "此券不允许转赠" }, { status: 400 });

  // 查找或创建「顾客」账号（兼容 +65 / 本地号，不误绑企业）
  const { findOrCreateCustomerByPhone } = await import("@/lib/customer-by-phone");
  let target: { id: string };
  try {
    const found = await findOrCreateCustomerByPhone(prisma, targetPhone);
    target = { id: found.id };
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "PHONE_NOT_CUSTOMER") {
      return NextResponse.json(
        { error: "该手机号已是非顾客账号，无法转赠" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "请输入有效手机号" }, { status: 400 });
  }

  // 转赠
  await prisma.customerCoupon.update({
    where: { id },
    data: { status: "gifted", giftFromId: session.userId, giftMessage: message || null },
  });

  // 给目标创建新券
  await prisma.customerCoupon.create({
    data: {
      customerId: target.id,
      couponId: claim.couponId,
      qrCode: generateQrCode(),
      pointsSpent: 0,
      status: "available",
      giftFromId: session.userId,
      giftMessage: message || null,
    },
  });

  return NextResponse.json({ data: { success: true, message: "转赠成功" } });
}

function generateQrCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 12 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join("");
}

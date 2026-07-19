import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
// GET /api/business/members/[id] — 会员详情
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "无权操作" }, { status: 403 });

  const { id } = await params;
  const membership = await prisma.membership.findFirst({
    where: { businessId: session.userId, customerId: id },
    include: { customer: { select: { id: true, displayName: true, phone: true, membershipTier: true, avatarUrl: true } } },
  });
  if (!membership) return NextResponse.json({ error: "会员不存在" }, { status: 404 });

  const claims = await prisma.customerCoupon.findMany({
    where: { customerId: id, coupon: { businessId: session.userId } },
    include: { coupon: { select: { title: true, valueCents: true } } },
    orderBy: { claimedAt: "desc" },
    take: 20,
  });

  const redemptions = await prisma.redemptionLog.findMany({
    where: { businessId: session.userId, customerId: id },
    orderBy: { redeemedAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ data: { membership, claims, redemptions } });
}

// PUT /api/business/members/[id] — 编辑会员
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "无权操作" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();

  const updated = await prisma.membership.update({
    where: { businessId_customerId: { businessId: session.userId, customerId: id } },
    data: {
      ...(body.points !== undefined ? { points: body.points } : {}),
      ...(body.isFavorite !== undefined ? { isFavorite: body.isFavorite } : {}),
    },
  });

  return NextResponse.json({ data: updated });
}

// POST /api/business/members/[id] — 发放/扣减积分
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id: customerId } = await params;
  const { amount, reason } = await request.json();
  if (!amount || amount === 0) return NextResponse.json({ error: "无效积分数量" }, { status: 400 });

  const membership = await prisma.membership.findUnique({
    where: { businessId_customerId: { businessId: session.userId, customerId } },
  });
  if (!membership) return NextResponse.json({ error: "会员不存在" }, { status: 404 });

  if (amount < 0 && membership.points + amount < 0) {
    return NextResponse.json({ error: "积分不足，不能扣减为负数" }, { status: 400 });
  }

  const type = amount > 0 ? "manual_grant" : "manual_deduct";

  const [updated] = await Promise.all([
    prisma.membership.update({
      where: { id: membership.id },
      data: { points: { increment: amount } },
    }),
    prisma.user.update({
      where: { id: customerId },
      data: {
        pointsBalance: { increment: amount },
        ...(amount > 0 ? { lifetimePoints: { increment: amount } } : {}),
      },
    }),
  ]);

  const { addPointsLog, checkAndUpgradeTier } = await import("@/lib/points");
  await addPointsLog({
    membershipId: membership.id,
    storeId: session.storeId,
    amount,
    type,
    reason: reason || (amount > 0 ? "手动发放" : "手动扣减"),
  });

  const upgraded = await checkAndUpgradeTier(membership.id, session.userId);

  return NextResponse.json({
    data: {
      success: true,
      points: updated.points,
      ...(upgraded ? { tierUpgraded: upgraded } : {}),
    },
  });
}

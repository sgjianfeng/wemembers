import { NextRequest, NextResponse } from "next/server";

// GET /api/business/campaigns/[id] — 活动详情+聚合数据
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "403" }, { status: 403 });

  const { id } = await params;
  const { prisma } = await import("@/lib/db");

  const campaign = await prisma.campaign.findFirst({
    where: { id, businessId: session.userId },
    include: {
      coupons: {
        include: { claims: { select: { id: true, status: true, claimedAt: true, usedAt: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!campaign) return NextResponse.json({ error: "活动不存在" }, { status: 404 });

  // 聚合统计
  const coupons = campaign.coupons;
  const totalClaims = coupons.reduce((s, c) => s + c.claimedCount, 0);
  const totalUsed = coupons.reduce((s, c) => s + c.usedCount, 0);
  const activeCoupons = coupons.filter(c => c.status === "published").length;
  const totalValue = coupons.reduce((s, c) => s + c.valueCents * c.claimedCount, 0);

  // 按日聚合领取趋势
  const claimMap: Record<string, number> = {};
  coupons.forEach(c => c.claims.forEach(cl => {
    const day = cl.claimedAt.toISOString().slice(0, 10);
    claimMap[day] = (claimMap[day] || 0) + 1;
  }));
  const dailyClaims = Object.entries(claimMap).sort().map(([date, count]) => ({ date, count }));

  return NextResponse.json({
    data: {
      ...campaign,
      stats: { totalClaims, totalUsed, activeCoupons, totalValue, rate: totalClaims > 0 ? Math.round((totalUsed / totalClaims) * 100) : 0, dailyClaims: dailyClaims.slice(-14) },
    },
  });
}

// PUT /api/business/campaigns/[id] — 更新
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "403" }, { status: 403 });

  const { id } = await params;
  const { prisma } = await import("@/lib/db");
  const body = await request.json();

  const updated = await prisma.campaign.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
      ...(body.tags !== undefined ? { tags: JSON.stringify(body.tags) } : {}),
      ...(body.startDate ? { startDate: new Date(body.startDate) } : {}),
      ...(body.endDate ? { endDate: new Date(body.endDate) } : {}),
      ...(body.drawDate !== undefined ? { drawDate: body.drawDate ? new Date(body.drawDate) : null } : {}),
      ...(body.minSpendCents !== undefined ? { minSpendCents: body.minSpendCents } : {}),
      ...(body.maxEntries !== undefined ? { maxEntries: body.maxEntries } : {}),
      ...(body.drawMethod !== undefined ? { drawMethod: body.drawMethod } : {}),
      ...(body.couponCount !== undefined ? { couponCount: body.couponCount } : {}),
      ...(body.totalClaims !== undefined ? { totalClaims: body.totalClaims } : {}),
      ...(body.totalRedemptions !== undefined ? { totalRedemptions: body.totalRedemptions } : {}),
    },
  });

  return NextResponse.json({ data: updated });
}

// DELETE /api/business/campaigns/[id] — 删除 (仅draft)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "403" }, { status: 403 });

  const { id } = await params;
  const { prisma } = await import("@/lib/db");

  const campaign = await prisma.campaign.findFirst({ where: { id, businessId: session.userId } });
  if (!campaign) return NextResponse.json({ error: "404" }, { status: 404 });
  if (campaign.status === "active") return NextResponse.json({ error: "进行中的活动不可删除" }, { status: 400 });

  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ data: { success: true } });
}

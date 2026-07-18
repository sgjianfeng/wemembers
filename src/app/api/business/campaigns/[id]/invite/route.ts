import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/business/campaigns/[id]/invite
 * Initiator invites partner businesses to sell + redeem together.
 * Body: { partnerBusinessIds: string[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { getSession } = await import("@/lib/auth");
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const { id } = await params;
    const { prisma } = await import("@/lib/db");
    const body = await request.json();
    const partnerBusinessIds: string[] = Array.isArray(body.partnerBusinessIds)
      ? body.partnerBusinessIds.filter((x: unknown) => typeof x === "string")
      : [];

    if (partnerBusinessIds.length === 0) {
      return NextResponse.json({ error: "请选择合作伙伴" }, { status: 400 });
    }

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      return NextResponse.json({ error: "活动不存在" }, { status: 404 });
    }
    if (campaign.businessId !== session.userId) {
      return NextResponse.json({ error: "仅发起方可邀请" }, { status: 403 });
    }

    const partners = await prisma.user.findMany({
      where: {
        id: { in: partnerBusinessIds },
        role: "business",
        NOT: { id: session.userId },
      },
      select: { id: true },
    });
    if (partners.length === 0) {
      return NextResponse.json({ error: "未找到有效伙伴" }, { status: 400 });
    }

    const partnerIds = partners.map((p) => p.id);
    const partnerStores = await prisma.store.findMany({
      where: { businessId: { in: partnerIds } },
      select: { id: true, businessId: true },
    });

    let currentPartners: string[] = [];
    let currentStores: string[] = [];
    try {
      currentPartners = JSON.parse(campaign.partnerIds || "[]");
    } catch {
      /* ignore */
    }
    try {
      currentStores = JSON.parse(campaign.storeIds || "[]");
    } catch {
      /* ignore */
    }

    const nextPartners = Array.from(new Set([...currentPartners, ...partnerIds]));
    const nextStores = Array.from(
      new Set([...currentStores, ...partnerStores.map((s) => s.id)])
    );

    // Ensure initiator stores still included
    const myStores = await prisma.store.findMany({
      where: { businessId: session.userId },
      select: { id: true },
    });
    for (const s of myStores) {
      if (!nextStores.includes(s.id)) nextStores.push(s.id);
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data: {
        partnerIds: JSON.stringify(nextPartners),
        storeIds: JSON.stringify(nextStores),
        joinCount: nextPartners.length,
        allowCollaboration: true,
      },
    });

    // Best-effort: partnership rows for cross-store redeem eligibility
    for (const pid of partnerIds) {
      const existing = await prisma.businessPartner.findFirst({
        where: {
          OR: [
            { businessId: session.userId, partnerId: pid },
            { businessId: pid, partnerId: session.userId },
          ],
        },
      });
      if (!existing) {
        await prisma.businessPartner.create({
          data: {
            businessId: session.userId,
            partnerId: pid,
            source: "invite",
            status: "active",
          },
        });
      } else if (existing.status !== "active") {
        await prisma.businessPartner.update({
          where: { id: existing.id },
          data: { status: "active" },
        });
      }
    }

    return NextResponse.json({
      data: {
        campaignId: updated.id,
        partnerIds: nextPartners,
        storeCount: nextStores.length,
        invited: partnerIds,
      },
    });
  } catch (error) {
    console.error("campaign invite error:", error);
    return NextResponse.json({ error: "邀请失败" }, { status: 500 });
  }
}

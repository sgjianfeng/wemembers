import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/business/campaigns/[id]/requests
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "活动不存在" }, { status: 404 });

  const isOwner = campaign.businessId === session.userId;
  if (!isOwner && session.role !== "admin") {
    return NextResponse.json({ error: "无权查看" }, { status: 403 });
  }

  const requests = await prisma.campaignJoinRequest.findMany({
    where: isOwner ? { campaignId: id } : { campaignId: id, businessId: session.userId },
    include: {
      store: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: requests });
}

// POST /api/business/campaigns/[id]/requests — 申请加入活动
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id } = await params;
  const { storeIds, message } = await request.json();
  if (!storeIds || !Array.isArray(storeIds) || storeIds.length === 0) {
    return NextResponse.json({ error: "请选择至少一个门店" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "活动不存在" }, { status: 404 });
  if (!campaign.joinable) return NextResponse.json({ error: "该活动不支持申请加入" }, { status: 400 });
  if (campaign.status !== "active") return NextResponse.json({ error: "活动已结束" }, { status: 400 });

  const created = [];
  for (const storeId of storeIds) {
    const store = await prisma.store.findFirst({
      where: { id: storeId, businessId: session.userId },
    });
    if (!store) continue;

    const existing = await prisma.campaignJoinRequest.findUnique({
      where: { campaignId_storeId: { campaignId: id, storeId } },
    });
    if (existing) continue;

    const req = await prisma.campaignJoinRequest.create({
      data: {
        campaignId: id,
        storeId,
        businessId: session.userId,
        message: message || null,
      },
      include: { store: { select: { name: true } } },
    });
    created.push(req);
  }

  return NextResponse.json({ data: created });
}

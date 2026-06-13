import { NextRequest, NextResponse } from "next/server";

// GET /api/business/campaigns/[id]/entries
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id } = await params;
  const { prisma } = await import("@/lib/db");

  const entries = await prisma.luckyDrawEntry.findMany({
    where: { campaignId: id },
    include: {
      customer: { select: { displayName: true, phone: true } },
      store: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ data: entries });
}

// POST /api/business/campaigns/[id]/entries — 手动录入
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id } = await params;
  const { prisma } = await import("@/lib/db");
  const { name, phone } = await request.json();

  if (!name || !phone) {
    return NextResponse.json({ error: "请填写姓名和手机号" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findFirst({
    where: { id, businessId: session.userId },
  });
  if (!campaign) return NextResponse.json({ error: "活动不存在" }, { status: 404 });
  if (campaign.type !== "lucky_draw") return NextResponse.json({ error: "非抽奖活动" }, { status: 400 });

  // Check max entries
  if (campaign.maxEntries) {
    const currentCount = await prisma.luckyDrawEntry.count({ where: { campaignId: id } });
    if (currentCount >= campaign.maxEntries) {
      return NextResponse.json({ error: "已达参与人数上限" }, { status: 400 });
    }
  }

  // 尝试匹配已有用户
  const existingUser = await prisma.user.findUnique({ where: { phone } });

  const entry = await prisma.luckyDrawEntry.create({
    data: {
      campaignId: id,
      customerId: existingUser?.id || null,
      storeId: session.storeId || null,
      name,
      phone,
      source: "manual",
    },
  });

  await prisma.campaign.update({
    where: { id },
    data: { entryCount: { increment: 1 } },
  });

  return NextResponse.json({ data: entry });
}

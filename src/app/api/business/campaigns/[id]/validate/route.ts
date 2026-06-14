import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// POST /api/business/campaigns/[id]/validate — 审核收据
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id: campaignId } = await params;
  const { entryId, action } = await request.json(); // "approve" | "reject"

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, businessId: session.userId },
  });
  if (!campaign) return NextResponse.json({ error: "活动不存在" }, { status: 404 });

  const entry = await prisma.luckyDrawEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.campaignId !== campaignId || entry.source !== "receipt") {
    return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  }

  // 拒绝：删除所有券
  if (action === "reject") {
    await prisma.drawTicket.deleteMany({ where: { entryId } });
    await prisma.luckyDrawEntry.delete({ where: { id: entryId } });
    return NextResponse.json({ data: { success: true, action: "rejected" } });
  }

  // 批准：状态更新
  await prisma.luckyDrawEntry.update({
    where: { id: entryId },
    data: { source: "receipt" }, // stays
  });

  return NextResponse.json({ data: { success: true, action: "approved" } });
}

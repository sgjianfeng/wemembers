import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// PUT /api/business/campaigns/[id]/requests/[reqId] — 审批申请
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reqId: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id: campaignId, reqId } = await params;
  const { action } = await request.json(); // "approve" | "reject"

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.businessId !== session.userId) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const joinReq = await prisma.campaignJoinRequest.findUnique({ where: { id: reqId } });
  if (!joinReq || joinReq.campaignId !== campaignId) {
    return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  }
  if (joinReq.status !== "pending") {
    return NextResponse.json({ error: "该申请已处理" }, { status: 400 });
  }

  const status = action === "approve" ? "approved" : "rejected";

  await prisma.campaignJoinRequest.update({
    where: { id: reqId },
    data: { status, reviewedAt: new Date() },
  });

  if (action === "approve") {
    // 将该门店加入活动 storeIds
    let currentIds: string[] = [];
    try { currentIds = JSON.parse(campaign.storeIds || "[]"); } catch {}
    if (!currentIds.includes(joinReq.storeId)) {
      currentIds.push(joinReq.storeId);
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { storeIds: JSON.stringify(currentIds) },
      });
    }
  }

  return NextResponse.json({ data: { success: true, status } });
}

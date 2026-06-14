import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// PUT /api/business/partners/[id] — 接受/拒绝/撤销合作
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id } = await params;
  const { action } = await request.json(); // "approve" | "reject" | "revoke"

  const partnership = await prisma.businessPartner.findUnique({ where: { id } });
  if (!partnership) return NextResponse.json({ error: "关系不存在" }, { status: 404 });

  const isInitiator = partnership.businessId === session.userId;
  const isReceiver = partnership.partnerId === session.userId;

  const statusMap: Record<string, { status: string; allowed: boolean }> = {
    approve: { status: "active", allowed: isReceiver && partnership.status === "pending" },
    reject: { status: "rejected", allowed: (isInitiator || isReceiver) && partnership.status === "pending" },
    revoke: { status: "revoked", allowed: (isInitiator || isReceiver) && partnership.status === "active" },
  };

  const actionCfg = statusMap[action];
  if (!actionCfg) return NextResponse.json({ error: "无效操作" }, { status: 400 });
  if (!actionCfg.allowed) return NextResponse.json({ error: "无权执行此操作" }, { status: 403 });

  const updated = await prisma.businessPartner.update({
    where: { id },
    data: { status: actionCfg.status, updatedAt: new Date() },
  });

  return NextResponse.json({ data: updated });
}

import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function authorized(req: NextRequest): boolean {
  const supplied = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1]?.trim();
  const expected = process.env.WEMEMBERS_NEXUSWORK_TOKEN;
  if (!supplied || !expected) return false;
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "集成凭据无效" }, { status: 401 });
  const body = await req.json();
  const { taskCardId, requestId, decision, reviewedBy, reviewNote } = body as Record<string, unknown>;
  if (typeof taskCardId !== "string" || typeof requestId !== "string" || (decision !== "approved" && decision !== "rejected") || typeof reviewedBy !== "string") {
    return NextResponse.json({ error: "请求格式不对" }, { status: 400 });
  }
  const join = await prisma.campaignJoinRequest.findUnique({ where: { id: requestId }, include: { campaign: { select: { id: true, storeIds: true } } } });
  if (!join || (join.nwTaskCardId && join.nwTaskCardId !== taskCardId)) return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  if (join.status !== "pending") {
    if (join.status === decision && join.nwTaskCardId === taskCardId) return NextResponse.json({ data: { status: join.status, skipped: true } });
    return NextResponse.json({ error: "申请已经由另一决策处理" }, { status: 409 });
  }
  await prisma.$transaction(async (tx) => {
    await tx.campaignJoinRequest.update({ where: { id: join.id }, data: { status: decision, reviewedAt: new Date(), reviewedBy: reviewedBy.slice(0, 200), reviewNote: typeof reviewNote === "string" ? reviewNote.slice(0, 1000) : null, nwTaskCardId: taskCardId } });
    if (decision === "approved") {
      let ids: string[] = [];
      try { ids = JSON.parse(join.campaign.storeIds || "[]"); } catch {}
      if (!ids.includes(join.storeId)) await tx.campaign.update({ where: { id: join.campaign.id }, data: { storeIds: JSON.stringify([...ids, join.storeId]) } });
    }
  });
  return NextResponse.json({ data: { status: decision, skipped: false } });
}

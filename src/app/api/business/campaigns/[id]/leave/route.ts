import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;

  const result = await prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findUnique({ where: { id } });
    if (!campaign) {
      return { error: "活动不存在", status: 404 as const };
    }

    const myStores = await tx.store.findMany({
      where: { businessId: session.userId },
      select: { id: true },
    });
    const myStoreIds = myStores.map((s) => s.id);

    let currentStoreIds: string[] = [];
    try { currentStoreIds = JSON.parse(campaign.storeIds || "[]"); } catch {}

    const updatedStoreIds = currentStoreIds.filter((sid) => !myStoreIds.includes(sid));

    if (updatedStoreIds.length === currentStoreIds.length) {
      return { error: "未参与该活动", status: 400 as const };
    }

    await tx.campaign.update({
      where: { id },
      data: {
        storeIds: JSON.stringify(updatedStoreIds),
        joinCount: { decrement: 1 },
      },
    });

    return { data: { status: "left" } };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}

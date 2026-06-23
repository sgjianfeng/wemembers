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
    if (!campaign || !campaign.joinable || campaign.status !== "active") {
      return { error: "活动不可参与", status: 400 as const };
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (today > campaign.endDate) {
      return { error: "活动已结束", status: 400 as const };
    }

    const myStores = await tx.store.findMany({
      where: { businessId: session.userId },
      select: { id: true },
    });
    const myStoreIds = myStores.map((s) => s.id);

    if (myStoreIds.length === 0) {
      return { error: "请先创建门店", status: 400 as const };
    }

    let currentStoreIds: string[] = [];
    try { currentStoreIds = JSON.parse(campaign.storeIds || "[]"); } catch {}

    if (myStoreIds.some((sid) => currentStoreIds.includes(sid))) {
      return { error: "已参与该活动", status: 409 as const };
    }

    const updatedStoreIds = [...currentStoreIds, ...myStoreIds];

    await tx.campaign.update({
      where: { id },
      data: {
        storeIds: JSON.stringify(updatedStoreIds),
        joinCount: { increment: 1 },
      },
    });

    return { data: { status: "joined", storeCount: myStoreIds.length } };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}

import { NextRequest, NextResponse } from "next/server";

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
  const { prisma } = await import("@/lib/db");

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign || !campaign.joinable || campaign.status !== "active") {
    return NextResponse.json({ error: "活动不可参与" }, { status: 400 });
  }
  if (new Date() > campaign.endDate) {
    return NextResponse.json({ error: "活动已结束" }, { status: 400 });
  }

  const myStores = await prisma.store.findMany({
    where: { businessId: session.userId },
    select: { id: true },
  });
  const myStoreIds = myStores.map((s) => s.id);

  let currentStoreIds: string[] = [];
  try { currentStoreIds = JSON.parse(campaign.storeIds || "[]"); } catch {}

  if (myStoreIds.some((sid) => currentStoreIds.includes(sid))) {
    return NextResponse.json({ error: "已参与该活动" }, { status: 409 });
  }

  const updatedStoreIds = [...currentStoreIds, ...myStoreIds];

  await prisma.campaign.update({
    where: { id },
    data: {
      storeIds: JSON.stringify(updatedStoreIds),
      joinCount: { increment: 1 },
    },
  });

  return NextResponse.json({ data: { status: "joined", storeCount: myStoreIds.length } });
}

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
  if (!campaign) {
    return NextResponse.json({ error: "活动不存在" }, { status: 404 });
  }

  const myStores = await prisma.store.findMany({
    where: { businessId: session.userId },
    select: { id: true },
  });
  const myStoreIds = myStores.map((s) => s.id);

  let currentStoreIds: string[] = [];
  try { currentStoreIds = JSON.parse(campaign.storeIds || "[]"); } catch {}

  const updatedStoreIds = currentStoreIds.filter((sid) => !myStoreIds.includes(sid));

  if (updatedStoreIds.length === currentStoreIds.length) {
    return NextResponse.json({ error: "未参与该活动" }, { status: 400 });
  }

  await prisma.campaign.update({
    where: { id },
    data: {
      storeIds: JSON.stringify(updatedStoreIds),
      joinCount: { decrement: 1 },
    },
  });

  return NextResponse.json({ data: { status: "left" } });
}

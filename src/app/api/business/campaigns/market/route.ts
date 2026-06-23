import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { prisma } = await import("@/lib/db");
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";

  const campaigns = await prisma.campaign.findMany({
    where: {
      joinable: true,
      status: "active",
      endDate: { gte: new Date() },
      businessId: { not: session.userId },
      ...(search ? { name: { contains: search } } : {}),
    },
    include: {
      business: { select: { businessName: true, businessSlug: true } },
      prizes: { select: { id: true, name: true, icon: true, valueCents: true }, orderBy: { weight: "desc" }, take: 3 },
    },
    orderBy: { joinCount: "desc" },
  });

  // Mark which campaigns this business has already joined
  const myStores = await prisma.store.findMany({
    where: { businessId: session.userId },
    select: { id: true },
  });
  const myStoreIds = myStores.map((s) => s.id);

  const data = campaigns.map((c) => {
    let storeIds: string[] = [];
    try { storeIds = JSON.parse(c.storeIds || "[]"); } catch {}
    const isJoined = myStoreIds.some((sid) => storeIds.includes(sid));

    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      color: c.color,
      description: c.description,
      business: c.business,
      prizeCount: c.prizes.length,
      topPrize: c.prizes[0] || null,
      instantPoolCents: c.instantPoolCents || 0,
      participantCount: c.joinCount || 0,
      endDate: c.endDate.toISOString(),
      myStatus: isJoined ? "joined" : null,
    };
  });

  return NextResponse.json({ data });
}

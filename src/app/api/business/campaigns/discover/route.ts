import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/business/campaigns/discover — 可参与的活动列表
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

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
      business: { select: { businessName: true, businessCategory: true } },
      prizes: { select: { id: true, name: true } },
    },
    orderBy: { entryCount: "desc" },
  });

  // 标记已申请的状态
  const myStores = await prisma.store.findMany({
    where: { businessId: session.userId },
    select: { id: true },
  });
  const myStoreIds = myStores.map((s) => s.id);

  const requests = await prisma.campaignJoinRequest.findMany({
    where: { storeId: { in: myStoreIds } },
    select: { campaignId: true, storeId: true, status: true },
  });

  const data = campaigns.map((c) => {
    const myReqs = requests.filter((r) => r.campaignId === c.id);
    const appliedCount = myReqs.length;
    const approvedCount = myReqs.filter((r) => r.status === "approved").length;
    return {
      ...c,
      appliedCount,
      approvedCount,
      hasPending: myReqs.some((r) => r.status === "pending"),
    };
  });

  return NextResponse.json({ data });
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SERVICE_CATEGORIES } from "@/types";

// GET /api/business/partners/discover — 搜索可合作的商家
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";

  const businesses = await prisma.user.findMany({
    where: {
      role: "business",
      status: "active",
      id: { not: session.userId },
      ...(search
        ? { businessName: { contains: search } }
        : {}),
    },
    select: {
      id: true,
      businessName: true,
      businessCategory: true,
      businessSlug: true,
      businessLogo: true,
      createdAt: true,
    },
    take: 20,
    orderBy: { createdAt: "desc" },
  });

  // 获取已存在的合作关系
  const existing = await prisma.businessPartner.findMany({
    where: {
      OR: [
        { businessId: session.userId },
        { partnerId: session.userId },
      ],
    },
    select: { businessId: true, partnerId: true, status: true, source: true },
  });

  const businessesWithStatus = businesses.map((b) => {
    const rel = existing.find(
      (e) => e.businessId === b.id || e.partnerId === b.id
    );
    return {
      ...b,
      categoryLabel: SERVICE_CATEGORIES.find((c) => c.value === b.businessCategory)?.label,
      partnership: rel || null,
    };
  });

  return NextResponse.json({ data: businessesWithStatus });
}

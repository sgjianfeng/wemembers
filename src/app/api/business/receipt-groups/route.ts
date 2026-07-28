import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveBusinessActor } from "@/lib/business-actor";

// 4 个预设群（首次访问时懒创建）
const PRESET_GROUPS = [
  { category: "purchase", name: "采购群", icon: "📦", sortOrder: 1 },
  { category: "customer_sale", name: "小票群", icon: "🧾", sortOrder: 2 },
  { category: "platform", name: "外卖对账群", icon: "🛵", sortOrder: 3 },
  { category: "expense", name: "报销群", icon: "🔒", sortOrder: 4, visibleRoles: "business" },
];

// GET /api/business/receipt-groups — 列出本商家的群（无则懒创建预设）
export async function GET() {
  const session = await getSession();
  const actor = await resolveBusinessActor(session);
  if (!actor) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  let groups = await prisma.receiptGroup.findMany({
    where: { businessId: actor.businessId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  if (groups.length === 0) {
    await prisma.receiptGroup.createMany({
      data: PRESET_GROUPS.map((g) => ({
        businessId: actor.businessId,
        name: g.name,
        category: g.category,
        icon: g.icon,
        isPreset: true,
        sortOrder: g.sortOrder,
        visibleRoles: g.visibleRoles ?? "business,staff",
      })),
    });
    groups = await prisma.receiptGroup.findMany({
      where: { businessId: actor.businessId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  // 店员：只看 visibleRoles 含 staff 的群
  if (actor.role === "staff") {
    groups = groups.filter((g) => {
      const roles = (g.visibleRoles || "business,staff").split(",");
      return roles.map((r) => r.trim()).includes("staff");
    });
  }

  return NextResponse.json({ data: groups });
}

// POST /api/business/receipt-groups — 创建自定义群（仅企业主）
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "仅企业主可创建资料群" }, { status: 403 });
  }

  const { name, icon, storeId, visibleRoles } = await request.json();
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "请填写群名称" }, { status: 400 });
  }

  // 归属校验：storeId 必须属于本商家
  if (storeId) {
    const store = await prisma.store.findFirst({
      where: { id: storeId, businessId: session.userId },
    });
    if (!store) {
      return NextResponse.json({ error: "门店不存在" }, { status: 404 });
    }
  }

  const maxSort = await prisma.receiptGroup.aggregate({
    where: { businessId: session.userId },
    _max: { sortOrder: true },
  });

  const group = await prisma.receiptGroup.create({
    data: {
      businessId: session.userId,
      name: name.trim(),
      icon: icon || "💬",
      category: "custom",
      isPreset: false,
      storeId: storeId || null,
      visibleRoles: visibleRoles || "business",
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
  });

  return NextResponse.json({ data: group });
}

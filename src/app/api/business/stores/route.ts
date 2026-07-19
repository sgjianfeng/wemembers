import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/business/stores
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const stores = await prisma.store.findMany({
    where: { businessId: session.userId },
    include: {
      staff: { select: { id: true, displayName: true, phone: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ data: stores });
}

// POST /api/business/stores
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { name, address, phone } = await request.json();
  if (!name) return NextResponse.json({ error: "请填写门店名称" }, { status: 400 });

  const { makeBusinessSlug } = await import("@/lib/utils");
  let slug = makeBusinessSlug(name);
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.store.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!exists) break;
    slug = makeBusinessSlug(name);
  }

  const store = await prisma.store.create({
    data: {
      businessId: session.userId,
      name,
      slug,
      address: address || null,
      phone: phone || null,
    },
  });

  return NextResponse.json({ data: store });
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SERVICE_CATEGORIES } from "@/types";

// GET /api/business/partners — 合作伙伴列表
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") || "active"; // active | pending | all
  const role = searchParams.get("role") || ""; // initiator | receiver

  const whereBase = role === "initiator"
    ? { businessId: session.userId }
    : role === "receiver"
    ? { partnerId: session.userId }
    : { OR: [{ businessId: session.userId }, { partnerId: session.userId }] };

  const statusFilter = filter === "pending"
    ? { status: "pending" }
    : filter === "active"
    ? { status: "active" }
    : {};

  const partnerships = await prisma.businessPartner.findMany({
    where: { ...whereBase, ...statusFilter },
    include: {
      business: { select: { id: true, businessName: true, businessCategory: true, businessSlug: true } },
      partner: { select: { id: true, businessName: true, businessCategory: true, businessSlug: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ data: partnerships });
}

// POST /api/business/partners — 邀请商家
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { partnerId, message } = await request.json();
  if (!partnerId) return NextResponse.json({ error: "请选择要邀请的商家" }, { status: 400 });

  const existing = await prisma.businessPartner.findUnique({
    where: { businessId_partnerId: { businessId: session.userId, partnerId } },
  });
  if (existing) return NextResponse.json({ error: "已存在合作关系或申请" }, { status: 409 });

  const p = await prisma.businessPartner.create({
    data: { businessId: session.userId, partnerId, source: "invite", message: message || null, status: "pending" },
    include: {
      business: { select: { businessName: true } },
      partner: { select: { businessName: true } },
    },
  });

  return NextResponse.json({ data: p });
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/business/coupons/[id] — 券详情
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "无权操作" }, { status: 403 });

  const { id } = await params;
  const coupon = await prisma.coupon.findFirst({ where: { id, businessId: session.userId } });
  if (!coupon) return NextResponse.json({ error: "券不存在" }, { status: 404 });

  return NextResponse.json({ data: coupon });
}

// PUT /api/business/coupons/[id] — 编辑券
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "无权操作" }, { status: 403 });

  const { id } = await params;
  const coupon = await prisma.coupon.findFirst({ where: { id, businessId: session.userId } });
  if (!coupon) return NextResponse.json({ error: "券不存在" }, { status: 404 });

  const body = await request.json();
  const updated = await prisma.coupon.update({ where: { id }, data: body });
  return NextResponse.json({ data: updated });
}

// PATCH /api/business/coupons/[id] — 快捷状态切换
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "无权操作" }, { status: 403 });

  const { id } = await params;
  const { status } = await request.json();
  if (!["published", "paused", "ended"].includes(status)) return NextResponse.json({ error: "无效状态" }, { status: 400 });

  const updated = await prisma.coupon.update({ where: { id }, data: { status } });
  return NextResponse.json({ data: updated });
}

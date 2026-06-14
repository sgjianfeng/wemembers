import { NextRequest, NextResponse } from "next/server";

// GET /api/business/campaigns — 活动列表
export async function GET(request: NextRequest) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "403" }, { status: 403 });

  const { prisma } = await import("@/lib/db");
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;

  const where: any = { businessId: session.userId };
  if (status) where.status = status;

  const campaigns = await prisma.campaign.findMany({
    where,
    include: { coupons: { select: { id: true, title: true, claimedCount: true, usedCount: true, status: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: campaigns });
}

// POST /api/business/campaigns — 创建活动
export async function POST(request: NextRequest) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "403" }, { status: 403 });

  const { prisma } = await import("@/lib/db");
  const body = await request.json();
  const { name, description, type, color, startDate, endDate, budgetCents, tags, drawDate, minSpendCents, maxEntries, drawMethod, entryMethod, receiptMinSpend, ticketsPerUnit, budgetPercent, slug, joinable, allowCollaboration } = body;

  if (!name || !startDate || !endDate) return NextResponse.json({ error: "请填写活动名称和时间" }, { status: 400 });

  const campaign = await prisma.campaign.create({
    data: {
      businessId: session.userId,
      name,
      description: description || null,
      type: type || "promotion",
      color: color || null,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      drawDate: drawDate ? new Date(drawDate) : null,
      minSpendCents: minSpendCents || null,
      maxEntries: maxEntries || null,
      drawMethod: drawMethod || "weighted",
      entryMethod: entryMethod || "auto",
      receiptMinSpend: receiptMinSpend || null,
      ticketsPerUnit: ticketsPerUnit || 1,
      budgetPercent: budgetPercent || 20,
      slug: slug || null,
      joinable: joinable || false,
      allowCollaboration: allowCollaboration || false,
      budgetCents: budgetCents || null,
      tags: tags ? JSON.stringify(tags) : "[]",
      status: new Date(startDate) <= new Date() ? "active" : "draft",
    },
  });

  return NextResponse.json({ data: campaign });
}

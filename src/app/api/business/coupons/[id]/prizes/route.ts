import { NextRequest, NextResponse } from "next/server";

// GET /api/business/coupons/[id]/prizes — 获取奖池
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "403" }, { status: 403 });

  const { id } = await params;
  const { prisma } = await import("@/lib/db");
  const prizes = await prisma.lotteryPrize.findMany({ where: { couponId: id }, orderBy: { weight: "desc" } });
  return NextResponse.json({ data: prizes });
}

// POST /api/business/coupons/[id]/prizes — 设置奖池
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "403" }, { status: 403 });

  const { id } = await params;
  const { prisma } = await import("@/lib/db");
  const { prizes } = await request.json(); // [{name,icon,type,valueCents,weight,totalStock}]

  if (!prizes || !Array.isArray(prizes) || prizes.length === 0) {
    return NextResponse.json({ error: "请至少添加一个奖品" }, { status: 400 });
  }

  // 清除旧奖池
  await prisma.lotteryPrize.deleteMany({ where: { couponId: id } });

  // 创建新奖池
  const created = await Promise.all(
    prizes.map((p: any) =>
      prisma.lotteryPrize.create({
        data: {
          couponId: id,
          name: p.name,
          icon: p.icon || "🎁",
          type: p.type || "item",
          valueCents: p.valueCents || 0,
          weight: p.weight || 10,
          totalStock: p.totalStock || null,
          remainingStock: p.totalStock || null,
        },
      })
    )
  );

  return NextResponse.json({ data: created });
}

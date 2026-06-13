import { NextRequest, NextResponse } from "next/server";

// GET /api/business/campaigns/[id]/prizes
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id } = await params;
  const { prisma } = await import("@/lib/db");

  const prizes = await prisma.lotteryPrize.findMany({
    where: { campaignId: id },
    orderBy: { weight: "desc" },
  });

  return NextResponse.json({ data: prizes });
}

// PUT /api/business/campaigns/[id]/prizes — 设置奖池
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id } = await params;
  const { prisma } = await import("@/lib/db");
  const { prizes } = await request.json();

  if (!Array.isArray(prizes)) {
    return NextResponse.json({ error: "无效的奖池数据" }, { status: 400 });
  }

  // 删除旧奖池、创建新的
  await prisma.lotteryPrize.deleteMany({ where: { campaignId: id } });

  const created = await Promise.all(
    prizes.map((p: { name: string; icon?: string; type?: string; valueCents?: number; weight?: number; totalStock?: number | null }) =>
      prisma.lotteryPrize.create({
        data: {
          campaignId: id,
          name: p.name,
          icon: p.icon || "🎁",
          type: p.type || "item",
          valueCents: p.valueCents || 0,
          weight: p.weight || 10,
          totalStock: p.totalStock ?? null,
          remainingStock: p.totalStock ?? null,
        },
      })
    )
  );

  return NextResponse.json({ data: created });
}

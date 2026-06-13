import { NextRequest, NextResponse } from "next/server";

// POST /api/business/campaigns/[id]/draw — 执行开奖
export async function POST(
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

  const campaign = await prisma.campaign.findFirst({
    where: { id, businessId: session.userId },
    include: { prizes: true },
  });

  if (!campaign) return NextResponse.json({ error: "活动不存在" }, { status: 404 });
  if (campaign.type !== "lucky_draw") return NextResponse.json({ error: "非抽奖活动" }, { status: 400 });
  if (campaign.status === "ended") return NextResponse.json({ error: "活动已结束" }, { status: 400 });

  // 获取所有未中奖的参与记录
  const entries = await prisma.luckyDrawEntry.findMany({
    where: { campaignId: id, won: false },
  });

  if (entries.length === 0) {
    return NextResponse.json({ error: "没有可抽奖的参与者" }, { status: 400 });
  }

  // 获取有库存的奖品
  const prizes = campaign.prizes.filter(
    (p) => p.remainingStock === null || (p.remainingStock && p.remainingStock > 0)
  );

  if (prizes.length === 0) {
    return NextResponse.json({ error: "没有可用的奖品" }, { status: 400 });
  }

  // 计算总权重
  const totalWeight = prizes.reduce((s, p) => s + p.weight, 0);

  // 为每个参与者抽奖
  const results: { entryId: string; won: boolean; prizeName?: string; prizeIcon?: string }[] = [];

  for (const entry of entries) {
    let rand = Math.random() * totalWeight;
    let winner = prizes[0];

    for (const prize of prizes) {
      rand -= prize.weight;
      if (rand <= 0) {
        winner = prize;
        break;
      }
    }

    // 50% 概率中奖（可调整）
    const won = Math.random() < 0.5;

    if (won && winner) {
      // 扣库存
      if (winner.remainingStock !== null) {
        await prisma.lotteryPrize.update({
          where: { id: winner.id },
          data: {
            remainingStock: { decrement: 1 },
            claimed: { increment: 1 },
          },
        });
      } else {
        await prisma.lotteryPrize.update({
          where: { id: winner.id },
          data: { claimed: { increment: 1 } },
        });
      }

      await prisma.luckyDrawEntry.update({
        where: { id: entry.id },
        data: {
          won: true,
          prizeName: winner.name,
          prizeIcon: winner.icon,
        },
      });

      results.push({
        entryId: entry.id,
        won: true,
        prizeName: winner.name,
        prizeIcon: winner.icon,
      });
    } else {
      results.push({ entryId: entry.id, won: false });
    }
  }

  // 更新活动状态为 ended
  await prisma.campaign.update({
    where: { id },
    data: { status: "ended" },
  });

  const wonCount = results.filter((r) => r.won).length;

  return NextResponse.json({
    data: {
      totalEntries: entries.length,
      wonCount,
      results,
    },
  });
}

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

  const prizes = campaign.prizes.filter(
    (p) => p.remainingStock === null || (p.remainingStock && p.remainingStock > 0)
  );

  if (prizes.length === 0) {
    return NextResponse.json({ error: "没有可用的奖品" }, { status: 400 });
  }

  const isReceiptMode = campaign.entryMethod === "receipt";
  const totalWeight = prizes.reduce((s, p) => s + p.weight, 0);

  let results: { entryId?: string; ticketNo?: string; won: boolean; prizeName?: string; prizeIcon?: string }[] = [];
  let wonCount = 0;

  if (isReceiptMode) {
    // 收据抽奖模式：每张券独立抽
    const tickets = await prisma.drawTicket.findMany({
      where: { campaignId: id, won: false },
    });

    if (tickets.length === 0) {
      return NextResponse.json({ error: "没有可抽奖的券" }, { status: 400 });
    }

    for (const ticket of tickets) {
      let rand = Math.random() * totalWeight;
      let winner = prizes[0];

      for (const prize of prizes) {
        rand -= prize.weight;
        if (rand <= 0) { winner = prize; break; }
      }

      // 用权重决定中奖（权重越大越容易中）
      const won = Math.random() < (winner.weight / (totalWeight + winner.weight));

      if (won && winner) {
        if (winner.remainingStock !== null) {
          await prisma.lotteryPrize.update({
            where: { id: winner.id },
            data: { remainingStock: { decrement: 1 }, claimed: { increment: 1 } },
          });
        } else {
          await prisma.lotteryPrize.update({
            where: { id: winner.id },
            data: { claimed: { increment: 1 } },
          });
        }

        await prisma.drawTicket.update({
          where: { id: ticket.id },
          data: { won: true, prizeName: winner.name, prizeIcon: winner.icon },
        });

        results.push({ ticketNo: ticket.ticketNo, won: true, prizeName: winner.name, prizeIcon: winner.icon });
        wonCount++;
      } else {
        results.push({ ticketNo: ticket.ticketNo, won: false });
      }
    }

    // 批量标记 entry won
    const wonTicketNos = results.filter((r) => r.won).map((r) => r.ticketNo!).filter(Boolean);
    const wonTickets = await prisma.drawTicket.findMany({
      where: { ticketNo: { in: wonTicketNos } },
      select: { entryId: true },
    });
    const wonEntryIds = [...new Set(wonTickets.map((t) => t.entryId))];
    await prisma.luckyDrawEntry.updateMany({
      where: { id: { in: wonEntryIds } },
      data: { won: true, prizeName: "详见券号", prizeIcon: "💎" },
    });

  } else {
    // 自动/手动模式：每个 entry 抽一次
    const entries = await prisma.luckyDrawEntry.findMany({
      where: { campaignId: id, won: false },
    });

    if (entries.length === 0) {
      return NextResponse.json({ error: "没有可抽奖的参与者" }, { status: 400 });
    }

    for (const entry of entries) {
      let rand = Math.random() * totalWeight;
      let winner = prizes[0];

      for (const prize of prizes) {
        rand -= prize.weight;
        if (rand <= 0) { winner = prize; break; }
      }

      const won = Math.random() < 0.5;

      if (won && winner) {
        if (winner.remainingStock !== null) {
          await prisma.lotteryPrize.update({
            where: { id: winner.id },
            data: { remainingStock: { decrement: 1 }, claimed: { increment: 1 } },
          });
        } else {
          await prisma.lotteryPrize.update({
            where: { id: winner.id },
            data: { claimed: { increment: 1 } },
          });
        }

        await prisma.luckyDrawEntry.update({
          where: { id: entry.id },
          data: { won: true, prizeName: winner.name, prizeIcon: winner.icon },
        });

        results.push({ entryId: entry.id, won: true, prizeName: winner.name, prizeIcon: winner.icon });
        wonCount++;
      } else {
        results.push({ entryId: entry.id, won: false });
      }
    }
  }

  await prisma.campaign.update({
    where: { id },
    data: { status: "ended" },
  });

  return NextResponse.json({
    data: {
      mode: isReceiptMode ? "receipt" : "entry",
      totalDraws: results.length,
      wonCount,
      results,
    },
  });
}

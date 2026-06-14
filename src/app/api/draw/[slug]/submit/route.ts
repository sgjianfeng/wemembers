import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { drawInstant, getGrandPoolEstimate } from "@/lib/draw";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const campaign = await prisma.campaign.findUnique({
    where: { slug, type: "lucky_draw", entryMethod: "receipt" },
  });
  if (!campaign) return NextResponse.json({ error: "活动不存在" }, { status: 404 });
  if (campaign.status !== "active") return NextResponse.json({ error: "活动已结束" }, { status: 400 });
  if (new Date() > campaign.endDate) return NextResponse.json({ error: "活动已结束" }, { status: 400 });

  const { receiptAmount, drawMode } = await request.json(); // drawMode: "instant" | "deferred"
  if (!receiptAmount || receiptAmount <= 0) {
    return NextResponse.json({ error: "请填写消费金额" }, { status: 400 });
  }

  const minSpend = campaign.receiptMinSpend || 5000;
  const ticketsPerUnit = campaign.ticketsPerUnit || 1;
  const ticketCount = Math.floor(receiptAmount / minSpend) * ticketsPerUnit;

  if (ticketCount <= 0) {
    return NextResponse.json({
      error: `消费金额不足，满 S$${(minSpend / 100).toFixed(0)} 才能获得抽奖券`,
    }, { status: 400 });
  }

  // 创建参与记录
  const entry = await prisma.luckyDrawEntry.create({
    data: {
      campaignId: campaign.id,
      customerId: session.userId,
      storeId: session.storeId || null,
      source: "receipt",
      receiptAmount,
      ticketCount,
    },
  });

  // 生成券号 + 即时抽奖
  const existingCount = await prisma.drawTicket.count({ where: { campaignId: campaign.id } });
  const tickets: any[] = [];
  const instantWins: any[] = [];
  let instantWonTotal = 0;

  const mode = drawMode || "deferred";

  // 更新即时奖池
  const spendCents = receiptAmount;
  const budgetPercent = campaign.budgetPercent || 20;
  const newInstantPoolCents = Math.round(spendCents * budgetPercent / 100 * 0.1);
  const instantPoolCents = (campaign.instantPoolCents || 0) + newInstantPoolCents;

  for (let i = 0; i < ticketCount; i++) {
    const ticketNo = `DRAW-${String(existingCount + i + 1).padStart(6, "0")}`;

    if (mode === "instant") {
      // 即时抽
      const result = drawInstant(instantPoolCents);
      const ticket = await prisma.drawTicket.create({
        data: {
          campaignId: campaign.id,
          customerId: session.userId,
          entryId: entry.id,
          ticketNo,
          drawMode: "instant",
          won: result.won,
          prizeName: result.won ? result.prize!.name : null,
          prizeIcon: result.won ? result.prize!.icon : null,
        },
      });
      tickets.push(ticket);
      if (result.won && result.prize) {
        instantWins.push({ ticketNo, prizeName: result.prize.name, prizeIcon: result.prize.icon });
        instantWonTotal += result.prize.valueCents;
      }
    } else {
      // 延迟抽
      await prisma.drawTicket.create({
        data: {
          campaignId: campaign.id,
          customerId: session.userId,
          entryId: entry.id,
          ticketNo,
          drawMode: "deferred",
        },
      });
      tickets.push({ ticketNo, drawMode: "deferred" });
    }
  }

  // 更新 campaign
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      entryCount: { increment: 1 },
      totalTicketCount: { increment: ticketCount },
      instantPoolCents: { increment: newInstantPoolCents },
    },
  });

  // 计算大奖池估值
  const totalSpendSoFar = (campaign.totalTicketCount + ticketCount) * minSpend;
  const pool = getGrandPoolEstimate(totalSpendSoFar, budgetPercent);

  return NextResponse.json({
    data: {
      entry,
      tickets: tickets.map((t: any) =>
        typeof t.ticketNo === "string"
          ? { ticketNo: t.ticketNo, drawMode: t.drawMode, won: t.won, prizeName: t.prizeName, prizeIcon: t.prizeIcon }
          : t
      ),
      ticketCount,
      drawMode: mode,
      instantWins: instantWins.length > 0 ? instantWins : undefined,
      pool: {
        instantPoolCents: instantPoolCents,
        instantPoolSgd: (instantPoolCents / 100).toFixed(2),
        grandPoolCents: pool.grandPoolCents,
        grandPoolSgd: (pool.grandPoolCents / 100).toFixed(2),
        progress: pool.progress,
        bydUnlocked: pool.bydUnlocked,
      },
    },
  });
}

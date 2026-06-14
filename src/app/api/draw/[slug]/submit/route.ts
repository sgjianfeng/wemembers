import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// POST /api/draw/[slug]/submit — 上传收据参与抽奖
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

  const { receiptAmount } = await request.json();
  if (!receiptAmount || receiptAmount <= 0) {
    return NextResponse.json({ error: "请填写消费金额" }, { status: 400 });
  }

  const minSpend = campaign.receiptMinSpend || 5000; // 默认 S$50 = 5000分
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

  // 生成券号
  const existingCount = await prisma.drawTicket.count({ where: { campaignId: campaign.id } });
  const tickets = [];
  for (let i = 0; i < ticketCount; i++) {
    const ticketNo = `DRAW-${String(existingCount + i + 1).padStart(6, "0")}`;
    const ticket = await prisma.drawTicket.create({
      data: {
        campaignId: campaign.id,
        customerId: session.userId,
        entryId: entry.id,
        ticketNo,
      },
    });
    tickets.push(ticket);
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      entryCount: { increment: 1 },
      totalTicketCount: { increment: ticketCount },
    },
  });

  return NextResponse.json({
    data: {
      entry,
      tickets: tickets.map((t) => ({ ticketNo: t.ticketNo })),
      ticketCount,
    },
  });
}

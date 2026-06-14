import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/draw/[slug]/my-tickets — 我的抽奖券
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const campaign = await prisma.campaign.findUnique({ where: { slug } });
  if (!campaign) return NextResponse.json({ error: "活动不存在" }, { status: 404 });

  const entries = await prisma.luckyDrawEntry.findMany({
    where: { campaignId: campaign.id, customerId: session.userId },
    include: { tickets: { orderBy: { ticketNo: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    data: entries.map((e) => ({
      id: e.id,
      receiptAmount: e.receiptAmount,
      ticketCount: e.ticketCount,
      source: e.source,
      createdAt: e.createdAt,
      tickets: e.tickets.map((t) => ({
        ticketNo: t.ticketNo,
        won: t.won,
        prizeName: t.prizeName,
        prizeIcon: t.prizeIcon,
      })),
    })),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/draw/[slug] — 获取公开抽奖活动信息
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { slug, type: "lucky_draw" },
    include: {
      business: { select: { businessName: true, businessCategory: true } },
      prizes: { orderBy: { weight: "desc" } },
    },
  });

  if (!campaign) return NextResponse.json({ error: "活动不存在" }, { status: 404 });

  const getGrandPoolEstimate = (await import("@/lib/draw")).getGrandPoolEstimate;
  const minSpend = campaign.receiptMinSpend || 5000;
  const totalSpendEst = campaign.totalTicketCount * minSpend;
  const pool = getGrandPoolEstimate(totalSpendEst, campaign.budgetPercent || 20);

  return NextResponse.json({
    data: {
      name: campaign.name,
      description: campaign.description,
      businessName: campaign.business.businessName,
      entryMethod: campaign.entryMethod,
      receiptMinSpend: minSpend,
      ticketsPerUnit: campaign.ticketsPerUnit,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      drawDate: campaign.drawDate,
      status: campaign.status,
      entryCount: campaign.entryCount,
      totalTicketCount: campaign.totalTicketCount,
      instantPoolCents: campaign.instantPoolCents,
      instantPoolSgd: (campaign.instantPoolCents / 100).toFixed(2),
      grandPoolCents: pool.grandPoolCents,
      grandPoolSgd: (pool.grandPoolCents / 100).toFixed(2),
      progress: pool.progress,
      bydUnlocked: pool.bydUnlocked,
      prizes: campaign.prizes.map((p) => ({
        name: p.name,
        icon: p.icon,
        weight: p.weight,
        totalStock: p.totalStock,
        remainingStock: p.remainingStock,
        claimed: p.claimed,
      })),
    },
  });
}

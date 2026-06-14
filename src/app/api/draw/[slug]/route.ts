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

  return NextResponse.json({
    data: {
      name: campaign.name,
      description: campaign.description,
      businessName: campaign.business.businessName,
      entryMethod: campaign.entryMethod,
      receiptMinSpend: campaign.receiptMinSpend || 5000,
      ticketsPerUnit: campaign.ticketsPerUnit,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      drawDate: campaign.drawDate,
      status: campaign.status,
      entryCount: campaign.entryCount,
      totalTicketCount: campaign.totalTicketCount,
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

// GET /api/campaign/active-draws — active V2 campaigns with pool status
// Used by the consumer landing page to showcase live draws

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { GRAND_PRIZE_TARGETS, estimatePoolCountdown } from "@/lib/draw-v2";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    where: { type: "lucky_draw_v2", status: "active", endDate: { gt: new Date() } },
    orderBy: { endDate: "asc" },
    take: 3,
    select: {
      id: true, slug: true, name: true, businessId: true,
      instantPoolCents: true, dailyAvgVelocity: true,
      midPoolRatio: true, grandPoolRatio: true,
      business: { select: { businessName: true } },
    },
  });

  const results = await Promise.all(campaigns.map(async (camp) => {
    // Aggregate pool contributions
    const poolAgg = await prisma.voucher.aggregate({
      where: { campaignId: camp.id },
      _sum: { prizePoolContribution: true },
    });
    const totalPoolCents = poolAgg._sum.prizePoolContribution ?? 0;
    const instantPoolCents = camp.instantPoolCents ?? 0;

    const midRatio = camp.midPoolRatio ?? 60;
    const grandRatio = camp.grandPoolRatio ?? 30;
    const sumMidGrand = midRatio + grandRatio;
    const nonInstantCents = Math.max(0, totalPoolCents - instantPoolCents);
    const grandPoolCents = sumMidGrand > 0 ? Math.floor(nonInstantCents * grandRatio / sumMidGrand) : 0;

    // Build pool configs for each grand prize target
    const totalGrandTarget = Object.values(GRAND_PRIZE_TARGETS).reduce((sum, m) => sum + m.targetCents, 0);
    const poolConfigs: Record<string, { targetCents: number; currentCents: number }> = {};
    for (const [key, meta] of Object.entries(GRAND_PRIZE_TARGETS)) {
      const allocated = totalGrandTarget > 0
        ? Math.floor(grandPoolCents * (meta.targetCents / totalGrandTarget))
        : 0;
      poolConfigs[key] = {
        targetCents: meta.targetCents,
        currentCents: Math.min(allocated, meta.targetCents),
      };
    }

    const dailyAvgVelocity = camp.dailyAvgVelocity ?? 0;
    const countdown = estimatePoolCountdown(poolConfigs, dailyAvgVelocity);

    return {
      id: camp.id,
      slug: camp.slug,
      name: camp.name,
      businessName: camp.business?.businessName || "",
      instantPoolSgd: (instantPoolCents / 100).toFixed(2),
      grandPoolSgd: (grandPoolCents / 100).toFixed(2),
      totalPoolSgd: (totalPoolCents / 100).toFixed(2),
      dailyVelocitySgd: (dailyAvgVelocity / 100).toFixed(2),
      countdown: countdown.map((c) => ({
        prizeName: c.prizeName,
        progress: c.progress,
        daysPredicted: c.daysPredicted,
        accelerating: c.accelerating,
        currentSgd: (c.currentCents / 100).toFixed(0),
        targetSgd: (c.targetCents / 100).toFixed(0),
      })),
    };
  }));

  return NextResponse.json({ data: results });
}

// GET /api/campaign/active-draws — active V2 campaigns with pool status
// Small pool vs grand: use campaign ledgers when set; else 20/80 split of contributions

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  SMALL_POOL_RATIO,
  allocateDeferredToPrizes,
  allocatePrizePools,
  estimatePoolCountdown,
} from "@/lib/draw-v2";
import {
  normalizeCampaignGrandPrizes,
  parseRulesSnapshot,
} from "@/lib/templates";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    where: { type: "lucky_draw_v2", status: "active", endDate: { gt: new Date() } },
    orderBy: { endDate: "asc" },
    take: 3,
    select: {
      id: true,
      slug: true,
      name: true,
      businessId: true,
      dailyAvgVelocity: true,
      instantPoolRatio: true,
      instantPoolCents: true,
      grandPoolCents: true,
      rulesSnapshot: true,
      business: { select: { businessName: true } },
    },
  });

  const results = await Promise.all(
    campaigns.map(async (camp) => {
      const poolAgg = await prisma.voucher.aggregate({
        where: { campaignId: camp.id },
        _sum: { prizePoolContribution: true },
      });
      const totalContributed = poolAgg._sum.prizePoolContribution ?? 0;

      let smallPoolCents = camp.instantPoolCents ?? 0;
      let grandPoolCents = camp.grandPoolCents ?? 0;
      if (smallPoolCents === 0 && grandPoolCents === 0 && totalContributed > 0) {
        const alloc = allocatePrizePools(
          totalContributed,
          camp.instantPoolRatio ?? SMALL_POOL_RATIO
        );
        smallPoolCents = alloc.instantPoolCents;
        grandPoolCents = alloc.deferredPoolCents;
      }
      const totalPoolCents = smallPoolCents + grandPoolCents || totalContributed;

      const snapshot = parseRulesSnapshot(camp.rulesSnapshot);
      const grandPrizes =
        snapshot?.grandPrizes && snapshot.grandPrizes.length > 0
          ? snapshot.grandPrizes
          : normalizeCampaignGrandPrizes(snapshot?.prizePackId || "default_grand_v1");

      const poolConfigs = allocateDeferredToPrizes(grandPoolCents, grandPrizes);
      const dailyAvgVelocity = camp.dailyAvgVelocity ?? 0;
      const countdown = estimatePoolCountdown(poolConfigs, dailyAvgVelocity);

      return {
        id: camp.id,
        slug: camp.slug,
        name: camp.name,
        businessName: camp.business?.businessName || "",
        instantPoolSgd: (smallPoolCents / 100).toFixed(2),
        grandPoolSgd: (grandPoolCents / 100).toFixed(2),
        deferredPoolSgd: (grandPoolCents / 100).toFixed(2),
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
    })
  );

  return NextResponse.json({ data: results });
}

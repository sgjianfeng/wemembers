// src/app/api/campaign/pool-status/route.ts
// GET /api/campaign/pool-status?slug=xxx — 实时奖池进度 + 预测倒计时

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  GRAND_PRIZE_TARGETS,
  estimatePoolCountdown,
} from "@/lib/draw-v2";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ error: "Missing slug parameter" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { slug, type: { in: ["lucky_draw", "lucky_draw_v2"] } },
    include: {
      _count: {
        select: { vouchers: true },
      },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "活动不存在" }, { status: 404 });
  }

  // Sum up prize pool contributions from all vouchers in this campaign
  const poolAgg = await prisma.voucher.aggregate({
    where: { campaignId: campaign.id },
    _sum: { prizePoolContribution: true },
  });

  const totalPoolCents = poolAgg._sum.prizePoolContribution ?? 0;

  // Allocate pool by campaign ratios
  const instantPoolCents = Math.floor(totalPoolCents * (campaign.instantPoolRatio ?? 10) / 100);
  const midPoolCents = Math.floor(totalPoolCents * (campaign.midPoolRatio ?? 60) / 100);
  const grandPoolCents = Math.floor(totalPoolCents * (campaign.grandPoolRatio ?? 30) / 100);

  // Count draws per pool type (instant / mid / grand)
  const drawCounts = await prisma.voucherDraw.groupBy({
    by: ["drawType", "won"],
    where: {
      voucher: { campaignId: campaign.id },
    },
    _count: true,
  });

  // Build a quick-lookup for draw counts
  const drawSummary: Record<string, { total: number; won: number }> = {
    instant: { total: 0, won: 0 },
    mid: { total: 0, won: 0 },
    grand: { total: 0, won: 0 },
  };
  for (const row of drawCounts) {
    const key = row.drawType;
    if (!drawSummary[key]) drawSummary[key] = { total: 0, won: 0 };
    drawSummary[key].total += row._count;
    if (row.won) drawSummary[key].won += row._count;
  }

  // Build pool config for grand prize countdown estimation
  const poolConfigs: Record<string, { targetCents: number; currentCents: number }> = {};
  for (const [key, meta] of Object.entries(GRAND_PRIZE_TARGETS)) {
    const allocated = Math.floor(grandPoolCents * (meta.valueCents / 100000)); // rough proportional allocation
    poolConfigs[key] = {
      targetCents: meta.targetCents,
      currentCents: Math.min(allocated, meta.targetCents),
    };
  }

  // Estimate countdown using daily velocity
  const dailyAvgVelocity = campaign.dailyAvgVelocity ?? 0;
  const countdown = estimatePoolCountdown(poolConfigs, dailyAvgVelocity);

  return NextResponse.json({
    data: {
      campaign: {
        id: campaign.id,
        slug: campaign.slug,
        name: campaign.name,
        status: campaign.status,
        voucherCount: campaign._count.vouchers,
      },
      pool: {
        totalCents: totalPoolCents,
        totalSgd: (totalPoolCents / 100).toFixed(2),
        instantPool: {
          cents: instantPoolCents,
          sgd: (instantPoolCents / 100).toFixed(2),
          ratio: campaign.instantPoolRatio ?? 10,
        },
        midPool: {
          cents: midPoolCents,
          sgd: (midPoolCents / 100).toFixed(2),
          ratio: campaign.midPoolRatio ?? 60,
        },
        grandPool: {
          cents: grandPoolCents,
          sgd: (grandPoolCents / 100).toFixed(2),
          ratio: campaign.grandPoolRatio ?? 30,
        },
      },
      draws: drawSummary,
      velocity: {
        dailyAvgCents: dailyAvgVelocity,
        dailyAvgSgd: (dailyAvgVelocity / 100).toFixed(2),
        lastUpdated: campaign.lastVelocityUpdate,
      },
      countdown,
    },
  });
}

// GET /api/campaign/pool-status?slug=xxx
// Works for lucky_draw_v2 and voucher_sale (promo has empty pool/countdown).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  GRAND_PRIZE_TARGETS,
  SMALL_POOL_RATIO,
  allocateDeferredToPrizes,
  allocatePrizePools,
  estimatePoolCountdown,
} from "@/lib/draw-v2";
import {
  normalizeCampaignGrandPrizes,
  parseRulesSnapshot,
  type CampaignGrandPrize,
} from "@/lib/templates";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ error: "Missing slug parameter" }, { status: 400 });
  }

  /**
   * 解析顺序（重要）：
   * 1) 券产品 slug → product_mirror（购券/奖池真正落在镜像活动上）
   * 2) 再按 Campaign slug / id
   *
   * 若先查 Campaign，会命中同名「编排活动」slug（常无购券、grandPool=0），
   * 而顾客实际买的是 m-{productSlug} 镜像，已筹金额显示成 0。
   */
  type CampRow = NonNullable<
    Awaited<
      ReturnType<
        typeof prisma.campaign.findFirst<{
          include: { _count: { select: { vouchers: true } } };
        }>
      >
    >
  >;
  let campaign: CampRow | null = null;
  let displaySlug: string | null = slug;
  let displayName: string | null = null;

  const product = await prisma.voucherProduct.findFirst({
    where: { slug, status: { in: ["active", "draft", "archived"] } },
  });
  if (product?.mirrorCampaignId) {
    campaign = await prisma.campaign.findFirst({
      where: { id: product.mirrorCampaignId },
      include: { _count: { select: { vouchers: true } } },
    });
    if (campaign) {
      displayName = product.name;
      displaySlug = product.slug || campaign.slug;
    }
  }

  if (!campaign) {
    campaign = await prisma.campaign.findFirst({
      where: {
        OR: [{ slug }, { id: slug }],
        type: { in: ["lucky_draw", "lucky_draw_v2", "voucher_sale"] },
      },
      include: { _count: { select: { vouchers: true } } },
    });
  }

  // 命中编排活动但池/券为空：再尝试同 slug 产品镜像（兼容历史双 slug）
  if (
    campaign &&
    (campaign as { role?: string | null }).role !== "product_mirror" &&
    (campaign.grandPoolCents ?? 0) === 0 &&
    (campaign.instantPoolCents ?? 0) === 0 &&
    campaign._count.vouchers === 0
  ) {
    const prod2 =
      product ||
      (await prisma.voucherProduct.findFirst({
        where: {
          OR: [{ slug }, { slug: slug.replace(/^m-/, "") }],
          status: { in: ["active", "draft", "archived"] },
        },
      }));
    if (prod2?.mirrorCampaignId && prod2.mirrorCampaignId !== campaign.id) {
      const mirror = await prisma.campaign.findFirst({
        where: { id: prod2.mirrorCampaignId },
        include: { _count: { select: { vouchers: true } } },
      });
      if (
        mirror &&
        ((mirror.grandPoolCents ?? 0) > 0 ||
          (mirror.instantPoolCents ?? 0) > 0 ||
          mirror._count.vouchers > 0)
      ) {
        campaign = mirror;
        displayName = prod2.name;
        displaySlug = prod2.slug || mirror.slug;
      }
    }
  }

  if (!campaign) {
    return NextResponse.json({ error: "券产品不存在" }, { status: 404 });
  }

  if (displayName) {
    (campaign as { name: string }).name = displayName;
  }
  if (displaySlug) {
    (campaign as { slug: string | null }).slug = displaySlug;
  }

  const isDraw =
    campaign.type === "lucky_draw" || campaign.type === "lucky_draw_v2";
  const snapshot = parseRulesSnapshot(campaign.rulesSnapshot);

  const rules = {
    kind: snapshot?.kind ?? (isDraw ? "draw" : "voucher_discount"),
    discountPercent: snapshot?.discountPercent ?? 0,
    allowDiscount: snapshot?.allowDiscount ?? false,
    enabledTiers: snapshot?.enabledTiers ?? [50, 100, 200],
    shareSellingEnabled: snapshot?.shareSellingEnabled ?? true,
    sellerCommissionPercent: snapshot?.sellerCommissionPercent ?? 5,
  };

  const productKind =
    (campaign as { productKind?: string }).productKind === "self_use"
      ? "self_use"
      : "distribution";

  if (!isDraw) {
    return NextResponse.json({
      data: {
        campaign: {
          id: campaign.id,
          slug: campaign.slug,
          name: campaign.name,
          status: campaign.status,
          type: campaign.type,
          productKind,
          voucherCount: campaign._count.vouchers,
          isDraw: false,
        },
        rules,
        pool: null,
        draws: null,
        velocity: null,
        grandPrizes: [],
        countdown: [],
      },
    });
  }

  const poolAgg = await prisma.voucher.aggregate({
    where: { campaignId: campaign.id },
    _sum: { prizePoolContribution: true },
  });

  const totalContributed = poolAgg._sum.prizePoolContribution ?? 0;

  let smallPoolCents = campaign.instantPoolCents ?? 0;
  let grandPoolCents = campaign.grandPoolCents ?? 0;

  if (smallPoolCents === 0 && grandPoolCents === 0 && totalContributed > 0) {
    const ratio = campaign.instantPoolRatio ?? SMALL_POOL_RATIO;
    const alloc = allocatePrizePools(totalContributed, ratio);
    smallPoolCents = alloc.instantPoolCents;
    grandPoolCents = alloc.deferredPoolCents;
  }

  const totalPoolCents = smallPoolCents + grandPoolCents || totalContributed;
  const instantRatio =
    totalPoolCents > 0
      ? Math.round((smallPoolCents / totalPoolCents) * 100)
      : SMALL_POOL_RATIO;
  const deferredRatio = 100 - instantRatio;

  const drawCounts = await prisma.voucherDraw.groupBy({
    by: ["drawType", "won"],
    where: {
      voucher: { campaignId: campaign.id },
    },
    _count: true,
  });

  const drawSummary: Record<string, { total: number; won: number }> = {
    instant: { total: 0, won: 0 },
    deferred: { total: 0, won: 0 },
  };
  for (const row of drawCounts) {
    const key = row.drawType === "instant" ? "instant" : "deferred";
    drawSummary[key].total += row._count;
    if (row.won) drawSummary[key].won += row._count;
  }

  let grandPrizes: CampaignGrandPrize[] =
    snapshot?.grandPrizes && snapshot.grandPrizes.length > 0
      ? snapshot.grandPrizes
      : normalizeCampaignGrandPrizes(snapshot?.prizePackId || "default_grand_v1");

  if (!grandPrizes.length) {
    grandPrizes = Object.entries(GRAND_PRIZE_TARGETS).map(([id, m]) => ({
      id,
      name: m.displayName,
      icon: m.icon,
      targetCents: m.targetCents,
      valueCents: m.valueCents,
      requiresEscrow: id === "BYD",
    }));
  }

  const poolConfigs = allocateDeferredToPrizes(grandPoolCents, grandPrizes);
  const dailyAvgVelocity = campaign.dailyAvgVelocity ?? 0;
  const countdown = estimatePoolCountdown(poolConfigs, dailyAvgVelocity);

  return NextResponse.json({
    data: {
      campaign: {
        id: campaign.id,
        slug: campaign.slug,
        name: campaign.name,
        status: campaign.status,
        type: campaign.type,
        productKind,
        voucherCount: campaign._count.vouchers,
        isDraw: true,
      },
      rules,
      pool: {
        totalCents: totalPoolCents,
        totalSgd: (totalPoolCents / 100).toFixed(2),
        instantPool: {
          cents: smallPoolCents,
          sgd: (smallPoolCents / 100).toFixed(2),
          ratio: instantRatio,
        },
        deferredPool: {
          cents: grandPoolCents,
          sgd: (grandPoolCents / 100).toFixed(2),
          ratio: deferredRatio,
        },
        grandPool: {
          cents: grandPoolCents,
          sgd: (grandPoolCents / 100).toFixed(2),
          ratio: deferredRatio,
        },
      },
      draws: drawSummary,
      velocity: {
        dailyAvgCents: dailyAvgVelocity,
        dailyAvgSgd: (dailyAvgVelocity / 100).toFixed(2),
        lastUpdated: campaign.lastVelocityUpdate,
      },
      grandPrizes,
      countdown,
    },
  });
}

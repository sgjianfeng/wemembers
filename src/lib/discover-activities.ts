/**
 * Consumer-facing joinable activities (not product_mirror, not coupon lists).
 * Activity = Campaign role=activity (or legacy without role mirror).
 */

import { prisma } from "@/lib/db";
import { parseStoreIdsScope } from "@/lib/utils";
import {
  allocateDeferredToPrizes,
  allocatePrizePools,
  estimatePoolCountdown,
  SMALL_POOL_RATIO,
} from "@/lib/draw-v2";
import {
  normalizeCampaignGrandPrizes,
  parseRulesSnapshot,
} from "@/lib/templates";

const DRAW_TYPES = ["lucky_draw", "lucky_draw_v2", "voucher_sale"] as const;

export type ActivityProductBrief = {
  id: string;
  name: string;
  slug: string | null;
  type: string;
  productKind: string;
  status: string;
  buyPath: string | null;
};

export type ActivityStoreBrief = {
  id: string;
  name: string;
};

/** voucher = prepaid credit; draw = prize / ballot path */
export type OfferDisplayMode = "voucher" | "draw";

export type JoinableActivity = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  productKind: string;
  slug: string | null;
  endDate: string;
  businessId: string;
  businessName: string;
  businessLogo: string | null;
  /** Participating stores (resolved); empty + storesAll = all business stores */
  stores: ActivityStoreBrief[];
  storesAll: boolean;
  storeCount: number;
  products: ActivityProductBrief[];
  /** Click target: single product buy, multi → /activity/id */
  href: string;
  heat: number;
  hot: boolean;
  participantCount: number;
  grandPoolSgd: string;
  smallPoolSgd: string;
  grandProgress: number | null;
  prizes: { key: string; name: string; icon: string; progress: number }[];
  joined: boolean;
  myCount: number;
  kindTag: "exclusive_draw" | "co_win_draw" | "self_use" | "distribution" | "draw";
  /** Customer UI branch: calm voucher card vs festive draw card */
  displayMode: OfferDisplayMode;
};

function kindTag(type: string, productKind: string): JoinableActivity["kindTag"] {
  if (type === "lucky_draw_v2" || type === "lucky_draw") {
    return productKind === "self_use" ? "exclusive_draw" : "co_win_draw";
  }
  return productKind === "self_use" ? "self_use" : "distribution";
}

export function offerDisplayMode(
  type: string,
  kind?: JoinableActivity["kindTag"]
): OfferDisplayMode {
  if (
    type === "lucky_draw" ||
    type === "lucky_draw_v2" ||
    kind === "exclusive_draw" ||
    kind === "co_win_draw" ||
    kind === "draw"
  ) {
    return "draw";
  }
  return "voucher";
}

/** Customer-facing short label (not merchant jargon) */
export function offerKindLabel(
  tag: JoinableActivity["kindTag"],
  lang: "zh" | "en"
): string {
  const map: Record<JoinableActivity["kindTag"], { zh: string; en: string }> = {
    exclusive_draw: { zh: "抽大奖", en: "Prize draw" },
    co_win_draw: { zh: "联合抽奖", en: "Shared draw" },
    self_use: { zh: "到店代金", en: "Store credit" },
    distribution: { zh: "通用代金", en: "Network credit" },
    draw: { zh: "幸运抽奖", en: "Lucky draw" },
  };
  return map[tag][lang];
}

/** One-line benefit for cards */
export function offerBlurb(
  a: Pick<JoinableActivity, "kindTag" | "displayMode" | "description">,
  lang: "zh" | "en"
): string {
  if (a.displayMode === "draw") {
    if (a.kindTag === "exclusive_draw") {
      return lang === "en"
        ? "Buy · small win chance · box for grand prize"
        : "购买后可抽小奖 · 消费入箱冲大奖";
    }
    return lang === "en"
      ? "Buy to enter · win from shared pool"
      : "购买即参与 · 共享奖池开奖";
  }
  if (a.kindTag === "self_use") {
    return lang === "en"
      ? "Pay face value · spend at store"
      : "付多少抵多少 · 到店核销使用";
  }
  return lang === "en"
    ? "Buy online · redeem at partner stores"
    : "线上购买 · 合作门店通用";
}

export function offerCta(
  a: Pick<JoinableActivity, "displayMode" | "joined">,
  lang: "zh" | "en"
): string {
  if (a.joined) return lang === "en" ? "View" : "查看";
  if (a.displayMode === "draw") return lang === "en" ? "Enter draw" : "去抽奖";
  return lang === "en" ? "Buy" : "去购买";
}

function poolMeta(campaign: {
  instantPoolCents: number;
  grandPoolCents: number;
  instantPoolRatio: number;
  dailyAvgVelocity: number;
  rulesSnapshot: string | null;
  voucherContributions?: number;
}) {
  let small = campaign.instantPoolCents || 0;
  let grand = campaign.grandPoolCents || 0;
  const contributed = campaign.voucherContributions || 0;
  if (small === 0 && grand === 0 && contributed > 0) {
    const alloc = allocatePrizePools(
      contributed,
      campaign.instantPoolRatio ?? SMALL_POOL_RATIO
    );
    small = alloc.instantPoolCents;
    grand = alloc.deferredPoolCents;
  }

  const snapshot = parseRulesSnapshot(campaign.rulesSnapshot);
  const grandPrizes =
    snapshot?.grandPrizes && snapshot.grandPrizes.length > 0
      ? snapshot.grandPrizes
      : normalizeCampaignGrandPrizes(snapshot?.prizePackId || "default_grand_v1");

  const poolConfigs = allocateDeferredToPrizes(grand, grandPrizes);
  const countdown = estimatePoolCountdown(
    poolConfigs,
    campaign.dailyAvgVelocity ?? 0
  );
  const best = countdown
    .filter((c) => c.progress < 100)
    .sort((a, b) => a.daysPredicted - b.daysPredicted)[0];

  const prizes = countdown
    .slice()
    .sort((a, b) => a.targetCents - b.targetCents)
    .slice(0, 3)
    .map((c) => ({
      key: c.prizeKey,
      name: c.prizeName,
      icon: c.prizeIcon,
      progress: c.progress,
    }));

  return {
    smallPoolSgd: (small / 100).toFixed(0),
    grandPoolSgd: (grand / 100).toFixed(0),
    grandProgress: best?.progress ?? countdown[0]?.progress ?? null,
    prizes,
  };
}

function resolveHref(
  products: ActivityProductBrief[],
  activityId: string,
  campaignSlug: string | null
): string {
  const active = products.filter((p) => p.status === "active");
  if (active.length === 1) {
    const p = active[0];
    if (p.buyPath) return p.buyPath;
    if (p.slug) return `/voucher/${p.slug}`;
  }
  if (active.length > 1) {
    return `/activity/${activityId}`;
  }
  // legacy draw / no catalog products
  return `/voucher/${campaignSlug || activityId}`;
}

export type ListJoinableActivitiesOpts = {
  limit?: number;
  /** When set, mark joined + myCount from user's vouchers/entries */
  customerId?: string | null;
  /** Only return activities the user has joined */
  onlyJoined?: boolean;
};

/**
 * List consumer-visible activities, ranked by heat.
 */
export async function listJoinableActivities(
  opts: ListJoinableActivitiesOpts = {}
): Promise<JoinableActivity[]> {
  const limit = opts.limit ?? 30;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const campaigns = await prisma.campaign.findMany({
    where: {
      role: { not: "product_mirror" },
      status: "active",
      endDate: { gt: now },
      type: { in: [...DRAW_TYPES] },
    },
    include: {
      business: {
        select: {
          businessName: true,
          businessLogo: true,
        },
      },
      catalogProducts: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true,
              productKind: true,
              status: true,
            },
          },
        },
      },
    },
    orderBy: { endDate: "asc" },
    take: 80,
  });

  // Drop activities with no active products unless legacy lucky_draw / has slug purchase path
  const candidates = campaigns.filter((c) => {
    const activeProds = c.catalogProducts.filter(
      (x) => x.product.status === "active"
    );
    if (activeProds.length > 0) return true;
    // legacy: no catalog yet but still a sellable campaign slug
    return c.type === "lucky_draw" || Boolean(c.slug);
  });

  if (candidates.length === 0) return [];

  const campaignIds = candidates.map((c) => c.id);
  // Also count vouchers on mirror campaigns of linked products
  const productIds = candidates.flatMap((c) =>
    c.catalogProducts.map((x) => x.productId)
  );

  const [weekSales, allContrib, storeRows, mirrors] = await Promise.all([
    prisma.voucher.groupBy({
      by: ["campaignId"],
      where: {
        campaignId: { in: campaignIds },
        createdAt: { gte: weekAgo },
        paidCents: { gt: 0 },
      },
      _count: { id: true },
    }),
    prisma.voucher.groupBy({
      by: ["campaignId"],
      where: { campaignId: { in: campaignIds } },
      _sum: { prizePoolContribution: true },
      _count: { id: true },
    }),
    prisma.store.findMany({
      where: {
        businessId: { in: [...new Set(candidates.map((c) => c.businessId))] },
      },
      select: { id: true, name: true, businessId: true },
    }),
    productIds.length > 0
      ? prisma.voucherProduct.findMany({
          where: { id: { in: productIds } },
          select: { id: true, slug: true, mirrorCampaignId: true },
        })
      : Promise.resolve([] as { id: string; slug: string | null; mirrorCampaignId: string | null }[]),
  ]);

  const salesMap = new Map(weekSales.map((r) => [r.campaignId, r._count.id]));
  const contribMap = new Map(
    allContrib.map((r) => [
      r.campaignId,
      {
        sum: r._sum.prizePoolContribution || 0,
        count: r._count.id,
      },
    ])
  );

  // Week sales on product mirrors also count for activity heat
  const mirrorIds = mirrors
    .map((m) => m.mirrorCampaignId)
    .filter((x): x is string => Boolean(x));
  const productByMirror = new Map(
    mirrors
      .filter((m) => m.mirrorCampaignId)
      .map((m) => [m.mirrorCampaignId as string, m.id])
  );
  let mirrorWeekSales = new Map<string, number>();
  if (mirrorIds.length > 0) {
    const rows = await prisma.voucher.groupBy({
      by: ["campaignId"],
      where: {
        campaignId: { in: mirrorIds },
        createdAt: { gte: weekAgo },
        paidCents: { gt: 0 },
      },
      _count: { id: true },
    });
    mirrorWeekSales = new Map(rows.map((r) => [r.campaignId, r._count.id]));
  }

  // productId → week sales via mirror
  const productWeekSales = new Map<string, number>();
  for (const [mirrorCampId, count] of mirrorWeekSales) {
    const pid = productByMirror.get(mirrorCampId);
    if (pid) productWeekSales.set(pid, (productWeekSales.get(pid) || 0) + count);
  }

  const storesByBiz = new Map<string, { id: string; name: string }[]>();
  for (const s of storeRows) {
    const list = storesByBiz.get(s.businessId) || [];
    list.push({ id: s.id, name: s.name });
    storesByBiz.set(s.businessId, list);
  }

  const storeNameById = new Map(storeRows.map((s) => [s.id, s.name]));

  // User joined state
  const myCountByCampaign = new Map<string, number>();
  const myCountByProduct = new Map<string, number>();
  if (opts.customerId) {
    const [myVouchers, v1Entries] = await Promise.all([
      prisma.voucher.findMany({
        where: {
          customerId: opts.customerId,
          status: { in: ["active", "exhausted"] },
        },
        select: { campaignId: true, productId: true },
      }),
      prisma.luckyDrawEntry.findMany({
        where: { customerId: opts.customerId, campaignId: { in: campaignIds } },
        include: { tickets: { select: { id: true } } },
      }),
    ]);
    for (const v of myVouchers) {
      myCountByCampaign.set(
        v.campaignId,
        (myCountByCampaign.get(v.campaignId) || 0) + 1
      );
      if (v.productId) {
        myCountByProduct.set(
          v.productId,
          (myCountByProduct.get(v.productId) || 0) + 1
        );
      }
    }
    for (const e of v1Entries) {
      myCountByCampaign.set(
        e.campaignId,
        (myCountByCampaign.get(e.campaignId) || 0) + e.tickets.length
      );
    }
  }

  const slugByProduct = new Map(mirrors.map((m) => [m.id, m.slug]));

  const items: JoinableActivity[] = candidates.map((c) => {
    const products: ActivityProductBrief[] = c.catalogProducts.map((link) => {
      const p = link.product;
      const slug = p.slug || slugByProduct.get(p.id) || null;
      return {
        id: p.id,
        name: p.name,
        slug,
        type: p.type,
        productKind: p.productKind,
        status: p.status,
        buyPath: slug ? `/voucher/${slug}` : null,
      };
    });

    const scope = parseStoreIdsScope(c.storeIds);
    const bizStores = storesByBiz.get(c.businessId) || [];
    let stores: ActivityStoreBrief[] = [];
    let storesAll = false;
    if (scope.mode === "all") {
      storesAll = true;
      stores = bizStores.slice(0, 6);
    } else {
      stores = scope.ids
        .map((id) => ({ id, name: storeNameById.get(id) || id.slice(0, 6) }))
        .filter((s) => s.name);
    }
    const storeCount =
      scope.mode === "all" ? bizStores.length : scope.ids.length;

    // Heat: week purchases on activity + linked products, store count, urgency
    let weekPurchases = salesMap.get(c.id) || 0;
    for (const p of products) {
      weekPurchases += productWeekSales.get(p.id) || 0;
    }
    const daysLeft = Math.max(
      0,
      Math.ceil((c.endDate.getTime() - now.getTime()) / 86400000)
    );
    const urgencyBoost = daysLeft > 0 && daysLeft <= 7 ? 8 : 0;
    const velocityBoost = Math.min(20, Math.floor((c.dailyAvgVelocity || 0) / 500));
    const heat =
      weekPurchases * 3 +
      storeCount * 5 +
      velocityBoost +
      urgencyBoost +
      (c.joinCount || 0) * 2;

    const meta = poolMeta({
      instantPoolCents: c.instantPoolCents,
      grandPoolCents: c.grandPoolCents,
      instantPoolRatio: c.instantPoolRatio,
      dailyAvgVelocity: c.dailyAvgVelocity,
      rulesSnapshot: c.rulesSnapshot,
      voucherContributions: contribMap.get(c.id)?.sum || 0,
    });

    let myCount = myCountByCampaign.get(c.id) || 0;
    for (const p of products) {
      myCount += myCountByProduct.get(p.id) || 0;
    }
    // also count vouchers on mirrors for products in this activity
    for (const m of mirrors) {
      if (products.some((p) => p.id === m.id) && m.mirrorCampaignId) {
        myCount += myCountByCampaign.get(m.mirrorCampaignId) || 0;
      }
    }

    const tag = kindTag(c.type, c.productKind);
    const mode = offerDisplayMode(c.type, tag);
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      type: c.type,
      productKind: c.productKind,
      slug: c.slug,
      endDate: c.endDate.toISOString(),
      businessId: c.businessId,
      businessName: c.business?.businessName || "",
      businessLogo: c.business?.businessLogo || null,
      stores,
      storesAll,
      storeCount,
      products: products.filter((p) => p.status === "active"),
      href: resolveHref(
        products.filter((p) => p.status === "active"),
        c.id,
        c.slug
      ),
      heat,
      hot: false,
      participantCount: contribMap.get(c.id)?.count || weekPurchases,
      grandPoolSgd: meta.grandPoolSgd,
      smallPoolSgd: meta.smallPoolSgd,
      grandProgress: meta.grandProgress,
      prizes: meta.prizes,
      joined: myCount > 0,
      myCount,
      kindTag: tag,
      displayMode: mode,
    };
  });

  // Sort by heat desc, then endDate asc
  items.sort((a, b) => {
    if (b.heat !== a.heat) return b.heat - a.heat;
    return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
  });

  // Mark top 3 as hot (or heat >= threshold if sparse)
  const heatThreshold = 10;
  items.forEach((it, i) => {
    it.hot = i < 3 || it.heat >= heatThreshold;
  });

  let result = items;
  if (opts.onlyJoined) {
    result = items.filter((x) => x.joined);
  }

  return result.slice(0, limit);
}

export async function getJoinableActivityById(
  id: string,
  customerId?: string | null
): Promise<JoinableActivity | null> {
  const all = await listJoinableActivities({
    limit: 80,
    customerId,
  });
  return all.find((a) => a.id === id) || null;
}

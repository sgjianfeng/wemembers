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
import { isBaseCatalogPack } from "@/lib/store-defaults";
import {
  detectActivityCategory,
  type DefaultActivityCategory,
} from "@/lib/default-activities";

/** 顾客可见活动类型：代金 / 抽奖 / 国庆等节日满赠 */
const DRAW_TYPES = [
  "lucky_draw",
  "lucky_draw_v2",
  "voucher_sale",
  "holiday",
  "promotion",
  "seasonal",
  "event",
] as const;

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
  kindTag:
    | "exclusive_draw"
    | "co_win_draw"
    | "self_use"
    | "discount_card"
    | "distribution"
    | "draw";
  /** Customer UI branch: calm voucher card vs festive draw card */
  displayMode: OfferDisplayMode;
  /**
   * 商业三类：长期券 / 大奖倒计时 / 国庆满赠
   * （与 default-activities 槽位一致）
   */
  category: DefaultActivityCategory | "other";
  /** face_open / face_threshold = store base only */
  listScope: "hot" | "store";
  packKind: string | null;
  discountPercent: number;
};

function parsePackMeta(rulesSnapshot: string | null | undefined): {
  packKind: string | null;
  listScope: "hot" | "store";
  discountPercent: number;
} {
  const snap = parseRulesSnapshot(rulesSnapshot || null);
  const packKind =
    (snap?.packKind as string | undefined) ||
    null;
  const listScopeRaw = (snap as { listScope?: string } | null)?.listScope;
  const listScope: "hot" | "store" =
    listScopeRaw === "store" || isBaseCatalogPack(packKind)
      ? "store"
      : "hot";
  const discountPercent = Math.max(
    0,
    Math.round(Number(snap?.discountPercent) || 0)
  );
  return { packKind, listScope, discountPercent };
}

function kindTag(
  type: string,
  productKind: string,
  packKind: string | null,
  discountPercent: number
): JoinableActivity["kindTag"] {
  if (type === "lucky_draw_v2" || type === "lucky_draw") {
    return productKind === "self_use" ? "exclusive_draw" : "co_win_draw";
  }
  if (
    packKind === "discount_10" ||
    (discountPercent > 0 && type === "voucher_sale")
  ) {
    return "discount_card";
  }
  return productKind === "self_use" ? "self_use" : "distribution";
}

/**
 * Prefer linked product type over campaign.type —
 * shelf activities used to be mis-typed as promotion / wrong color.
 */
export function resolveOfferDisplayMode(params: {
  campaignType: string;
  productTypes: string[];
  packKind?: string | null;
}): OfferDisplayMode {
  if (
    params.productTypes.some(
      (t) => t === "lucky_draw_v2" || t === "lucky_draw"
    )
  ) {
    return "draw";
  }
  if (
    params.campaignType === "lucky_draw" ||
    params.campaignType === "lucky_draw_v2"
  ) {
    return "draw";
  }
  if (
    params.packKind === "exclusive_ballot" ||
    String(params.packKind || "").includes("exclusive")
  ) {
    return "draw";
  }
  return "voucher";
}

/** @deprecated use resolveOfferDisplayMode */
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
    self_use: { zh: "原价代金", en: "Face-value credit" },
    discount_card: { zh: "9折优惠", en: "10% off card" },
    distribution: { zh: "通用代金", en: "Network credit" },
    draw: { zh: "幸运抽奖", en: "Lucky draw" },
  };
  return map[tag][lang];
}

/**
 * Rewrite merchant/seed titles for customer cards.
 * Hide fee % (e.g. 15%) and "入箱" ops jargon; prefer countdown + brand exclusive.
 */
export function customerOfferTitle(
  name: string,
  opts?: {
    kindTag?: JoinableActivity["kindTag"];
    packKind?: string | null;
    lang?: "zh" | "en";
  }
): string {
  const lang = opts?.lang === "en" ? "en" : "zh";
  // Default exclusive pack / fee jargon → fixed customer title
  if (/消费入箱|独享\s*15|入箱大奖|exclusive\s*15|\b15\s*%/i.test(name)) {
    return lang === "en"
      ? "Grand prize countdown · Brand exclusive"
      : "大奖倒计时·品牌独享";
  }

  // Soft cleanup for residual merchant jargon (keep merchant-custom core name)
  let n = name
    .replace(/消费入箱大奖/g, lang === "en" ? "Grand prize countdown" : "大奖倒计时")
    .replace(/消费入箱/g, lang === "en" ? "Grand prize" : "大奖")
    .replace(/独享\s*15\s*%?/g, lang === "en" ? "Brand exclusive" : "品牌独享")
    .replace(/exclusive\s*15\s*%?/gi, "Brand exclusive")
    .replace(/·\s*15\s*%/g, "")
    .replace(/\s*15\s*%/g, "")
    .replace(/··+/g, "·")
    .replace(/^·|·$/g, "")
    .trim();

  return n || name;
}

/** One-line benefit for cards */
export function offerBlurb(
  a: Pick<
    JoinableActivity,
    "kindTag" | "displayMode" | "description" | "discountPercent" | "type" | "name"
  >,
  lang: "zh" | "en"
): string {
  if (
    a.type === "holiday" ||
    /国庆|ndp|national/i.test(a.name || "") ||
    /国庆|ndp/i.test(a.description || "")
  ) {
    return lang === "en"
      ? "Spend & get gift · grand draw chance"
      : "满赠送券 · 大奖机会 · 桌码/前台可领";
  }
  if (a.displayMode === "draw") {
    if (a.kindTag === "exclusive_draw") {
      return lang === "en"
        ? "Buy · draw for small prizes · countdown to grand prize"
        : "购买后可抽 · 冲大奖 · 品牌独享";
    }
    return lang === "en"
      ? "Buy to enter · win from shared pool"
      : "购买即参与 · 共享奖池开奖";
  }
  if (a.kindTag === "discount_card" || (a.discountPercent || 0) > 0) {
    const pct = a.discountPercent || 10;
    const pay = 100 - pct;
    return lang === "en"
      ? `Pay S$${pay} · get S$100 credit`
      : `付 S$${pay} 得 S$100 余额 · 到店花`;
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
  campaignSlug: string | null,
  campaignType?: string | null,
  campaignName?: string | null,
  tags?: string | null
): string {
  // 国庆 / 节日满赠 → 统一落地页
  if (
    campaignType === "holiday" ||
    /国庆|ndp|national/i.test(campaignName || "") ||
    (tags && /ndp|国庆|national/i.test(tags))
  ) {
    return `/ndp/${campaignSlug || activityId}?from=table`;
  }
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
  /**
   * hot = homepage / discover feed (exclude face base catalog)
   * all = store/shop lists include base 原价代金
   */
  listScope?: "hot" | "all";
  businessId?: string;
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
      ...(opts.businessId ? { businessId: opts.businessId } : {}),
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
              rulesSnapshot: true,
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
    // legacy / 国庆满赠：无 catalog 也可凭 slug 或 holiday 展示
    return (
      c.type === "lucky_draw" ||
      c.type === "holiday" ||
      Boolean(c.slug) ||
      (c.tags || "").includes("ndp")
    );
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
          select: {
            id: true,
            slug: true,
            mirrorCampaignId: true,
            rulesSnapshot: true,
            type: true,
          },
        })
      : Promise.resolve(
          [] as {
            id: string;
            slug: string | null;
            mirrorCampaignId: string | null;
            rulesSnapshot: string | null;
            type: string;
          }[]
        ),
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

    // Prefer product rules (packKind); fall back to campaign snapshot / tags
    let packKind: string | null = null;
    let listScope: "hot" | "store" = "hot";
    let discountPercent = 0;
    for (const link of c.catalogProducts) {
      const meta = parsePackMeta(link.product.rulesSnapshot);
      if (meta.packKind) {
        packKind = meta.packKind;
        listScope = meta.listScope;
        discountPercent = Math.max(discountPercent, meta.discountPercent);
      }
    }
    if (!packKind) {
      const campMeta = parsePackMeta(c.rulesSnapshot);
      packKind = campMeta.packKind;
      listScope = campMeta.listScope;
      discountPercent = campMeta.discountPercent;
    }
    // name heuristic for migrated Meow face packs without packKind
    if (
      !packKind &&
      (c.name.includes("原价") || c.name.includes("face"))
    ) {
      listScope = "store";
      packKind = c.name.includes("门槛") ? "face_threshold" : "face_open";
    }

    const productTypes = products.map((p) => p.type);
    const effectiveType =
      productTypes.find(
        (t) => t === "lucky_draw_v2" || t === "lucky_draw"
      ) || c.type;
    const tag = kindTag(
      effectiveType,
      c.productKind,
      packKind,
      discountPercent
    );
    const mode = resolveOfferDisplayMode({
      campaignType: c.type,
      productTypes,
      packKind,
    });

    const customerName = customerOfferTitle(c.name, {
      kindTag: tag,
      packKind,
    });

    const category = detectActivityCategory({
      type: c.type,
      name: c.name,
      tags: c.tags,
      rulesSnapshot: c.rulesSnapshot,
      packKind,
    });

    return {
      id: c.id,
      name: customerName,
      description: c.description,
      type: effectiveType,
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
        c.slug,
        c.type,
        c.name,
        c.tags
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
      category,
      listScope,
      packKind,
      discountPercent,
    };
  });

  // hot = 首页：排除门店长期券（listScope store / category long_term）
  // all = 门店/发现：长期 + 国庆 + 大奖都可见
  let scoped =
    opts.listScope === "all"
      ? items
      : items.filter(
          (x) => x.listScope !== "store" && x.category !== "long_term"
        );

  // 优先：国庆 → 大奖倒计时 → 其它，同类内按热度
  const categoryRank: Record<JoinableActivity["category"], number> = {
    ndp: 0,
    grand_countdown: 1,
    long_term: 2,
    other: 3,
  };
  scoped.sort((a, b) => {
    const cr = categoryRank[a.category] - categoryRank[b.category];
    if (cr !== 0) return cr;
    if (b.heat !== a.heat) return b.heat - a.heat;
    return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
  });

  // Mark top 3 as hot (or heat >= threshold if sparse)
  const heatThreshold = 10;
  scoped.forEach((it, i) => {
    it.hot = i < 3 || it.heat >= heatThreshold;
  });

  if (opts.onlyJoined) {
    scoped = scoped.filter((x) => x.joined);
  }

  return scoped.slice(0, limit);
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

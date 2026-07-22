import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { formatMoney } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { cookies } from "next/headers";
import Link from "next/link";
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
import {
  HomeDrawsSection,
  type HomeDrawItem,
} from "@/components/customer/HomeDrawsSection";
import { HomeVouchersSection } from "@/components/customer/HomeVouchersSection";
import { HomeStoresSection } from "@/components/customer/HomeStoresSection";
import { HomeHotStoresSection } from "@/components/customer/HomeHotStoresSection";
import { listHotStores } from "@/lib/discover-stores";

const DRAW_TYPES = ["lucky_draw", "lucky_draw_v2", "voucher_sale"] as const;

// All draw/voucher campaigns land on /voucher/[slug]; legacy /draw/[slug] redirects there
function campaignHref(_type: string, id: string, slug: string | null): string {
  return `/voucher/${slug || id}`;
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

  // Per-prize progress (ladder order, smallest target first), top 3
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
    // Hide absurd ETAs (velocity≈0 makes raw estimate astronomical)
    grandDaysPredicted:
      best && best.daysPredicted <= 365 ? best.daysPredicted : null,
    grandProgress: best?.progress ?? (countdown[0]?.progress ?? null),
    prizes,
  };
}

export default async function CustomerHome() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    user,
    activeCampaigns,
    myVouchers,
    memberships,
    monthlySavings,
    discoverCoupons,
    hotStores,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, displayName: true, phone: true },
    }),
    prisma.campaign.findMany({
      where: {
        type: { in: [...DRAW_TYPES] },
        status: "active",
        endDate: { gt: new Date() },
      },
      include: {
        business: {
          select: { businessName: true, businessLogo: true },
        },
      },
      orderBy: { endDate: "asc" },
      take: 8,
    }),
    prisma.voucher.findMany({
      where: { customerId: session.userId, status: "active" },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            type: true,
            slug: true,
            businessId: true,
            business: {
              select: {
                id: true,
                businessName: true,
                businessSlug: true,
                businessLogo: true,
              },
            },
          },
        },
        store: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.membership.findMany({
      where: { customerId: session.userId },
      include: {
        business: {
          select: {
            id: true,
            businessName: true,
            businessSlug: true,
            businessLogo: true,
          },
        },
      },
      orderBy: [{ isFavorite: "desc" }, { visitsCount: "desc" }],
      take: 12,
    }),
    prisma.redemptionLog.aggregate({
      where: { customerId: session.userId, redeemedAt: { gte: monthStart } },
      _sum: { amountSaved: true },
    }),
    prisma.coupon.findMany({
      where: {
        status: "published",
        validUntil: { gt: new Date() },
        OR: [{ remainingQuantity: { gte: 1 } }, { remainingQuantity: null }],
      },
      include: { business: { select: { businessName: true } } },
      orderBy: { claimedCount: "desc" },
      take: 6,
    }),
    listHotStores(8),
  ]);

  if (!user) redirect("/api/auth/logout?next=/auth/login");

  // Pool contributions for active campaigns
  const campaignIds = activeCampaigns.map((x) => x.id);
  const contribRows =
    campaignIds.length > 0
      ? await prisma.voucher.groupBy({
          by: ["campaignId"],
          where: { campaignId: { in: campaignIds } },
          _sum: { prizePoolContribution: true },
          _count: { id: true },
        })
      : [];
  const contribMap = new Map(
    contribRows.map((r) => [
      r.campaignId,
      {
        sum: r._sum.prizePoolContribution || 0,
        count: r._count.id,
      },
    ])
  );

  const myCountByCampaign = new Map<string, number>();
  for (const v of myVouchers) {
    myCountByCampaign.set(v.campaignId, (myCountByCampaign.get(v.campaignId) || 0) + 1);
  }

  // V1 ticket counts
  const v1Ids = activeCampaigns.filter((d) => d.type === "lucky_draw").map((d) => d.id);
  const v1Entries =
    v1Ids.length > 0
      ? await prisma.luckyDrawEntry.findMany({
          where: { customerId: session.userId, campaignId: { in: v1Ids } },
          include: { tickets: { select: { id: true } } },
        })
      : [];
  for (const e of v1Entries) {
    myCountByCampaign.set(e.campaignId, e.tickets.length);
  }

  const toDrawItem = (
    d: (typeof activeCampaigns)[0],
    joined: boolean
  ): HomeDrawItem => {
    const meta = poolMeta({
      instantPoolCents: d.instantPoolCents,
      grandPoolCents: d.grandPoolCents,
      instantPoolRatio: d.instantPoolRatio,
      dailyAvgVelocity: d.dailyAvgVelocity,
      rulesSnapshot: d.rulesSnapshot,
      voucherContributions: contribMap.get(d.id)?.sum || 0,
    });
    const kind = d.type as HomeDrawItem["kind"];
    return {
      id: d.id,
      name: d.name,
      businessName: d.business?.businessName || "",
      href: campaignHref(d.type, d.id, d.slug),
      kind,
      endDate: d.endDate.toISOString(),
      smallPoolSgd: meta.smallPoolSgd,
      grandPoolSgd: meta.grandPoolSgd,
      myCount: myCountByCampaign.get(d.id) || 0,
      grandDaysPredicted: meta.grandDaysPredicted,
      grandProgress: meta.grandProgress,
      prizes: meta.prizes,
      joined,
    };
  };

  const joinedIds = new Set(
    [...myCountByCampaign.entries()].filter(([, n]) => n > 0).map(([id]) => id)
  );

  const myDraws = activeCampaigns
    .filter((d) => joinedIds.has(d.id))
    .map((d) => toDrawItem(d, true));

  const openDraws = activeCampaigns
    .filter((d) => d.type === "lucky_draw_v2" || d.type === "voucher_sale" || d.type === "lucky_draw")
    .map((d) => toDrawItem(d, joinedIds.has(d.id)));

  const totalBalanceCents = myVouchers.reduce((s, v) => s + v.balanceCents, 0);
  const savedThisMonth = monthlySavings._sum.amountSaved || 0;

  // Stores: memberships + businesses from vouchers not already listed
  const bizCampaignCounts = await prisma.campaign.groupBy({
    by: ["businessId"],
    where: {
      businessId: { in: memberships.map((m) => m.businessId) },
      status: "active",
      endDate: { gt: new Date() },
    },
    _count: { id: true },
  });
  const campaignCountMap = new Map(
    bizCampaignCounts.map((r) => [r.businessId, r._count.id])
  );

  const storeItems = memberships.map((m) => ({
    businessId: m.business.id,
    businessName: m.business.businessName || (lang === "zh" ? "商家" : "Business"),
    businessSlug: m.business.businessSlug,
    businessLogo: m.business.businessLogo,
    points: m.points,
    tier: m.tier,
    campaignCount: campaignCountMap.get(m.businessId) || 0,
    isFavorite: m.isFavorite,
  }));

  // Vouchers without membership still surface the merchant (brand-level)
  if (storeItems.length === 0 && myVouchers.length > 0) {
    const seen = new Set<string>();
    for (const v of myVouchers) {
      const b = v.campaign?.business;
      if (!b || seen.has(b.id)) continue;
      seen.add(b.id);
      storeItems.push({
        businessId: b.id,
        businessName: b.businessName || (lang === "zh" ? "商家" : "Business"),
        businessSlug: b.businessSlug,
        businessLogo: b.businessLogo,
        points: 0,
        tier: "regular",
        campaignCount: 0,
        isFavorite: false,
      });
    }
  }

  // Discover coupons not claimed
  const claimedIds = await prisma.customerCoupon.findMany({
    where: { customerId: session.userId, status: "available" },
    select: { couponId: true },
  });
  const claimedSet = new Set(claimedIds.map((c) => c.couponId));
  const openCoupons = discoverCoupons.filter((c) => !claimedSet.has(c.id)).slice(0, 4);

  const displayName =
    user.displayName || user.phone || (lang === "zh" ? "朋友" : "there");

  return (
    <div className="pb-4">
      {/* Compact header — not platform points wall */}
      <div className="px-4 pt-5 pb-3 border-b border-slate-50">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-400">{t("home.greeting", lang)}</p>
            <p className="text-lg font-semibold text-slate-900 truncate">{displayName}</p>
          </div>
          <Link
            href="/balance"
            className="shrink-0 text-right rounded-2xl bg-amber-50 border border-amber-100 px-3 py-2"
          >
            <p className="text-[10px] text-amber-700">{t("home.balancePeek", lang)}</p>
            <p className="text-base font-bold text-amber-600">
              S${formatMoney(totalBalanceCents)}
            </p>
          </Link>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-6">
        <HomeDrawsSection myDraws={myDraws} openDraws={openDraws} />

        {/* Sections render only with content — new users see discover, not stacked empty cards */}
        {myVouchers.length > 0 && (
          <HomeVouchersSection
            lang={lang}
            totalBalanceCents={totalBalanceCents}
            vouchers={myVouchers.map((v) => ({
              id: v.id,
              campaignName: v.campaign?.name || "—",
              kind: v.campaign?.type === "lucky_draw_v2" ? "draw" : "discount",
              balanceCents: v.balanceCents,
              amountCents: v.amountCents,
              storeName: v.store?.name || null,
            }))}
            savedThisMonth={savedThisMonth}
          />
        )}

        {storeItems.length > 0 && (
          <HomeStoresSection lang={lang} stores={storeItems} />
        )}

        {/* Hot merchants for new & returning users */}
        <HomeHotStoresSection lang={lang} stores={hotStores} />

        {/* Light discover: free coupons preview + view all */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <h2 className="text-sm font-semibold text-slate-900">
              {t("home.section.discoverCoupons", lang)}
            </h2>
            <Link
              href="/discover/coupons"
              className="text-xs font-medium text-[#1A6EFF]"
            >
              {t("home.vouchers.viewAll", lang)}
            </Link>
          </div>
          {openCoupons.length > 0 ? (
            openCoupons.map((coupon) => {
              const display =
                coupon.type === "percentage"
                  ? `${(coupon.valueCents / 100).toFixed(0)}${t("home.deal.off", lang)}`
                  : coupon.type === "free_item"
                  ? t("home.deal.free", lang)
                  : `S$${(coupon.valueCents / 100).toFixed(0)}`;
              return (
                <Link key={coupon.id} href={`/coupons/${coupon.id}`}>
                  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2.5 hover:border-[#1A6EFF]/30">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#FF6B35]">{display}</p>
                      <p className="text-xs text-slate-800 truncate">{coupon.title}</p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {coupon.business.businessName}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-white bg-[#1A6EFF] px-2.5 py-1 rounded-full">
                      {t("home.claim", lang)}
                    </span>
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="text-center py-5 px-4 rounded-2xl bg-slate-50 border border-slate-100">
              <p className="text-sm text-slate-600">
                {t("home.discover.emptyTitle", lang)}
              </p>
              <Link
                href="/discover/coupons"
                className="inline-flex mt-3 px-4 py-1.5 rounded-full text-xs font-semibold bg-white border border-slate-200 text-slate-700"
              >
                {t("home.vouchers.viewAll", lang)}
              </Link>
            </div>
          )}
        </section>

        {myDraws.length === 0 &&
          openDraws.length === 0 &&
          myVouchers.length === 0 &&
          storeItems.length === 0 &&
          openCoupons.length === 0 &&
          hotStores.length === 0 && (
            <div className="text-center py-6 px-4 rounded-2xl bg-slate-50 border border-slate-100">
              <p className="text-sm text-slate-600">{t("home.discover.empty", lang)}</p>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                {t("home.discover.emptyHint", lang)}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <Link
                  href="/discover/draws"
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-slate-200 text-slate-700"
                >
                  {t("home.draws.browse", lang)}
                </Link>
                <Link
                  href="/discover/coupons"
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-slate-200 text-slate-700"
                >
                  {t("discover.coupons.browse", lang)}
                </Link>
                <Link
                  href="/discover/stores"
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-slate-200 text-slate-700"
                >
                  {t("discover.stores.browse", lang)}
                </Link>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

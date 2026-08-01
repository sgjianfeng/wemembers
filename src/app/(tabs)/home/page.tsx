import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { formatMoney } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { cookies } from "next/headers";
import Link from "next/link";
import { HomeActivityEntitlements } from "@/components/customer/HomeActivityEntitlements";
import { HomeStoresSection } from "@/components/customer/HomeStoresSection";
import { HomeHotStoresSection } from "@/components/customer/HomeHotStoresSection";
import { listHotStores } from "@/lib/discover-stores";
import {
  listJoinableActivities,
  offerBlurb,
} from "@/lib/discover-activities";
import {
  buildCustomerActivityBundles,
  buildDiscoverActivityBundles,
} from "@/lib/activity-entitlements";

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
    activities,
    myVouchers,
    myCoupons,
    memberships,
    monthlySavings,
    hotStores,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, displayName: true, phone: true },
    }),
    listJoinableActivities({
      limit: 20,
      customerId: session.userId,
      listScope: "hot",
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
    prisma.customerCoupon.findMany({
      where: {
        customerId: session.userId,
        status: "available",
      },
      include: {
        coupon: {
          include: {
            business: { select: { businessName: true } },
            campaign: { select: { id: true, name: true, type: true, slug: true } },
          },
        },
      },
      orderBy: { claimedAt: "desc" },
      take: 40,
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
    listHotStores(8),
  ]);

  if (!user) redirect("/api/auth/logout?next=/auth/login");

  const totalBalanceCents = myVouchers.reduce((s, v) => s + v.balanceCents, 0);
  const savedThisMonth = monthlySavings._sum.amountSaved || 0;

  const langCode = lang === "en" ? "en" : "zh";

  const mineBundles = buildCustomerActivityBundles({
    lang: langCode,
    claims: myCoupons.map((c) => {
      const expires = c.expiresAt ?? c.coupon.validUntil;
      return {
        id: c.id,
        status: c.status,
        campaignId: c.coupon.campaignId || c.coupon.campaign?.id || null,
        campaignName: c.coupon.campaign?.name || null,
        campaignType: c.coupon.campaign?.type || null,
        businessName: c.coupon.business?.businessName || null,
        title: c.coupon.title,
        valueCents: c.coupon.valueCents,
        validUntil: expires.toISOString(),
        href: `/redeem/${c.id}`,
      };
    }),
    draws: myVouchers
      .filter((v) => v.drawWeight > 0)
      .map((v) => ({
        id: v.id,
        campaignId: v.campaignId,
        campaignName: v.campaign?.name || null,
        businessName: v.campaign?.business?.businessName || null,
        drawWeight: v.drawWeight,
        shortCode: v.shortCode,
        isGiftEntry:
          v.paidCents === 0 ||
          v.paymentMethod === "free" ||
          v.issueReason === "marketing",
        balanceCents: v.balanceCents,
        amountCents: v.amountCents,
        href: "/balance",
      })),
    prepaid: myVouchers
      .filter((v) => v.balanceCents > 0 && v.drawWeight <= 0)
      .map((v) => ({
        id: v.id,
        campaignId: v.campaignId,
        campaignName: v.campaign?.name || null,
        businessName: v.campaign?.business?.businessName || null,
        balanceCents: v.balanceCents,
        amountCents: v.amountCents,
        href: "/balance",
      })),
  });

  // 热门活动广告：优先国庆/已 join，用同一卡片壳
  const discoverBundles = buildDiscoverActivityBundles(
    activities.map((a) => ({
      id: a.id,
      name: a.name,
      businessName: a.businessName,
      type: a.displayMode === "draw" ? "lucky_draw_v2" : "voucher_sale",
      href: a.href,
      blurb: offerBlurb(a, langCode),
      joined: a.joined,
      kindTag: a.kindTag,
    })),
    langCode
  );

  const bizCampaignCounts = await prisma.campaign.groupBy({
    by: ["businessId"],
    where: {
      businessId: { in: memberships.map((m) => m.businessId) },
      status: "active",
      role: { not: "product_mirror" },
      endDate: { gt: new Date() },
    },
    _count: { id: true },
  });
  const campaignCountMap = new Map(
    bizCampaignCounts.map((r) => [r.businessId, r._count.id])
  );

  const storeItems = memberships.map((m) => ({
    businessId: m.business.id,
    businessName:
      m.business.businessName || (lang === "zh" ? "商家" : "Business"),
    businessSlug: m.business.businessSlug,
    businessLogo: m.business.businessLogo,
    points: m.points,
    tier: m.tier,
    campaignCount: campaignCountMap.get(m.businessId) || 0,
    isFavorite: m.isFavorite,
  }));

  if (storeItems.length === 0 && myVouchers.length > 0) {
    const seen = new Set<string>();
    for (const v of myVouchers) {
      const b = v.campaign?.business;
      if (!b || seen.has(b.id)) continue;
      seen.add(b.id);
      storeItems.push({
        businessId: b.id,
        businessName:
          b.businessName || (lang === "zh" ? "商家" : "Business"),
        businessSlug: b.businessSlug,
        businessLogo: b.businessLogo,
        points: 0,
        tier: "regular",
        campaignCount: 0,
        isFavorite: false,
      });
    }
  }

  const displayName =
    user.displayName || user.phone || (lang === "zh" ? "朋友" : "there");

  return (
    <div className="pb-4">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 shadow-sm">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">
              {t("home.greeting", lang)}
            </p>
            <p className="text-base font-semibold text-foreground truncate mt-0.5">
              {displayName}
            </p>
          </div>
          <Link
            href="/balance"
            className="shrink-0 text-right pl-3 border-l border-border active:opacity-80 transition-opacity"
          >
            <p className="text-[10px] text-muted-foreground">
              {t("home.balancePeek", lang)}
            </p>
            <p className="text-[15px] font-bold text-foreground nums tracking-tight mt-0.5">
              S${formatMoney(totalBalanceCents)}
            </p>
          </Link>
        </div>
      </div>

      <div className="px-4 mt-1 space-y-6">
        {/* 统一心智：活动 + 权益；广告与持仓同一结构 */}
        <HomeActivityEntitlements
          lang={langCode}
          mine={mineBundles}
          discover={discoverBundles}
        />

        {storeItems.length > 0 && (
          <HomeStoresSection lang={lang} stores={storeItems} />
        )}

        <HomeHotStoresSection lang={lang} stores={hotStores} />

        <p className="text-center text-[11px] text-muted-foreground pb-2">
          <Link
            href="/discover/coupons"
            className="text-muted-foreground/80 underline-offset-2 hover:underline"
          >
            {lang === "en"
              ? "Legacy free coupons (optional)"
              : "更多 · 免费优惠券（可选）"}
          </Link>
          {savedThisMonth > 0 && (
            <span className="block mt-1 text-muted-foreground/70">
              {lang === "en"
                ? `Saved S$${Number(savedThisMonth).toFixed(0)} this month`
                : `本月已省 S$${Number(savedThisMonth).toFixed(0)}`}
            </span>
          )}
        </p>

        {mineBundles.length === 0 &&
          discoverBundles.length === 0 &&
          storeItems.length === 0 &&
          hotStores.length === 0 && (
            <div className="text-center py-6 px-4 rounded-2xl bg-muted/50 border border-border">
              <p className="text-sm text-muted-foreground">
                {lang === "en"
                  ? "Nothing here yet"
                  : "暂无优惠"}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1.5 leading-relaxed">
                {lang === "en"
                  ? "Store credit and prize draws will show when stores go live."
                  : "门店上架到店代金或抽奖后会出现在这里。"}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <Link
                  href="/discover/draws"
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-card border border-border text-foreground active:scale-[0.97] transition-transform"
                >
                  {lang === "en" ? "Browse offers" : "看看优惠"}
                </Link>
                <Link
                  href="/discover/stores"
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-card border border-border text-foreground active:scale-[0.97] transition-transform"
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

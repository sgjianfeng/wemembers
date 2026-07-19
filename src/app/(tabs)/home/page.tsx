import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatPoints } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { cookies } from "next/headers";
import Link from "next/link";
import { DailyCheckIn } from "@/components/customer/DailyCheckIn";
import { CountdownCard } from "@/components/customer/CountdownCard";
import { VoucherTabs } from "./VoucherTabs";

/* ─── Tier config ─── */
const TIER_THRESHOLDS: Record<string, { next: string | null; threshold: number }> = {
  regular: { next: "silver", threshold: 500 },
  silver: { next: "gold", threshold: 2000 },
  gold: { next: "platinum", threshold: 10000 },
  platinum: { next: null, threshold: Infinity },
};

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  regular: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
  silver: { bg: "bg-zinc-100", text: "text-zinc-600", border: "border-zinc-300" },
  gold: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  platinum: { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" },
};

/* ─── Helpers ─── */
function couponAttractiveness(c: {
  type: string;
  valueCents: number;
  remainingQuantity: number | null;
  claimedCount: number;
}): number {
  let score = 0;
  // Discount magnitude
  if (c.type === "free_item") score += 100;
  else if (c.type === "percentage") score += c.valueCents / 100; // 70 = 70% off
  else score += c.valueCents / 200; // $15 off = 7.5

  // Scarcity bonus
  if (c.remainingQuantity !== null && c.remainingQuantity <= 10) score += 20;
  if (c.remainingQuantity !== null && c.remainingQuantity <= 3) score += 10;

  // Popularity
  score += Math.min(c.claimedCount / 10, 15);

  return score;
}

export default async function CustomerHome() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  /* ─── Parallel data fetch ─── */
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    user,
    monthlySavings,
    totalSavings,
    activeDraws,
    allCoupons,
    myClaimedIds,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      include: { tokenAccount: { select: { balance: true } } },
    }),
    prisma.redemptionLog.aggregate({
      where: { customerId: session.userId, redeemedAt: { gte: monthStart } },
      _sum: { amountSaved: true },
    }),
    prisma.redemptionLog.aggregate({
      where: { customerId: session.userId },
      _sum: { amountSaved: true },
    }),
    prisma.campaign.findMany({
      where: { type: "lucky_draw", status: "active", endDate: { gt: new Date() } },
      include: { business: { select: { businessName: true } } },
      orderBy: { endDate: "asc" },
      take: 3,
    }),
    prisma.coupon.findMany({
      where: {
        status: "published",
        validUntil: { gt: new Date() },
        OR: [{ remainingQuantity: { gte: 1 } }, { remainingQuantity: null }],
      },
      include: { business: { select: { id: true, businessName: true } } },
      orderBy: { claimedCount: "desc" },
      take: 30,
    }),
    prisma.customerCoupon.findMany({
      where: { customerId: session.userId, status: "available" },
      select: { couponId: true },
    }),
  ]);

  if (!user) redirect("/api/auth/logout?next=/auth/login");

  // Re-fetch entries with actual campaign IDs
  const campaignIds = activeDraws.map((d) => d.id);
  const entries = campaignIds.length > 0
    ? await prisma.luckyDrawEntry.findMany({
        where: { customerId: session.userId, campaignId: { in: campaignIds } },
        include: { tickets: { select: { id: true } } },
      })
    : [];

  /* ─── Derived data ─── */
  const tier = TIER_THRESHOLDS[user.membershipTier] || TIER_THRESHOLDS.regular;
  const tierColor = TIER_COLORS[user.membershipTier] || TIER_COLORS.regular;
  const tierLabel = t(`home.tier.${user.membershipTier}`, lang);
  const progress = tier.next
    ? Math.min(100, Math.round((user.lifetimePoints / tier.threshold) * 100))
    : 100;

  const savedThisMonth = monthlySavings._sum.amountSaved || 0;
  const savedTotal = totalSavings._sum.amountSaved || 0;

  // Build draw cards data
  const drawCards = activeDraws.map((d) => {
    const entry = entries.find((e) => e.campaignId === d.id);
    return {
      id: d.id,
      name: d.name,
      slug: d.slug,
      drawDate: d.drawDate?.toISOString() || null,
      endDate: d.endDate.toISOString(),
      grandPoolSgd: ((d.instantPoolCents || 0) / 100).toFixed(2),
      totalTicketCount: d.totalTicketCount,
      businessName: d.business?.businessName || "",
      myTicketCount: entry?.tickets.length || 0,
    };
  });

  // Score and sort coupons
  const scoredCoupons = allCoupons
    .map((c) => ({
      id: c.id,
      title: c.title,
      type: c.type,
      valueCents: c.valueCents,
      pointsRequired: c.pointsRequired,
      remainingQuantity: c.remainingQuantity,
      validUntil: c.validUntil.toISOString(),
      claimedCount: c.claimedCount,
      giftType: c.giftType,
      business: { id: c.business.id, businessName: c.business.businessName },
      isClaimed: myClaimedIds.findIndex((cl) => cl.couponId === c.id) !== -1,
      _score: couponAttractiveness(c),
    }))
    .sort((a, b) => b._score - a._score);

  // Top 3 deals for featured cards
  const featuredDeals = scoredCoupons.slice(0, 3);

  // Remaining (skip featured) for the tabbed list
  const listCoupons = scoredCoupons.slice(3);

  return (
    <div className="pb-4">
      {/* ── IDENTITY CARD ── */}
      <div className={`bg-gradient-to-br from-[#1A6EFF] via-blue-600 to-[#3B82F6] px-4 pt-6 pb-5 text-white`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-white/60 text-[11px] uppercase tracking-wide">
              {lang === "zh" ? "我的积分" : "My Points"}
            </p>
            <p className="text-4xl font-extrabold tracking-tight">{formatPoints(user.pointsBalance)}</p>
          </div>
          <div className={`px-3 py-1.5 rounded-full ${tierColor.bg} ${tierColor.text} text-xs font-semibold`}>
            {tierLabel}
          </div>
        </div>

        {/* Tier progress */}
        {tier.next && (
          <div className="mb-3">
            <div className="flex justify-between text-[11px] text-white/60 mb-1">
              <span>{t("home.toNextTier", lang, { name: t(`home.tier.${tier.next}`, lang), points: String(tier.threshold - user.lifetimePoints) })}</span>
              <span>{user.lifetimePoints}/{tier.threshold}</span>
            </div>
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#FF6B35] rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-lg font-bold">S${savedTotal.toFixed(0)}</p>
            <p className="text-[10px] text-white/50">{t("home.identity.totalSaved", lang)}</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold">{user.streakDays}</p>
            <p className="text-[10px] text-white/50">{lang === "zh" ? "连续签到" : "Streak"}</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold">{myClaimedIds.length}</p>
            <p className="text-[10px] text-white/50">{lang === "zh" ? "持有券" : "Vouchers"}</p>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* ── COUNTDOWN CARD ── */}
        <CountdownCard draws={drawCards} />

        {/* ── FEATURED DEAL CARDS ── */}
        {featuredDeals.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <span>{t("home.section.hotDeals", lang)}</span>
            </h2>
            {featuredDeals.map((deal) => {
              const displayValue =
                deal.type === "percentage"
                  ? `${(deal.valueCents / 100).toFixed(0)}${lang === "zh" ? "折" : "% OFF"}`
                  : deal.type === "free_item"
                  ? (lang === "zh" ? "免单" : "FREE")
                  : `$${(deal.valueCents / 100).toFixed(0)}`;
              const scarce = deal.remainingQuantity !== null && deal.remainingQuantity > 0 && deal.remainingQuantity <= 10;
              const daysLeft = Math.ceil((new Date(deal.validUntil).getTime() - Date.now()) / 86400000);

              return (
                <Link key={deal.id} href={`/coupons/${deal.id}`}>
                  <Card
                    className={`overflow-hidden hover:shadow-md transition-all border-2 ${
                      deal.isClaimed
                        ? "border-green-200 bg-green-50/30"
                        : scarce
                        ? "border-red-200 bg-red-50/30"
                        : deal.type === "free_item"
                        ? "border-violet-200 bg-violet-50/30"
                        : "border-[#FF6B35]/20 bg-orange-50/30"
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {/* Big discount number */}
                        <div className={`shrink-0 w-16 h-16 rounded-2xl flex flex-col items-center justify-center ${
                          deal.type === "free_item"
                            ? "bg-violet-100 text-violet-700"
                            : deal.type === "percentage"
                            ? "bg-[#FF6B35]/10 text-[#FF6B35]"
                            : "bg-blue-100 text-blue-700"
                        }`}>
                          <span className="text-xl font-extrabold leading-none">
                            {deal.type === "percentage"
                              ? `${(deal.valueCents / 100).toFixed(0)}`
                              : deal.type === "free_item"
                              ? "🎁"
                              : `$${(deal.valueCents / 100).toFixed(0)}`}
                          </span>
                          {deal.type === "percentage" && (
                            <span className="text-[10px] font-bold">OFF</span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-semibold text-slate-900 truncate">{deal.title}</p>
                            {scarce && (
                              <Badge variant="orange" size="sm">
                                {lang === "zh" ? `仅剩${deal.remainingQuantity}` : `${deal.remainingQuantity} left`}
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400">{deal.business.businessName}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="slate" size="sm">{deal.pointsRequired}⭐</Badge>
                            <span className="text-[10px] text-slate-400">
                              {deal.claimedCount}{lang === "zh" ? "人已领" : " claimed"}
                              {" · "}
                              {daysLeft > 0
                                ? (lang === "zh" ? `${daysLeft}天后到期` : `${daysLeft}d left`)
                                : (lang === "zh" ? "今天到期" : "Today")}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 self-center">
                          {deal.isClaimed ? (
                            <span className="px-3 py-1.5 bg-green-100 text-green-600 text-[11px] rounded-full font-medium">
                              {t("home.claimed", lang)}
                            </span>
                          ) : (
                            <span className="px-3 py-1.5 bg-[#1A6EFF] text-white text-[11px] rounded-full font-medium">
                              {t("home.claim", lang)}
                            </span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {/* ── PRAISE CARD ── */}
        {savedThisMonth > 0 ? (
          <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-100">
            <CardContent className="p-4 text-center">
              <p className="text-2xl mb-1">🎉</p>
              <p className="text-sm font-semibold text-green-800">
                {lang === "zh"
                  ? `本月已省 S$${savedThisMonth.toFixed(0)}！`
                  : `You saved S$${savedThisMonth.toFixed(0)} this month!`}
              </p>
              {savedThisMonth > 50 && (
                <p className="text-xs text-green-600 mt-0.5">
                  {lang === "zh" ? "太棒了，继续保持！" : "Amazing, keep it up!"}
                </p>
              )}
            </CardContent>
          </Card>
        ) : savedTotal === 0 ? (
          <Card className="bg-gradient-to-r from-slate-50 to-blue-50 border-slate-100">
            <CardContent className="p-4 text-center">
              <p className="text-2xl mb-1">👋</p>
              <p className="text-sm text-slate-600">{t("home.praise.default", lang)}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {lang === "zh" ? "去领取你的第一张代金券吧！" : "Go claim your first voucher!"}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {/* ── DAILY CHECK-IN ── */}
        <DailyCheckIn />

        {/* ── VOUCHER SECTION ── */}
        <div className="pt-2">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">
            {lang === "zh" ? "发现更多" : "Discover More"}
          </h2>
          <VoucherTabs coupons={listCoupons} lang={lang} />
        </div>
      </div>
    </div>
  );
}

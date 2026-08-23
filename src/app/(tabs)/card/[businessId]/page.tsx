import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { t } from "@/lib/i18n";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { formatSgd } from "@/lib/utils";
import { getCustomerBrandCard } from "@/lib/customer-brand-cards";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { formatMoney } from "@/lib/utils";

const TIER_ORDER = ["regular", "silver", "gold", "platinum"] as const;

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const { businessId } = await params;

  const membership = await prisma.membership.findFirst({
    where: { customerId: session.userId, businessId },
    include: {
      business: {
        select: {
          id: true,
          businessName: true,
          businessSlug: true,
          businessCategory: true,
          businessLogo: true,
        },
      },
    },
  });

  if (!membership) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-4xl mb-3">💳</p>
        <p className="text-sm text-muted-foreground">{t("card.detail.notFound", lang)}</p>
        <Link
          href="/card"
          className="mt-4 text-sm font-medium text-[#1A6EFF]"
        >
          {t("card.detail.backList", lang)}
        </Link>
      </div>
    );
  }

  const brand = await getCustomerBrandCard(session.userId, businessId);

  // 必须走 getTierConfigs：商家未配置等级时它会补齐 4 档默认值。
  // 直接查表会得到空数组，进而把普通会员误判成「已达最高等级」。
  const { getTierConfigs } = await import("@/lib/points");
  const tierConfigs = await getTierConfigs(businessId);

  const tierKey = membership.tier || "regular";
  const tierLabels: Record<string, string> = {
    regular: t("profile.regular", lang),
    silver: t("profile.silver", lang),
    gold: t("profile.gold", lang),
    platinum: t("profile.platinum", lang),
  };
  const currentConfig = tierConfigs.find((tc) => tc.tier === tierKey);
  const tierLabel =
    currentConfig?.name || tierLabels[tierKey] || tierLabels.regular;

  let benefits: string[] = [];
  if (currentConfig?.benefits) {
    try {
      const parsed = JSON.parse(currentConfig.benefits);
      if (Array.isArray(parsed)) benefits = parsed.map(String);
    } catch {
      benefits = [];
    }
  }

  const tierBonus = currentConfig?.cashbackBonusPercent ?? 0;

  const idx = TIER_ORDER.indexOf(tierKey as (typeof TIER_ORDER)[number]);
  const nextTierKey =
    idx >= 0 && idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : null;
  const nextConfig = nextTierKey
    ? tierConfigs.find((tc) => tc.tier === nextTierKey)
    : null;
  const nextLabel = nextConfig?.name || (nextTierKey ? tierLabels[nextTierKey] : null);
  // 升级进度按累计积分算：花掉的积分不该把进度条往回拉
  const pointsToNext =
    nextConfig != null
      ? Math.max(0, nextConfig.pointsRequired - membership.lifetimePoints)
      : null;

  const shopHref = membership.business.businessSlug
    ? `/shop/${membership.business.businessSlug}`
    : null;

  const gradient =
    tierKey === "platinum"
      ? "from-violet-600 to-purple-500"
      : tierKey === "gold"
        ? "from-amber-500 to-yellow-400"
        : tierKey === "silver"
          ? "from-slate-500 to-slate-400"
          : "from-[#1A6EFF] to-[#3B82F6]";

  return (
    <div className="pb-6">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Link href="/card" className="text-sm text-[#1A6EFF] font-medium">
          ← {t("card.detail.backList", lang)}
        </Link>
      </div>

      <div className="px-4 mt-4">
        <div
          className={`rounded-2xl bg-gradient-to-br ${gradient} p-5 text-white shadow-md`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-white/70">
                {membership.business.businessCategory || "WeMembers"}
              </p>
              <p className="text-xl font-bold mt-1 truncate">
                {membership.business.businessName ||
                  t("card.unknownShop", lang)}
              </p>
            </div>
            <Badge
              variant="slate"
              size="sm"
              className="!bg-white/20 !text-white shrink-0"
            >
              {tierLabel}
            </Badge>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-2">
            <div>
              <p className="text-[10px] text-white/70">
                {t("card.detail.points", lang)}
              </p>
              <p className="text-lg font-bold">{membership.points}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/70">
                {t("card.detail.visits", lang)}
              </p>
              <p className="text-lg font-bold">{membership.visitsCount}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/70">
                {t("card.detail.spent", lang)}
              </p>
              <p className="text-lg font-bold">
                S${formatMoney(Math.round(membership.totalSpent * 100))}
              </p>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-white/80">
            {nextTierKey && nextLabel && pointsToNext != null
              ? t("card.detail.nextTier", lang, {
                  name: nextLabel,
                  points: pointsToNext,
                })
              : t("card.detail.maxTier", lang)}
          </p>
        </div>
      </div>

      {brand && brand.spendableCents > 0 && (
        <div className="px-4 mt-5">
          <h2 className="text-sm font-semibold text-foreground mb-2">
            {lang === "en" ? "My balance here" : "我在这家店的余额"}
          </h2>
          <Card>
            <CardContent className="p-4 space-y-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">
                  {lang === "en" ? "Available" : "可用合计"}
                </span>
                <span className="text-xl font-bold tabular-nums">
                  {formatSgd(brand.spendableCents)}
                </span>
              </div>
              <div className="border-t border-border pt-2.5 space-y-1.5">
                {brand.cashbackCents > 0 && (
                  <BalanceRow
                    label={lang === "en" ? "Spend credit" : "消费抵扣额度"}
                    hint={lang === "en" ? "not withdrawable" : "不可提现"}
                    cents={brand.cashbackCents}
                  />
                )}
                {brand.purchaseCents > 0 && (
                  <BalanceRow
                    label={lang === "en" ? "Prepaid balance" : "购券余额"}
                    hint={lang === "en" ? "withdrawable" : "可提现"}
                    cents={brand.purchaseCents}
                  />
                )}
                {brand.prizeCents > 0 && (
                  <BalanceRow
                    label={lang === "en" ? "Prize vouchers" : "中奖奖励券"}
                    hint={lang === "en" ? "not withdrawable" : "不可提现"}
                    cents={brand.prizeCents}
                  />
                )}
              </div>
              {brand.couponCount > 0 && (
                <Link
                  href="/wallet"
                  className="block text-xs text-[#1A6EFF] pt-1"
                >
                  {lang === "en"
                    ? `${brand.couponCount} coupons →`
                    : `另有 ${brand.couponCount} 张优惠券 →`}
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="px-4 mt-5">
        <h2 className="text-sm font-semibold text-foreground mb-2">
          {t("card.detail.benefits", lang)}
        </h2>
        <Card>
          <CardContent className="p-4">
            {/* 等级的实际效果放在文案权益之前——这是唯一会真正改变金额的一条 */}
            {tierBonus > 0 && (
              <div className="mb-3 pb-3 border-b border-border flex items-start gap-2">
                <span className="text-amber-500 shrink-0">✦</span>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {lang === "en"
                      ? `+${tierBonus}% extra cashback`
                      : `消费额外多返 ${tierBonus}%`}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {lang === "en"
                      ? "Applied automatically on top of the store's base rate."
                      : "在门店活动基础返现比例上自动叠加，无需操作"}
                  </p>
                </div>
              </div>
            )}
            {benefits.length > 0 ? (
              <ul className="space-y-2">
                {benefits.map((b, i) => (
                  <li
                    key={i}
                    className="text-sm text-foreground/90 flex items-start gap-2"
                  >
                    <span className="text-amber-500 shrink-0">✦</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            ) : tierBonus > 0 ? null : (
              <p className="text-xs text-muted-foreground">
                {t("card.detail.noBenefits", lang)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {shopHref && (
        <div className="px-4 mt-5">
          <Link
            href={shopHref}
            className="flex items-center justify-center w-full py-3 rounded-full bg-[#1A6EFF] text-white text-sm font-semibold"
          >
            {t("card.detail.visitShop", lang)}
          </Link>
        </div>
      )}
    </div>
  );
}

function BalanceRow({
  label,
  hint,
  cents,
}: {
  label: string;
  hint: string;
  cents: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm">
        {label}
        <span className="text-[11px] text-muted-foreground ml-1.5">{hint}</span>
      </span>
      <span className="text-sm tabular-nums">{formatSgd(cents)}</span>
    </div>
  );
}

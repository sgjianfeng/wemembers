import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { t } from "@/lib/i18n";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
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
        <p className="text-sm text-slate-500">{t("card.detail.notFound", lang)}</p>
        <Link
          href="/card"
          className="mt-4 text-sm font-medium text-[#1A6EFF]"
        >
          {t("card.detail.backList", lang)}
        </Link>
      </div>
    );
  }

  const tierConfigs = await prisma.membershipTierConfig.findMany({
    where: { businessId },
    orderBy: { pointsRequired: "asc" },
  });

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

  const idx = TIER_ORDER.indexOf(tierKey as (typeof TIER_ORDER)[number]);
  const nextTierKey =
    idx >= 0 && idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : null;
  const nextConfig = nextTierKey
    ? tierConfigs.find((tc) => tc.tier === nextTierKey)
    : null;
  const nextLabel = nextConfig?.name || (nextTierKey ? tierLabels[nextTierKey] : null);
  const pointsToNext =
    nextConfig != null
      ? Math.max(0, nextConfig.pointsRequired - membership.points)
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
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
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

      <div className="px-4 mt-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">
          {t("card.detail.benefits", lang)}
        </h2>
        <Card>
          <CardContent className="p-4">
            {benefits.length > 0 ? (
              <ul className="space-y-2">
                {benefits.map((b, i) => (
                  <li
                    key={i}
                    className="text-sm text-slate-700 flex items-start gap-2"
                  >
                    <span className="text-amber-500 shrink-0">✦</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">
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

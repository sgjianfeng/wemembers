import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { daysUntil } from "@/lib/utils";
import Link from "next/link";
import { StatusToggle } from "./StatusToggle";

/**
 * 券详情返回路径：保留「活动 / 活动券」上下文，避免误回营销券总库
 * from=campaign|offers|coupons；无 from 时若券已挂活动则回活动
 */
export default async function CouponDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ from?: string; campaignId?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";
  const coupon = await prisma.coupon.findFirst({
    where: { id, businessId: session.userId },
    include: {
      claims: {
        take: 10,
        orderBy: { claimedAt: "desc" },
        include: { customer: { select: { displayName: true, phone: true } } },
      },
      campaign: { select: { id: true, name: true } },
    },
  });

  if (!coupon)
    return (
      <div className="p-8 text-center text-muted-foreground">
        {t("business.coupons.detail.notFound", lang)}
      </div>
    );

  const from = sp.from || "";
  const campaignIdParam = sp.campaignId || coupon.campaignId || coupon.campaign?.id || "";

  let backHref = "/business/coupons";
  let backLabel = t("common.back", lang);
  if (from === "offers") {
    backHref = "/business/offers";
    backLabel = lang === "en" ? "← Activity perks" : "← 活动券";
  } else if (from === "campaign" && campaignIdParam) {
    backHref = `/business/campaigns/${campaignIdParam}`;
    backLabel = lang === "en" ? "← Activity" : "← 活动";
  } else if (from !== "coupons" && campaignIdParam) {
    // 无明确 from、但券属于某活动 → 回活动设置
    backHref = `/business/campaigns/${campaignIdParam}`;
    backLabel = lang === "en" ? "← Activity" : "← 活动";
  } else {
    backLabel = lang === "en" ? "← Gift catalog" : "← 权益券";
  }

  const statusBadge: Record<
    string,
    { variant: "green" | "orange" | "red" | "slate"; label: string }
  > = {
    published: {
      variant: "green",
      label: t("business.coupons.status.published", lang),
    },
    draft: { variant: "slate", label: t("business.coupons.status.draft", lang) },
    paused: {
      variant: "orange",
      label: t("business.coupons.status.paused", lang),
    },
    ended: { variant: "red", label: t("business.coupons.status.ended", lang) },
  };
  const sb = statusBadge[coupon.status] || {
    variant: "slate" as const,
    label: coupon.status,
  };
  const rate =
    coupon.claimedCount > 0
      ? Math.round((coupon.usedCount / coupon.claimedCount) * 100)
      : 0;
  const daysLeft = daysUntil(coupon.validUntil);

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
        <Link href={backHref} className="text-sm text-muted-foreground shrink-0">
          {backLabel}
        </Link>
        <h1 className="text-sm font-semibold truncate px-2">
          {t("business.coupons.detail.title", lang)}
        </h1>
        <Badge variant={sb.variant}>{sb.label}</Badge>
      </div>

      {coupon.campaign && (
        <div className="px-4 mt-3">
          <Link
            href={`/business/campaigns/${coupon.campaign.id}`}
            className="block rounded-xl border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground"
          >
            {lang === "en" ? "Part of activity: " : "所属活动："}
            <span className="font-semibold text-foreground">
              {coupon.campaign.name}
            </span>
            <span className="text-primary ml-1">→</span>
          </Link>
        </div>
      )}

      <div className="px-4 mt-4 space-y-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-3xl">🎫</span>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
                    {lang === "en" ? "Gift / perk" : "赠送 · 权益"}
                  </span>
                </div>
                <p className="text-lg font-bold text-foreground mt-0.5">
                  {coupon.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {coupon.description ||
                    t("business.coupons.detail.noDescription", lang)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Info
                label={t("coupon.detail.type", lang)}
                value={t(`coupon.typeMap.${coupon.type}`, lang)}
              />
              <Info
                label={t("business.coupons.detail.faceValue", lang)}
                value={`S$${(coupon.valueCents / 100).toFixed(coupon.type === "percentage" ? 1 : 0)}${coupon.type === "percentage" ? t("coupon.detail.discountSuffix", lang) : ""}`}
              />
              <Info
                label={t("coupon.detail.points", lang)}
                value={`${coupon.pointsRequired}⭐`}
              />
              <Info
                label={t("coupon.detail.minSpend", lang)}
                value={
                  coupon.minSpendCents > 0
                    ? `S$${(coupon.minSpendCents / 100).toFixed(0)}`
                    : t("coupon.detail.noMinSpend", lang)
                }
              />
              <Info
                label={t("coupon.detail.validity", lang)}
                value={`${coupon.validFrom.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")} ~ ${coupon.validUntil.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")}`}
              />
              <Info
                label={t("business.coupons.detail.quantity", lang)}
                value={
                  coupon.totalQuantity
                    ? `${coupon.claimedCount}/${coupon.totalQuantity}`
                    : `${coupon.claimedCount}/∞`
                }
              />
              <Info
                label={t("coupon.detail.perCustomer", lang)}
                value={t("coupon.detail.perCustomerCount", lang, {
                  count: coupon.perCustomerLimit,
                })}
              />
              <Info
                label={t("business.coupons.detail.giftable", lang)}
                value={
                  coupon.isGiftable
                    ? t("common.allowed", lang)
                    : t("common.notAllowed", lang)
                }
              />
            </div>
            {daysLeft > 0 && coupon.status === "published" && (
              <p className="text-[11px] text-muted-foreground mt-2 nums">
                {lang === "en"
                  ? `${daysLeft} days left on template window`
                  : `模版有效期还剩 ${daysLeft} 天`}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              {t("business.coupons.detail.conversionFunnel", lang)}
            </h3>
            <div className="flex items-center gap-3">
              <FunnelStep
                label={t("coupon.detail.claimed", lang)}
                value={coupon.claimedCount}
                color="bg-primary"
              />
              <span className="text-muted-foreground text-lg">→</span>
              <FunnelStep
                label={t("business.coupons.detail.redeemed", lang)}
                value={coupon.usedCount}
                color="bg-[#16A34A]"
              />
              <span className="text-muted-foreground text-lg">→</span>
              <div className="text-center">
                <p className="text-2xl font-bold text-brand">{rate}%</p>
                <p className="text-[10px] text-muted-foreground">
                  {t("business.coupons.detail.redemptionRate", lang)}
                </p>
              </div>
            </div>
            {coupon.claimedCount > 0 && coupon.usedCount > 0 && (
              <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-[#16A34A]"
                  style={{ width: `${rate}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {coupon.status !== "ended" && (
          <StatusToggle couponId={coupon.id} currentStatus={coupon.status} />
        )}

        {coupon.claims.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-foreground">
              {t("business.coupons.detail.recentClaims", lang)}
            </h3>
            <div className="space-y-1">
              {coupon.claims.map((claim) => (
                <div
                  key={claim.id}
                  className="flex items-center justify-between px-3 py-2 bg-card rounded-lg border border-border text-xs"
                >
                  <span className="text-foreground">
                    {claim.customer.displayName || claim.customer.phone}
                  </span>
                  <Badge
                    variant={
                      claim.status === "used"
                        ? "green"
                        : claim.status === "available"
                          ? "orange"
                          : "slate"
                    }
                    size="sm"
                  >
                    {claim.status === "used"
                      ? t("business.coupons.detail.redeemed", lang)
                      : claim.status === "available"
                        ? t("business.claim.status.available", lang)
                        : claim.status}
                  </Badge>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-foreground text-xs font-medium">{value}</span>
    </div>
  );
}

function FunnelStep({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="text-center">
      <div
        className={`w-10 h-10 ${color} rounded-full flex items-center justify-center text-white font-bold mx-auto`}
      >
        {value}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

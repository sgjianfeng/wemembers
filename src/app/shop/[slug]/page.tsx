import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { BrandAvatar } from "@/components/ui/BrandAvatar";
import { TopHeader } from "@/components/ui/TopHeader";
import { daysUntil, resolveStoreLogo } from "@/lib/utils";
import { SERVICE_CATEGORIES } from "@/types";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const business = await prisma.user.findFirst({
    where: { businessSlug: slug, role: "business", status: "active" },
    select: { id: true, businessName: true, businessLogo: true, businessCategory: true, businessSlug: true },
  });
  if (!business) notFound();

  const session = await getSession();
  const isLoggedIn = !!session;

  const stores = await prisma.store.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, address: true },
  });

  const coupons = await prisma.coupon.findMany({
    where: { businessId: business.id, status: "published", validUntil: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  const categoryLabel = lang === "zh"
    ? SERVICE_CATEGORIES.find((c) => c.value === business.businessCategory)?.label
    : business.businessCategory;

  const typeKey: Record<string, string> = {
    fixed_amount: "shop.type.fixed",
    percentage: "shop.type.percent",
    free_item: "shop.type.free",
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <TopHeader variant="default" title={business.businessName || ""} />

      <div className="bg-gradient-to-b from-[#1A6EFF] to-[#3B82F6] px-4 pt-8 pb-8 text-white">
        <div className="text-center">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center overflow-hidden p-1">
            {business.businessLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={business.businessLogo}
                alt={business.businessName || "Logo"}
                className="w-full h-full object-contain rounded-xl bg-white"
              />
            ) : (
              <BrandAvatar
                name={business.businessName}
                size={72}
                rounded="2xl"
                className="!border-0"
              />
            )}
          </div>
          <h1 className="text-xl font-bold mt-3">{business.businessName}</h1>
          {categoryLabel && (
            <Badge
              variant="slate"
              size="md"
              className="!bg-white/20 !text-white mt-2"
            >
              {categoryLabel}
            </Badge>
          )}
          {stores.length > 0 && (
            <p className="text-xs text-white/75 mt-2">
              {lang === "en"
                ? `${stores.length} outlet(s) · pick a store below`
                : `${stores.length} 家门店 · 下方选择具体店`}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 -mt-4 pb-8">
        <div className="bg-white rounded-t-2xl pt-5 px-1">
          {stores.length > 0 && (
            <div className="px-3 mb-5">
              <h2 className="text-base font-semibold text-slate-900 mb-3">
                {lang === "en" ? "Stores" : "门店"}
              </h2>
              <div className="space-y-2">
                {stores.map((s) => (
                  <Link
                    key={s.id}
                    href={`/shop/${business.businessSlug}/${s.slug}`}
                  >
                    <Card className="hover:border-[#1A6EFF]/30">
                      <CardContent className="p-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <BrandAvatar
                            src={resolveStoreLogo(null, business.businessLogo)}
                            name={s.name}
                            size={40}
                            rounded="xl"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {s.name}
                            </p>
                            {s.address && (
                              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                {s.address}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-[#1A6EFF] shrink-0">
                          {lang === "en" ? "Open →" : "进入 →"}
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between px-3 mb-3">
            <h2 className="text-base font-semibold text-slate-900">{t("shop.title", lang)}</h2>
            <span className="text-xs text-slate-400">
              {coupons.length}
              {t("shop.countUnit", lang)}
            </span>
          </div>

          {coupons.length > 0 ? (
            <div className="space-y-2 px-3">
              {coupons.map((c) => {
                const daysLeft = daysUntil(c.validUntil);
                const soldOut = c.remainingQuantity !== null && c.remainingQuantity <= 0;
                const typeLabel = t(typeKey[c.type] || "shop.type.fixed", lang);
                const displayValue =
                  c.type === "percentage"
                    ? `${(c.valueCents / 100).toFixed(0)}${t("shop.percentOff", lang)}`
                    : c.type === "free_item"
                      ? t("shop.free", lang)
                      : `S$${(c.valueCents / 100).toFixed(0)}`;

                return (
                  <Link key={c.id} href={`/coupons/${c.id}`}>
                    <Card className={`hover:border-[#1A6EFF]/30 transition-colors border-l-4 border-l-[#FF6B35] ${soldOut ? "opacity-50" : ""}`}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-base font-bold text-[#FF6B35]">{displayValue}</p>
                              <Badge variant="slate" size="sm">{typeLabel}</Badge>
                            </div>
                            <p className="text-sm font-medium text-slate-900 mt-1">{c.title}</p>
                            {c.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{c.description}</p>}
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <span className="text-xs text-slate-400">
                              {soldOut ? t("shop.soldOut", lang) : `${c.pointsRequired}⭐`}
                            </span>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {daysLeft > 0
                                ? t("shop.daysLeft", lang, { days: daysLeft })
                                : t("shop.soon", lang)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-dashed border-slate-50 flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">
                            {t("shop.left", lang)} {c.remainingQuantity ?? "∞"}{" "}
                            {t("shop.countUnit", lang)}
                          </span>
                          <span className="text-[10px] text-slate-400">·</span>
                          <span className="text-[10px] text-slate-400">
                            {t("shop.claimed", lang)} {c.claimedCount}{" "}
                            {t("shop.claimTimes", lang)}
                          </span>
                          {!soldOut && (
                            <span className="ml-auto inline-block px-2 py-0.5 bg-[#1A6EFF] text-white text-[10px] rounded-full">
                              {t("shop.claim", lang)}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 px-4">
              <p className="text-4xl mb-3">🎫</p>
              <p className="text-sm text-slate-400">{t("shop.noCoupons", lang)}</p>
              <p className="text-xs text-slate-300 mt-1">{t("shop.checkLater", lang)}</p>
            </div>
          )}
        </div>

        {!isLoggedIn && coupons.length > 0 && (
          <div className="mx-3 mt-4 p-4 bg-[#1A6EFF]/5 rounded-xl border border-[#1A6EFF]/10 text-center">
            <p className="text-sm text-slate-600">{t("shop.loginPrompt", lang)}</p>
            <Link href={`/auth/login?redirect=/shop/${business.businessSlug}`} className="inline-block mt-2 px-6 py-2 bg-[#1A6EFF] text-white text-sm rounded-full">{t("shop.login", lang)}</Link>
          </div>
        )}

        <div className="text-center mt-6 pb-4"><p className="text-[10px] text-slate-300">{t("shop.poweredBy", lang)}</p></div>
      </div>
    </div>
  );
}

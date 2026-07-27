import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { BrandAvatar } from "@/components/ui/BrandAvatar";
import { TopHeader } from "@/components/ui/TopHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { resolveStoreLogo } from "@/lib/utils";
import { SERVICE_CATEGORIES } from "@/types";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  listJoinableActivities,
  offerCta,
  offerKindLabel,
  offerBlurb,
  type JoinableActivity,
} from "@/lib/discover-activities";
import { Building2, MapPin, Ticket, Trophy } from "lucide-react";

function sortCompanyOffers(offers: JoinableActivity[]): JoinableActivity[] {
  // 大奖/抽奖置顶 → 折扣优惠 → 原价基础
  const rank = (o: JoinableActivity) => {
    if (o.displayMode === "draw") return 0;
    if (o.kindTag === "discount_card" || o.discountPercent > 0) return 1;
    return 2;
  };
  return [...offers].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return b.heat - a.heat;
  });
}

function storeNamesLine(o: JoinableActivity, lang: "zh" | "en"): string {
  if (o.storeCount === 0) {
    return lang === "en" ? "Stores TBA" : "门店待定";
  }
  if (o.storesAll) {
    const names = o.stores
      .slice(0, 2)
      .map((s) => s.name)
      .join(" · ");
    if (o.storeCount <= 2) {
      return names || (lang === "en" ? "All stores" : "全部门店");
    }
    return names
      ? `${names}${lang === "en" ? ` +${o.storeCount - 2}` : ` 等${o.storeCount}家`}`
      : lang === "en"
        ? `${o.storeCount} stores`
        : `${o.storeCount} 家门店`;
  }
  const names = o.stores
    .slice(0, 2)
    .map((s) => s.name)
    .join(" · ");
  if (o.storeCount <= 2) return names;
  return `${names}${lang === "en" ? ` +${o.storeCount - 2}` : ` 等${o.storeCount}家`}`;
}

export default async function ShopPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const c = await cookies();
  const lang = (c.get("gwm_lang")?.value === "en" ? "en" : "zh") as "zh" | "en";

  const business = await prisma.user.findFirst({
    where: { businessSlug: slug, role: "business", status: "active" },
    select: {
      id: true,
      businessName: true,
      businessLogo: true,
      businessCategory: true,
      businessSlug: true,
    },
  });
  if (!business) notFound();

  const session = await getSession();
  const isLoggedIn = !!session;

  const stores = await prisma.store.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, address: true },
  });

  const storeOffers = sortCompanyOffers(
    await listJoinableActivities({
      limit: 40,
      listScope: "all",
      businessId: business.id,
      customerId: session?.role === "customer" ? session.userId : null,
    })
  );

  const categoryLabel =
    lang === "zh"
      ? SERVICE_CATEGORIES.find((x) => x.value === business.businessCategory)
          ?.label
      : business.businessCategory;

  return (
    <div className="min-h-screen bg-muted/50">
      <TopHeader variant="default" title={business.businessName || ""} />

      {/* 公司页：品牌蓝顶栏 + 品牌标识（与门店页区分） */}
      <div className="bg-gradient-to-b from-slate-800 via-slate-800 to-primary px-4 pt-7 pb-10 text-white">
        <div className="text-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 border border-white/20 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide">
            <Building2 size={12} />
            {lang === "en" ? "Brand" : "品牌"}
          </span>
          <div className="mx-auto mt-3 w-20 h-20 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center overflow-hidden p-1">
            {business.businessLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={business.businessLogo}
                alt={business.businessName || "Logo"}
                className="w-full h-full object-contain rounded-xl bg-card"
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
                ? `${stores.length} outlet(s) · pick a store, or browse brand activities`
                : `${stores.length} 家门店 · 先选店，或浏览全品牌活动`}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 -mt-4 pb-8">
        <div className="bg-card rounded-t-2xl pt-5 px-1 shadow-sm">
          {stores.length > 0 && (
            <div className="px-3 mb-5">
              <h2 className="text-base font-semibold text-foreground mb-1">
                {lang === "en" ? "Choose a store" : "选择门店"}
              </h2>
              <p className="text-[11px] text-muted-foreground mb-3">
                {lang === "en"
                  ? "Open a store for outlet-specific offers"
                  : "进入门店看该店可用活动与购券"}
              </p>
              <div className="space-y-2">
                {stores.map((s) => (
                  <Link
                    key={s.id}
                    href={`/shop/${business.businessSlug}/${s.slug}`}
                  >
                    <Card className="hover:border-primary/30 active:scale-[0.98] transition-transform">
                      <CardContent className="p-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <BrandAvatar
                            src={resolveStoreLogo(
                              null,
                              business.businessLogo
                            )}
                            name={s.name}
                            size={40}
                            rounded="xl"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {s.name}
                            </p>
                            {s.address && (
                              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {s.address}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-primary shrink-0 font-medium">
                          {lang === "en" ? "Enter →" : "进入 →"}
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between px-3 mb-1">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {lang === "en" ? "Brand activities" : "门店活动"}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {lang === "en"
                  ? "Across outlets · draws first"
                  : "全品牌活动 · 大奖优先展示"}
              </p>
            </div>
            <span className="text-xs text-muted-foreground nums">
              {storeOffers.length}
            </span>
          </div>

          {storeOffers.length > 0 ? (
            <div className="space-y-2.5 px-3 mb-6 mt-3">
              {storeOffers.map((offer) => {
                const isDraw = offer.displayMode === "draw";
                const storesLine = storeNamesLine(offer, lang);
                return (
                  <Link key={offer.id} href={offer.href}>
                    <Card
                      className={`hover:border-primary/30 active:scale-[0.98] transition-transform overflow-hidden ${
                        isDraw
                          ? "border-amber-300/80 dark:border-amber-700/50 shadow-sm ring-1 ring-amber-200/40 dark:ring-amber-800/30"
                          : "border-border"
                      }`}
                    >
                      {isDraw && (
                        <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-500" />
                      )}
                      <CardContent
                        className={`p-3 flex items-center justify-between gap-2 ${
                          isDraw ? "bg-amber-50/40 dark:bg-amber-950/20" : ""
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <span
                            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                              isDraw
                                ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm"
                                : offer.kindTag === "discount_card"
                                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600"
                                  : "bg-primary/10 text-primary"
                            }`}
                          >
                            {isDraw ? (
                              <Trophy size={18} />
                            ) : (
                              <Ticket size={18} />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge
                                variant={isDraw ? "orange" : "slate"}
                                size="sm"
                              >
                                {offerKindLabel(offer.kindTag, lang)}
                              </Badge>
                              {isDraw && (
                                <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-full">
                                  {lang === "en" ? "FEATURED" : "大奖"}
                                </span>
                              )}
                              {offer.listScope === "store" && !isDraw && (
                                <span className="text-[9px] text-muted-foreground">
                                  {lang === "en" ? "Base" : "基础"}
                                </span>
                              )}
                              {offer.discountPercent > 0 && !isDraw && (
                                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full">
                                  −{offer.discountPercent}%
                                </span>
                              )}
                            </div>
                            <p
                              className={`font-semibold text-foreground mt-1 truncate ${
                                isDraw ? "text-[15px]" : "text-sm"
                              }`}
                            >
                              {offer.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                              {offerBlurb(offer, lang)}
                            </p>
                            <p className="flex items-center gap-1 text-[11px] text-foreground/70 mt-1.5 font-medium">
                              <MapPin
                                size={12}
                                className="shrink-0 text-primary/70"
                              />
                              <span className="truncate">{storesLine}</span>
                            </p>
                          </div>
                        </div>
                        <span
                          className={`shrink-0 inline-block px-3 py-1.5 text-xs font-semibold rounded-full ${
                            isDraw
                              ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white"
                              : "bg-primary text-primary-foreground"
                          }`}
                        >
                          {offerCta(offer, lang)}
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon="coupons"
              title={
                lang === "en" ? "No brand activities yet" : "暂无门店活动"
              }
              description={
                lang === "en"
                  ? "When this brand lists products, they will show here."
                  : "商家上架券产品并开放门店后会出现在这里。"
              }
              className="py-8"
            />
          )}
        </div>

        {!isLoggedIn && storeOffers.length > 0 && (
          <div className="mx-3 mt-4 p-4 bg-primary/5 rounded-xl border border-primary/10 text-center">
            <p className="text-sm text-foreground/80">
              {lang === "en"
                ? "Log in to buy and keep balances in your wallet"
                : "登录后购买，余额会保存在你的券包"}
            </p>
            <Link
              href={`/auth/login?redirect=/shop/${business.businessSlug}`}
              className="inline-block mt-2 px-6 py-2 bg-primary text-primary-foreground text-sm rounded-full active:scale-[0.97] transition-transform"
            >
              {t("shop.login", lang)}
            </Link>
          </div>
        )}

        <div className="text-center mt-6 pb-4">
          <p className="text-[10px] text-muted-foreground/70">
            {t("shop.poweredBy", lang)}
          </p>
        </div>
      </div>
    </div>
  );
}

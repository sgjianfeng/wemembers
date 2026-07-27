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
} from "@/lib/discover-activities";
import { Ticket, Trophy } from "lucide-react";

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

  // 仅券产品/可购活动（不再展示可领取 Coupon）
  const storeOffers = await listJoinableActivities({
    limit: 40,
    listScope: "all",
    businessId: business.id,
    customerId: session?.role === "customer" ? session.userId : null,
  });

  const categoryLabel = lang === "zh"
    ? SERVICE_CATEGORIES.find((c) => c.value === business.businessCategory)?.label
    : business.businessCategory;

  return (
    <div className="min-h-screen bg-muted/50">
      <TopHeader variant="default" title={business.businessName || ""} />

      <div className="bg-gradient-to-b from-primary to-primary/80 px-4 pt-8 pb-8 text-primary-foreground">
        <div className="text-center">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center overflow-hidden p-1">
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
                ? `${stores.length} outlet(s) · pick a store below`
                : `${stores.length} 家门店 · 下方选择具体店`}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 -mt-4 pb-8">
        <div className="bg-card rounded-t-2xl pt-5 px-1">
          {stores.length > 0 && (
            <div className="px-3 mb-5">
              <h2 className="text-base font-semibold text-foreground mb-3">
                {lang === "en" ? "Stores" : "门店"}
              </h2>
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
                            src={resolveStoreLogo(null, business.businessLogo)}
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
                        <span className="text-[10px] text-primary shrink-0">
                          {lang === "en" ? "Open →" : "进入 →"}
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 本店优惠：含原价基础 + 9折/抽奖（先判抽奖再判代金，避免 self_use 盖掉抽奖样式） */}
          <div className="flex items-center justify-between px-3 mb-3">
            <h2 className="text-base font-semibold text-foreground">
              {lang === "en" ? "Store offers" : "本店优惠"}
            </h2>
            <span className="text-xs text-muted-foreground nums">
              {storeOffers.length}
            </span>
          </div>

          {storeOffers.length > 0 ? (
            <div className="space-y-2 px-3 mb-6">
              {storeOffers.map((offer) => {
                const isDraw = offer.displayMode === "draw";
                const L = lang === "en" ? "en" : "zh";
                return (
                  <Link key={offer.id} href={offer.href}>
                    <Card
                      className={`hover:border-primary/30 active:scale-[0.98] transition-transform border-l-4 ${
                        isDraw
                          ? "border-l-amber-500"
                          : offer.kindTag === "discount_card"
                            ? "border-l-emerald-500"
                            : "border-l-primary"
                      }`}
                    >
                      <CardContent className="p-3 flex items-center justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <span
                            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                              isDraw
                                ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600"
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
                                variant={isDraw ? "purple" : "slate"}
                                size="sm"
                              >
                                {offerKindLabel(offer.kindTag, L)}
                              </Badge>
                              {offer.listScope === "store" && (
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
                            <p className="text-sm font-semibold text-foreground mt-1 truncate">
                              {offer.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                              {offerBlurb(offer, L)}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 inline-block px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                          {offerCta(offer, L)}
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
                lang === "en"
                  ? "No offers for sale yet"
                  : "暂无可购优惠"
              }
              description={
                lang === "en"
                  ? "When this brand lists voucher products, they will show here."
                  : "商家上架券产品后会出现在这里，可直接购买。"
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

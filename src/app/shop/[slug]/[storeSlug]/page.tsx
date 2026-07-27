import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TopHeader } from "@/components/ui/TopHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { resolveStoreLogo } from "@/lib/utils";
import { BrandAvatar } from "@/components/ui/BrandAvatar";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Ticket, Trophy } from "lucide-react";
import {
  listJoinableActivities,
  offerBlurb,
  offerCta,
  offerKindLabel,
} from "@/lib/discover-activities";

/**
 * 门店顾客页（主入口）
 * URL: /shop/{company-slug}/{store-slug}
 * 仅展示本店参与的可购券产品/活动（不再展示可领取 Coupon）
 */
export default async function CompanyStorePage({
  params,
}: {
  params: Promise<{ slug: string; storeSlug: string }>;
}) {
  const { slug: companySlug, storeSlug } = await params;
  const c = await cookies();
  const lang = (c.get("gwm_lang")?.value === "en" ? "en" : "zh") as "zh" | "en";

  const business = await prisma.user.findFirst({
    where: { businessSlug: companySlug, role: "business", status: "active" },
    select: {
      id: true,
      businessName: true,
      businessSlug: true,
      businessLogo: true,
    },
  });
  if (!business) notFound();

  const store = await prisma.store.findFirst({
    where: { slug: storeSlug, businessId: business.id },
  });
  if (!store) notFound();

  const session = await getSession();
  const isLoggedIn = !!session;
  const path = `/shop/${companySlug}/${storeSlug}`;

  const allOffers = await listJoinableActivities({
    limit: 40,
    listScope: "all",
    businessId: business.id,
    customerId: session?.role === "customer" ? session.userId : null,
  });

  // 仅本店参与的活动/产品
  const storeOffers = allOffers.filter(
    (o) => o.storesAll || o.stores.some((s) => s.id === store.id)
  );

  return (
    <div className="min-h-screen bg-muted/50">
      <TopHeader variant="default" title={store.name} />

      <div className="bg-gradient-to-b from-primary to-primary/80 px-4 pt-8 pb-8 text-primary-foreground">
        <div className="text-center">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-card shadow-lg flex items-center justify-center p-1.5">
            <BrandAvatar
              src={resolveStoreLogo(null, business.businessLogo)}
              name={store.name}
              size={68}
              rounded="2xl"
              className="!border-0"
            />
          </div>
          <h1 className="text-xl font-bold mt-3">{store.name}</h1>
          <p className="text-white/70 text-xs mt-1 font-medium">
            {business.businessName}
          </p>
          {store.address && (
            <p className="text-white/60 text-xs mt-1 flex items-center justify-center gap-1">
              <MapPin size={12} /> {store.address}
            </p>
          )}
          <p className="text-white/50 text-[11px] mt-3 max-w-[280px] mx-auto leading-relaxed">
            {lang === "en"
              ? "Welcome — buy store credit or join prize draws here"
              : "欢迎光临 · 在本店购买代金或参与抽奖"}
          </p>
        </div>
      </div>

      <div className="px-4 -mt-4 pb-8">
        <div className="bg-card rounded-t-2xl pt-5 px-1">
          <div className="mx-3 mb-4 rounded-xl bg-muted/50 border border-border px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {lang === "en"
                ? "You scanned this store’s code. Pick an offer below to buy."
                : "你已扫入本店。下方为可购优惠，点进去购买即可。"}
            </p>
            {!isLoggedIn && (
              <Link
                href={`/auth/login?redirect=${encodeURIComponent(path)}`}
                className="inline-flex mt-2 h-8 items-center rounded-full bg-primary px-3 text-[11px] font-semibold text-primary-foreground active:scale-[0.97] transition-transform"
              >
                {lang === "en" ? "Log in / Register" : "登录 / 注册"}
              </Link>
            )}
          </div>

          <div className="flex items-center justify-between px-3 mb-3">
            <h2 className="text-base font-semibold text-foreground">
              {lang === "en" ? "Store offers" : "本店优惠"}
            </h2>
            <span className="text-xs text-muted-foreground nums">
              {storeOffers.length}
            </span>
          </div>

          {storeOffers.length > 0 ? (
            <div className="space-y-2 px-3 mb-4">
              {storeOffers.map((offer) => {
                const isDraw = offer.displayMode === "draw";
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
                                {offerKindLabel(offer.kindTag, lang)}
                              </Badge>
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
                              {offerBlurb(offer, lang)}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 inline-block px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-full">
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
                lang === "en"
                  ? "No offers at this store yet"
                  : "本店暂无可购优惠"
              }
              description={
                lang === "en"
                  ? "Ask staff or check back when products are listed."
                  : "商家上架并开放本店后会出现在这里。"
              }
              className="py-12"
            />
          )}
        </div>

        {!isLoggedIn && storeOffers.length > 0 && (
          <div className="mx-3 mt-4 p-4 bg-primary/5 rounded-xl text-center">
            <p className="text-sm text-foreground/80">
              {lang === "en"
                ? "Log in to buy and keep balances in your wallet"
                : "登录后购买，余额会保存在你的券包"}
            </p>
            <Link
              href={`/auth/login?redirect=${encodeURIComponent(path)}`}
              className="inline-block mt-2 px-6 py-2 bg-primary text-primary-foreground text-sm rounded-full active:scale-[0.97] transition-transform"
            >
              {t("store.public.login", lang)}
            </Link>
          </div>
        )}

        <div className="text-center mt-6">
          <p className="text-[10px] text-muted-foreground/70">
            {t("store.public.poweredBy", lang)}
          </p>
        </div>
      </div>
    </div>
  );
}

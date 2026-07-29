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

  // 仅本店参与；抽奖置顶
  const storeOffers = allOffers
    .filter((o) => o.storesAll || o.stores.some((s) => s.id === store.id))
    .sort((a, b) => {
      const rank = (o: (typeof allOffers)[0]) =>
        o.displayMode === "draw"
          ? 0
          : o.kindTag === "discount_card" || o.discountPercent > 0
            ? 1
            : 2;
      const d = rank(a) - rank(b);
      return d !== 0 ? d : b.heat - a.heat;
    });

  return (
    <div className="min-h-screen bg-muted/50">
      <TopHeader variant="default" title={store.name} />

      {/* 门店页：主色顶栏 + 本店标签（与公司品牌页区分） */}
      <div className="bg-gradient-to-b from-primary to-primary/80 px-4 pt-7 pb-10 text-primary-foreground">
        <div className="text-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/20 border border-white/25 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide">
            <MapPin size={12} />
            {lang === "en" ? "This store" : "本店"}
          </span>
          <div className="mx-auto mt-3 w-20 h-20 rounded-2xl bg-card shadow-lg flex items-center justify-center p-1.5">
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
              ? "Welcome — buy store credit or join prize draws at this outlet"
              : "欢迎光临 · 仅显示本店可购活动"}
          </p>
          <Link
            href={`/shop/${business.businessSlug}`}
            className="inline-flex mt-3 text-[11px] font-medium text-white/85 underline-offset-2 hover:underline"
          >
            {lang === "en" ? "← All brand outlets" : "← 返回品牌全部门店"}
          </Link>
        </div>
      </div>

      <div className="px-4 -mt-4 pb-8">
        <div className="bg-card rounded-t-2xl pt-5 px-1 shadow-sm">
          <div className="mx-3 mb-4 rounded-xl bg-primary/5 border border-primary/10 px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {lang === "en"
                ? "You scanned this store’s code. Offers below are available here."
                : "你已扫入本店。下方为在本店可用的活动，点进去购买即可。"}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Link
                href={`/join?storeId=${encodeURIComponent(store.id)}`}
                className="inline-flex h-8 items-center rounded-full bg-amber-500 px-3 text-[11px] font-semibold text-white active:scale-[0.97] transition-transform"
              >
                {lang === "en" ? "Pay bill · join draw" : "结账参加大奖"}
              </Link>
              {!isLoggedIn && (
                <Link
                  href={`/auth/login?redirect=${encodeURIComponent(path)}`}
                  className="inline-flex h-8 items-center rounded-full bg-primary px-3 text-[11px] font-semibold text-primary-foreground active:scale-[0.97] transition-transform"
                >
                  {lang === "en" ? "Log in / Register" : "登录 / 注册"}
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between px-3 mb-1">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {lang === "en" ? "Offers at this store" : "本店活动"}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {store.name}
              </p>
            </div>
            <span className="text-xs text-muted-foreground nums">
              {storeOffers.length}
            </span>
          </div>

          {storeOffers.length > 0 ? (
            <div className="space-y-2.5 px-3 mb-4 mt-3">
              {storeOffers.map((offer) => {
                const isDraw = offer.displayMode === "draw";
                return (
                  <Link key={offer.id} href={offer.href}>
                    <Card
                      className={`hover:border-primary/30 active:scale-[0.98] transition-transform overflow-hidden ${
                        isDraw
                          ? "border-amber-300/80 dark:border-amber-700/50 shadow-sm ring-1 ring-amber-200/40"
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
                                <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100/80 px-1.5 py-0.5 rounded-full">
                                  {lang === "en" ? "FEATURED" : "大奖"}
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
                              <span className="truncate">{store.name}</span>
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
                lang === "en"
                  ? "No offers at this store yet"
                  : "本店暂无活动"
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

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { TopHeader } from "@/components/ui/TopHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { resolveStoreLogo } from "@/lib/utils";
import { BrandAvatar } from "@/components/ui/BrandAvatar";
import { ShopActivityShelf } from "@/components/shop/ShopActivityShelf";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { listJoinableActivities } from "@/lib/discover-activities";

/**
 * 门店顾客页（主入口）
 * URL: /shop/{company-slug}/{store-slug}
 * 组织：活动 → 权益（满赠）/ 可购产品；返回优先品牌页
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
      displayName: true,
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
  const brandPath = `/shop/${business.businessSlug}`;
  const brandName =
    business.displayName?.trim() || business.businessName?.trim() || "";

  const allOffers = await listJoinableActivities({
    limit: 40,
    listScope: "all",
    businessId: business.id,
    customerId: session?.role === "customer" ? session.userId : null,
  });

  // 仅本店参与的活动
  const storeOffers = allOffers.filter(
    (o) => o.storesAll || o.stores.some((s) => s.id === store.id)
  );

  const nNdp = storeOffers.filter((o) => o.category === "ndp").length;
  const nDraw = storeOffers.filter(
    (o) => o.category === "grand_countdown"
  ).length;
  const nLong = storeOffers.filter((o) => o.category === "long_term").length;

  return (
    <div className="min-h-screen bg-muted/50">
      {/* 扫店码直达：无 history 时回品牌页，避免 back 丢到外站/空白 */}
      <TopHeader
        variant="default"
        title={store.name}
        fallbackUrl={brandPath}
        preferFallback
      />

      <div className="bg-gradient-to-b from-primary to-primary/80 px-4 pt-6 pb-8 text-primary-foreground">
        <div className="text-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/20 border border-white/25 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide">
            <MapPin size={12} />
            {lang === "en" ? "This store" : "本店"}
          </span>
          <div className="mx-auto mt-3 w-16 h-16 rounded-2xl bg-card shadow-lg flex items-center justify-center p-1.5">
            <BrandAvatar
              src={resolveStoreLogo(null, business.businessLogo)}
              name={store.name}
              size={56}
              rounded="2xl"
              className="!border-0"
            />
          </div>
          <h1 className="text-lg font-bold mt-2.5">{store.name}</h1>
          {brandName ? (
            <p className="text-white/70 text-xs mt-0.5 font-medium">{brandName}</p>
          ) : null}
          {store.address && (
            <p className="text-white/55 text-[11px] mt-1.5 flex items-center justify-center gap-1 px-2 leading-snug">
              <MapPin size={11} className="shrink-0" />
              <span className="line-clamp-2">{store.address}</span>
            </p>
          )}
          <Link
            href={brandPath}
            className="inline-flex mt-2.5 text-[11px] font-medium text-white/80 underline-offset-2 hover:underline"
          >
            {lang === "en" ? "← All brand outlets" : "← 品牌其他门店"}
          </Link>
        </div>
      </div>

      <div className="px-4 -mt-3 pb-8">
        <div className="bg-card rounded-t-2xl pt-4 px-1 shadow-sm">
          <div className="flex items-center justify-between px-3 mb-0.5">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">
                {lang === "en" ? "Activities" : "本店活动"}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {lang === "en"
                  ? "Pick an activity, then buy or join"
                  : "选活动 → 购券或参加满赠"}
              </p>
            </div>
            <span className="text-[11px] text-muted-foreground nums shrink-0 tabular-nums">
              {storeOffers.length > 0
                ? lang === "en"
                  ? `${storeOffers.length} live`
                  : `${storeOffers.length} 个进行中`
                : ""}
            </span>
          </div>
          {(nNdp > 0 || nDraw > 0 || nLong > 0) && (
            <p className="px-3 text-[10px] text-muted-foreground/90 mb-2">
              {[
                nNdp > 0
                  ? lang === "en"
                    ? "National Day"
                    : "国庆满赠"
                  : null,
                nDraw > 0
                  ? lang === "en"
                    ? "Countdown"
                    : "大奖倒计时"
                  : null,
                nLong > 0
                  ? lang === "en"
                    ? "Long-term"
                    : "长期券"
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}

          {!isLoggedIn && storeOffers.length > 0 && (
            <div className="mx-3 mb-3 flex flex-wrap items-center gap-2">
              <Link
                href={`/auth/login?tab=customer&intent=customer&redirect=${encodeURIComponent(path)}`}
                className="inline-flex h-8 items-center rounded-full bg-primary px-3 text-[11px] font-semibold text-primary-foreground active:scale-[0.97] transition-transform"
              >
                {lang === "en" ? "Log in / Register" : "登录 / 注册"}
              </Link>
              <span className="text-[10px] text-muted-foreground">
                {lang === "en"
                  ? "Optional until checkout"
                  : "购券时再登录也可以"}
              </span>
            </div>
          )}

          {storeOffers.length > 0 ? (
            <div className="px-3 mb-4 mt-1">
              <ShopActivityShelf
                lang={lang}
                activities={storeOffers}
                storePath={path}
                storeName={store.name}
                brandName={brandName}
                storeId={store.id}
              />
            </div>
          ) : (
            <EmptyState
              icon="coupons"
              title={
                lang === "en" ? "No offers at this store yet" : "本店暂无活动"
              }
              description={
                lang === "en"
                  ? "Ask staff or check back when the store joins activities."
                  : "商家开启本店活动参与后会出现在这里。"
              }
              className="py-12"
            />
          )}
        </div>

        <div className="text-center mt-6">
          <p className="text-[10px] text-muted-foreground/70">
            {t("store.public.poweredBy", lang)}
          </p>
        </div>
      </div>
    </div>
  );
}

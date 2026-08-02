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
  isActivityCustomerVisible,
  listJoinableActivities,
} from "@/lib/discover-activities";
import { ShopActivityShelf } from "@/components/shop/ShopActivityShelf";
import { Building2 } from "lucide-react";

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
      displayName: true,
      businessLogo: true,
      businessCategory: true,
      businessSlug: true,
    },
  });
  if (!business) notFound();

  const session = await getSession();
  const isLoggedIn = !!session;
  const brandName =
    business.displayName?.trim() || business.businessName?.trim() || "";
  const brandPath = `/shop/${business.businessSlug}`;

  const stores = await prisma.store.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, address: true },
  });

  const allBrandOffers = await listJoinableActivities({
    limit: 40,
    listScope: "all",
    businessId: business.id,
    customerId: session?.role === "customer" ? session.userId : null,
  });
  // 门店全关（storeIds=[]）的活动不在品牌页露出
  const storeOffers = allBrandOffers.filter(isActivityCustomerVisible);

  const categoryLabel =
    lang === "zh"
      ? SERVICE_CATEGORIES.find((x) => x.value === business.businessCategory)
          ?.label
      : business.businessCategory;

  return (
    <div className="min-h-screen bg-muted/50">
      <TopHeader
        variant="default"
        title={business.businessName || brandName || ""}
        fallbackUrl="/"
        preferFallback
      />

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
          <h1 className="text-xl font-bold mt-3">{brandName}</h1>
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
                {lang === "en" ? "Brand activities · offers" : "品牌活动 · 可购权益"}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {lang === "en"
                  ? "By activity · buy focuses the offer"
                  : "按活动组织 · 点权益进入购券"}
              </p>
            </div>
            <span className="text-xs text-muted-foreground nums">
              {storeOffers.length}
            </span>
          </div>

          {storeOffers.length > 0 ? (
            <div className="px-3 mb-6 mt-3">
              <ShopActivityShelf
                lang={lang}
                activities={storeOffers}
                storePath={brandPath}
                storeName={brandName}
                brandName={brandName}
                brandScope
              />
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

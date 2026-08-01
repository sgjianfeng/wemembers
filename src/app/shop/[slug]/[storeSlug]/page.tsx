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
 * 组织：活动 → 权益/可购券（购券进 /voucher 带 from=store 语境）
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

  return (
    <div className="min-h-screen bg-muted/50">
      <TopHeader variant="default" title={store.name} />

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
          <p className="text-white/70 text-xs mt-1 font-medium">{brandName}</p>
          {store.address && (
            <p className="text-white/60 text-xs mt-1 flex items-center justify-center gap-1">
              <MapPin size={12} /> {store.address}
            </p>
          )}
          <p className="text-white/50 text-[11px] mt-3 max-w-[280px] mx-auto leading-relaxed">
            {lang === "en"
              ? "Activities at this outlet · pick an offer to buy"
              : "本店活动 · 按活动选权益购券"}
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
                ? "You scanned this store. Browse by activity, then buy the offer you want."
                : "你已扫入本店。先选活动，再点权益购券；付款页会保留本店语境。"}
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
                  href={`/auth/login?tab=customer&intent=customer&redirect=${encodeURIComponent(path)}`}
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
                {lang === "en" ? "Activities · offers" : "活动 · 可购权益"}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {lang === "en"
                  ? "National Day · Grand countdown · Evergreen"
                  : "国庆满赠 · 大奖倒计时 · 长期活动"}
              </p>
            </div>
            <span className="text-xs text-muted-foreground nums">
              {storeOffers.length}
            </span>
          </div>

          {storeOffers.length > 0 ? (
            <div className="px-3 mb-4 mt-3">
              <ShopActivityShelf
                lang={lang}
                activities={storeOffers}
                storePath={path}
                storeName={store.name}
                brandName={brandName}
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
                ? "Log in when you buy — balances stay in your wallet"
                : "购券时再登录即可，余额会保存在你的券包"}
            </p>
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

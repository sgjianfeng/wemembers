import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TopHeader } from "@/components/ui/TopHeader";
import { daysUntil, resolveStoreLogo, storeIdsAllows } from "@/lib/utils";
import { BrandAvatar } from "@/components/ui/BrandAvatar";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * 门店顾客页（主入口）
 * URL: /shop/{company-slug}/{store-slug}
 * 仅展示对本店启用的券 / 活动（storeIds 为空 = 全部门店）
 */
export default async function CompanyStorePage({
  params,
}: {
  params: Promise<{ slug: string; storeSlug: string }>;
}) {
  const { slug: companySlug, storeSlug } = await params;
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

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

  const allCoupons = await prisma.coupon.findMany({
    where: {
      businessId: business.id,
      status: "published",
      validUntil: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  const coupons = allCoupons.filter((c) =>
    storeIdsAllows((c as { storeIds?: string | null }).storeIds, store.id)
  );

  const allCampaigns = await prisma.campaign.findMany({
    where: {
      businessId: business.id,
      type: { in: ["lucky_draw_v2", "voucher_sale"] },
      status: "active",
      endDate: { gt: new Date() },
      slug: { not: null },
    },
    orderBy: { endDate: "asc" },
    take: 20,
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      color: true,
      endDate: true,
      storeIds: true,
    },
  });
  const drawCampaigns = allCampaigns.filter((camp) =>
    storeIdsAllows(camp.storeIds, store.id)
  );

  const session = await getSession();
  const isLoggedIn = !!session;
  const path = `/shop/${companySlug}/${storeSlug}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <TopHeader variant="default" title={store.name} />

      <div className="bg-gradient-to-b from-[#1A6EFF] to-[#3B82F6] px-4 pt-8 pb-8 text-white">
        <div className="text-center">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-white shadow-lg flex items-center justify-center p-1.5">
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
            <p className="text-white/60 text-xs mt-1">📍 {store.address}</p>
          )}
          <p className="text-white/50 text-[11px] mt-3 max-w-[280px] mx-auto leading-relaxed">
            {lang === "en"
              ? "Welcome — claim vouchers & join draws at this outlet"
              : "欢迎光临 · 领取本店优惠券与抽奖活动"}
          </p>
        </div>
      </div>

      <div className="px-4 -mt-4 pb-8">
        <div className="bg-white rounded-t-2xl pt-5 px-1">
          {/* 扫码落地快捷说明 */}
          <div className="mx-3 mb-4 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
            <p className="text-[11px] text-slate-600 leading-relaxed">
              {lang === "en"
                ? "You scanned this store’s code. Browse offers below — log in to claim."
                : "你已扫入本店。下方为本店可用优惠；登录后即可领取。"}
            </p>
            {!isLoggedIn && (
              <Link
                href={`/auth/login?redirect=${encodeURIComponent(path)}`}
                className="inline-flex mt-2 h-8 items-center rounded-full bg-[#1A6EFF] px-3 text-[11px] font-semibold text-white"
              >
                {lang === "en" ? "Log in / Register" : "登录 / 注册"}
              </Link>
            )}
          </div>

          {drawCampaigns.length > 0 && (
            <div className="px-3 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-slate-900">
                  {t("store.public.drawTitle", lang)}
                </h2>
                <span className="text-xs text-slate-400">{drawCampaigns.length}</span>
              </div>
              <div className="space-y-2">
                {drawCampaigns.map((camp) => (
                  <Link key={camp.id} href={`/voucher/${camp.slug}`}>
                    <Card
                      className="hover:border-[#1A6EFF]/30 border-l-4"
                      style={{ borderLeftColor: camp.color || "#1A6EFF" }}
                    >
                      <CardContent className="p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {camp.name}
                          </p>
                          {camp.description && (
                            <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                              {camp.description}
                            </p>
                          )}
                        </div>
                        <span className="px-3 py-1 bg-[#1A6EFF] text-white text-[10px] rounded-full shrink-0">
                          {t("store.public.buy", lang)}
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between px-3 mb-3">
            <h2 className="text-base font-semibold text-slate-900">
              {t("store.public.title", lang)}
            </h2>
            <span className="text-xs text-slate-400">
              {coupons.length}
              {t("store.public.countUnit", lang)}
            </span>
          </div>

          {coupons.length > 0 ? (
            <div className="space-y-2 px-3">
              {coupons.map((c) => {
                const displayValue =
                  c.type === "percentage"
                    ? `${(c.valueCents / 100).toFixed(0)}${t("store.public.percentOff", lang)}`
                    : c.type === "free_item"
                      ? t("store.public.free", lang)
                      : `S$${(c.valueCents / 100).toFixed(0)}`;
                const soldOut =
                  c.remainingQuantity !== null && c.remainingQuantity <= 0;
                return (
                  <Link key={c.id} href={`/coupons/${c.id}`}>
                    <Card
                      className={`hover:border-[#1A6EFF]/30 border-l-4 border-l-[#FF6B35] ${soldOut ? "opacity-50" : ""}`}
                    >
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-base font-bold text-[#FF6B35]">
                            {displayValue}
                          </p>
                          <p className="text-sm font-medium text-slate-900 mt-1">
                            {c.title}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {daysUntil(c.validUntil)}
                            {t("store.public.daysUnit", lang)}
                          </p>
                        </div>
                        {!soldOut && (
                          <span className="px-3 py-1 bg-[#1A6EFF] text-white text-[10px] rounded-full shrink-0">
                            {t("store.public.claim", lang)}
                          </span>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🎫</p>
              <p className="text-sm text-slate-400">
                {t("store.public.noCoupons", lang)}
              </p>
            </div>
          )}
        </div>

        {!isLoggedIn && coupons.length > 0 && (
          <div className="mx-3 mt-4 p-4 bg-[#1A6EFF]/5 rounded-xl text-center">
            <p className="text-sm text-slate-600">
              {t("store.public.loginPrompt", lang)}
            </p>
            <Link
              href={`/auth/login?redirect=${encodeURIComponent(path)}`}
              className="inline-block mt-2 px-6 py-2 bg-[#1A6EFF] text-white text-sm rounded-full"
            >
              {t("store.public.login", lang)}
            </Link>
          </div>
        )}

        <div className="text-center mt-6">
          <p className="text-[10px] text-slate-300">
            {t("store.public.poweredBy", lang)}
          </p>
        </div>
      </div>
    </div>
  );
}

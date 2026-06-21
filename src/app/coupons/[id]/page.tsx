import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { BackHeader } from "@/components/ui/BackHeader";
import { daysUntil } from "@/lib/utils";
import { ClaimButton } from "./ClaimButton";
import { getSession } from "@/lib/auth";
import { GiftBadge } from "./GiftBadge";
import { t } from "@/lib/i18n";
import { cookies } from "next/headers";

export default async function CouponDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";
  const dateLocale = lang === "en" ? "en-US" : "zh-CN";

  const [coupon, session] = await Promise.all([
    prisma.coupon.findUnique({
      where: { id },
      include: { business: { select: { id: true, businessName: true, businessLogo: true, businessCategory: true } } },
    }),
    getSession(),
  ]);

  if (!coupon || coupon.status !== "published") {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-center text-slate-400"><p className="text-4xl mb-2">🎫</p><p className="text-sm">{t("coupon.detail.notFound", lang)}</p></div></div>;
  }

  const typeLabel = { fixed_amount: t("coupon.typeMap.fixed_amount", lang), percentage: t("coupon.typeMap.percentage", lang), free_item: t("coupon.typeMap.free_item", lang) }[coupon.type] || coupon.type;
  const daysLeft = daysUntil(coupon.validUntil);
  const soldOut = coupon.remainingQuantity !== null && coupon.remainingQuantity <= 0;
  const expired = coupon.validUntil < new Date();

  const isCustomer = session?.role === "customer";

  // Fetch stores where this coupon can be used
  const stores = await prisma.store.findMany({
    where: { businessId: coupon.businessId },
    select: { id: true, name: true, address: true, slug: true },
    take: 5,
  });

  // Fetch user points if logged in
  const userPoints = isCustomer
    ? (await prisma.user.findUnique({ where: { id: session!.userId }, select: { pointsBalance: true } }))?.pointsBalance ?? 0
    : 0;
  const pointsGap = coupon.pointsRequired - userPoints;

  return (
    <div className="pb-4 min-h-screen">
      <BackHeader />
      {/* Hero Card */}
      <div className="bg-gradient-to-b from-[#1A6EFF] to-white px-4 pt-8 pb-6">
        <Card className="max-w-sm mx-auto overflow-hidden border-0 shadow-sm">
          <div className="bg-gradient-to-r from-[#FF6B35] to-orange-400 p-6 text-white text-center">
            <p className="text-white/70 text-xs mb-1">{coupon.business?.businessName}</p>
            <p className="text-4xl font-bold">
              {coupon.type === "percentage" ? `${(coupon.valueCents / 100).toFixed(0)}${t("coupon.detail.discountSuffix", lang)}` : coupon.type === "free_item" ? t("coupon.detail.freeLabel", lang) : `¥${(coupon.valueCents / 100).toFixed(0)}`}
            </p>
            <p className="text-sm font-medium mt-1">{coupon.title}</p>
            {coupon.description && <p className="text-xs text-white/70 mt-2">{coupon.description}</p>}
          </div>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-xs"><span className="text-slate-400">{t("coupon.detail.type", lang)}</span><span className="text-slate-900">{typeLabel}</span></div>
            <div className="flex justify-between text-xs"><span className="text-slate-400">{t("coupon.detail.points", lang)}</span><span className="text-[#FF6B35] font-bold">{coupon.pointsRequired}⭐</span></div>
            <div className="flex justify-between text-xs"><span className="text-slate-400">{t("coupon.detail.minSpend", lang)}</span><span className="text-slate-900">{coupon.minSpendCents > 0 ? `¥${(coupon.minSpendCents / 100).toFixed(0)}` : t("coupon.detail.noMinSpend", lang)}</span></div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">{t("coupon.detail.validity", lang)}</span>
              <span className={`${daysLeft <= 3 ? "text-red-500" : "text-slate-900"}`}>
                {coupon.validFrom.toLocaleDateString(dateLocale)} ~ {coupon.validUntil.toLocaleDateString(dateLocale)}
                <span className="ml-1">({t("coupon.detail.daysLeft", lang, { days: daysLeft })})</span>
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">{t("coupon.detail.remaining", lang)}</span>
              <span className="text-slate-900">{coupon.remainingQuantity !== null ? t("coupon.detail.remainingCount", lang, { remaining: String(coupon.remainingQuantity), total: String(coupon.totalQuantity || 0) }) : t("coupon.detail.unlimited", lang)}</span>
            </div>
            <div className="flex justify-between text-xs"><span className="text-slate-400">{t("coupon.detail.perCustomer", lang)}</span><span className="text-slate-900">{t("coupon.detail.perCustomerCount", lang, { count: coupon.perCustomerLimit })}</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Gift Badge */}
      {coupon.giftType && coupon.giftType !== "none" && (() => {
        try { return JSON.parse(coupon.giftData || "{}"); } catch { return null; }
      })() && (
        <div className="px-4 mt-4">
          <GiftBadge type={coupon.giftType} data={coupon.giftData!} />
        </div>
      )}

      {/* Claim Section */}
      <div className="px-4 mt-4">
        {isCustomer ? (
          <>
            {/* Points insufficient guidance */}
            {pointsGap > 0 && (
              <div className="mb-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
                <p className="text-xs font-medium text-amber-700">
                  ⭐ {lang === "zh"
                    ? `还差 ${pointsGap} 积分，去签到或消费可快速获得`
                    : `Need ${pointsGap} more points. Check in or spend to earn quickly`}
                </p>
                <div className="flex gap-2 mt-2">
                  <a href="/home" className="text-[11px] text-amber-600 underline">
                    {lang === "zh" ? "去签到 →" : "Check in →"}
                  </a>
                  <a href={`/shop/${coupon.business?.businessSlug || coupon.businessId}`} className="text-[11px] text-amber-600 underline">
                    {lang === "zh" ? "去消费 →" : "Shop →"}
                  </a>
                </div>
              </div>
            )}
            <ClaimButton couponId={coupon.id} pointsRequired={coupon.pointsRequired} soldOut={soldOut} expired={expired} />
          </>
        ) : (
          <div className="text-center p-4 bg-slate-50 rounded-xl">
            <p className="text-sm text-slate-400">{t("coupon.detail.loginPrompt", lang)}</p>
          </div>
        )}

        {coupon.isGiftable && (
          <p className="text-center text-xs text-slate-400 mt-3">
            {t("coupon.detail.giftable", lang)}
          </p>
        )}
      </div>

      {/* ── Usage Instructions ── */}
      <div className="px-4 mt-5">
        <details className="bg-white rounded-xl border border-slate-100 overflow-hidden" open>
          <summary className="px-4 py-3 text-sm font-semibold text-slate-900 cursor-pointer hover:bg-slate-50">
            📋 {lang === "zh" ? "使用说明" : "How to Use"}
          </summary>
          <div className="px-4 pb-4 text-xs text-slate-500 space-y-1.5">
            <p>• {lang === "zh"
              ? `本券面值 S$${(coupon.valueCents / 100).toFixed(2)}，需在结账时出示核销码`
              : `This S$${(coupon.valueCents / 100).toFixed(2)} voucher must be presented at checkout`}</p>
            {coupon.minSpendCents > 0 && (
              <p>• {lang === "zh"
                ? `最低消费 S$${(coupon.minSpendCents / 100).toFixed(2)} 方可使用`
                : `Min. spend S$${(coupon.minSpendCents / 100).toFixed(2)} required`}</p>
            )}
            <p>• {lang === "zh"
              ? `有效期至 ${coupon.validUntil.toLocaleDateString(dateLocale)}，逾期作废`
              : `Valid until ${coupon.validUntil.toLocaleDateString(dateLocale)}`}</p>
            <p>• {lang === "zh"
              ? `每人限领 ${coupon.perCustomerLimit} 张，不可与其他优惠叠加`
              : `Limit ${coupon.perCustomerLimit} per person. Cannot combine with other offers`}</p>
            {coupon.description && (
              <p className="text-slate-400">• {coupon.description}</p>
            )}
          </div>
        </details>
      </div>

      {/* ── Available Stores ── */}
      {stores.length > 0 && (
        <div className="px-4 mt-3">
          <details className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <summary className="px-4 py-3 text-sm font-semibold text-slate-900 cursor-pointer hover:bg-slate-50">
              📍 {lang === "zh" ? "适用门店" : "Available Stores"} ({stores.length})
            </summary>
            <div className="px-4 pb-3 space-y-2">
              {stores.map((store) => (
                <a key={store.id} href={`/store/${store.slug}`} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                  <span className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-sm shrink-0">🏢</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-900">{store.name}</p>
                    {store.address && <p className="text-[10px] text-slate-400 truncate">{store.address}</p>}
                  </div>
                  <span className="text-xs text-blue-500 shrink-0">→</span>
                </a>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* ── Share ── */}
      <div className="px-4 mt-3 mb-8">
        <button
          onClick="navigator.clipboard.writeText(window.location.href);this.textContent='✅ '+(this.dataset.copied||'Copied!')"
          data-copied={lang === "zh" ? "已复制！" : "Copied!"}
          className="w-full py-3 bg-slate-50 rounded-xl text-xs text-slate-500 hover:bg-slate-100 transition-colors"
        >
          📤 {lang === "zh" ? "分享此券给好友" : "Share this voucher"}
        </button>
      </div>
    </div>
  );
}

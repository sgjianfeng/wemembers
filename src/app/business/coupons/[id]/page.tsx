import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { timeAgo, daysUntil } from "@/lib/utils";
import Link from "next/link";
import { StatusToggle } from "./StatusToggle";

export default async function CouponDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const { id } = await params;
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";
  const coupon = await prisma.coupon.findFirst({
    where: { id, businessId: session.userId },
    include: {
      claims: { take: 10, orderBy: { claimedAt: "desc" }, include: { customer: { select: { displayName: true, phone: true } } } },
    },
  });

  if (!coupon) return <div className="p-8 text-center text-slate-400">{t("business.coupons.detail.notFound", lang)}</div>;

  const statusBadge: Record<string, { variant: "green" | "orange" | "red" | "slate"; label: string }> = {
    published: { variant: "green", label: t("business.coupons.status.published", lang) },
    draft: { variant: "slate", label: t("business.coupons.status.draft", lang) },
    paused: { variant: "orange", label: t("business.coupons.status.paused", lang) },
    ended: { variant: "red", label: t("business.coupons.status.ended", lang) },
  };
  const sb = statusBadge[coupon.status] || { variant: "slate" as const, label: coupon.status };
  const rate = coupon.claimedCount > 0 ? Math.round((coupon.usedCount / coupon.claimedCount) * 100) : 0;
  const daysLeft = daysUntil(coupon.validUntil);

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
        <Link href="/business/coupons" className="text-sm text-slate-500">{t("common.back", lang)}</Link>
        <h1 className="text-sm font-semibold">{t("business.coupons.detail.title", lang)}</h1>
        <Badge variant={sb.variant}>{sb.label}</Badge>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* 概览卡片 */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3"><span className="text-3xl">🎫</span><div><p className="text-lg font-bold text-slate-900">{coupon.title}</p><p className="text-xs text-slate-500">{coupon.description || t("business.coupons.detail.noDescription", lang)}</p></div></div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Info label={t("coupon.detail.type", lang)} value={t(`coupon.typeMap.${coupon.type}`, lang)} />
              <Info label={t("business.coupons.detail.faceValue", lang)} value={`¥${(coupon.valueCents / 100).toFixed(coupon.type === "percentage" ? 1 : 0)}${coupon.type === "percentage" ? t("coupon.detail.discountSuffix", lang) : ""}`} />
              <Info label={t("coupon.detail.points", lang)} value={`${coupon.pointsRequired}⭐`} />
              <Info label={t("coupon.detail.minSpend", lang)} value={coupon.minSpendCents > 0 ? `¥${(coupon.minSpendCents / 100).toFixed(0)}` : t("coupon.detail.noMinSpend", lang)} />
              <Info label={t("coupon.detail.validity", lang)} value={`${coupon.validFrom.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")} ~ ${coupon.validUntil.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")}`} />
              <Info label={t("business.coupons.detail.quantity", lang)} value={coupon.totalQuantity ? `${coupon.claimedCount}/${coupon.totalQuantity}` : `${coupon.claimedCount}/∞`} />
              <Info label={t("coupon.detail.perCustomer", lang)} value={t("coupon.detail.perCustomerCount", lang, { count: coupon.perCustomerLimit })} />
              <Info label={t("business.coupons.detail.giftable", lang)} value={coupon.isGiftable ? t("common.allowed", lang) : t("common.notAllowed", lang)} />
            </div>
          </CardContent>
        </Card>

        {/* 核销漏斗 */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">{t("business.coupons.detail.conversionFunnel", lang)}</h3>
            <div className="flex items-center gap-3">
              <FunnelStep label={t("coupon.detail.claimed", lang)} value={coupon.claimedCount} color="bg-[#1A6EFF]" />
              <span className="text-slate-300 text-lg">→</span>
              <FunnelStep label={t("business.coupons.detail.redeemed", lang)} value={coupon.usedCount} color="bg-[#16A34A]" />
              <span className="text-slate-300 text-lg">→</span>
              <div className="text-center">
                <p className="text-2xl font-bold text-[#FF6B35]">{rate}%</p>
                <p className="text-[10px] text-slate-400">{t("business.coupons.detail.redemptionRate", lang)}</p>
              </div>
            </div>
            {coupon.claimedCount > 0 && coupon.usedCount > 0 && (
              <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#1A6EFF] to-[#16A34A]" style={{ width: `${rate}%` }} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* 状态操作 */}
        {coupon.status !== "ended" && <StatusToggle couponId={coupon.id} currentStatus={coupon.status} />}

        {/* 最近领取 */}
        {coupon.claims.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-slate-900">{t("business.coupons.detail.recentClaims", lang)}</h3>
            <div className="space-y-1">
              {coupon.claims.map((claim) => (
                <div key={claim.id} className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-slate-50 text-xs">
                  <span className="text-slate-600">{claim.customer.displayName || claim.customer.phone}</span>
                  <Badge variant={claim.status === "used" ? "green" : claim.status === "available" ? "orange" : "slate"} size="sm">
                    {claim.status === "used" ? t("business.coupons.detail.redeemed", lang) : claim.status === "available" ? t("business.claim.status.available", lang) : claim.status}
                  </Badge>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-slate-400 text-xs">{label}</span><span className="text-slate-900 text-xs font-medium">{value}</span></div>;
}

function FunnelStep({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`w-10 h-10 ${color} rounded-full flex items-center justify-center text-white font-bold mx-auto`}>{value}</div>
      <p className="text-[10px] text-slate-400 mt-1">{label}</p>
    </div>
  );
}

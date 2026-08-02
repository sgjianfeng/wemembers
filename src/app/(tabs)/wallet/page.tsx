import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { buildCustomerActivityBundles } from "@/lib/activity-entitlements";
import { isSpendableBalanceVoucher } from "@/lib/voucher-classification";
import { WalletClient } from "./WalletClient";

export default async function WalletPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const [myCoupons, myVouchers] = await Promise.all([
    prisma.customerCoupon.findMany({
      where: { customerId: session.userId },
      include: {
        coupon: {
          include: {
            business: { select: { businessName: true } },
            campaign: {
              select: { id: true, name: true, type: true, slug: true },
            },
          },
        },
      },
      orderBy: { claimedAt: "desc" },
    }),
    prisma.voucher.findMany({
      where: { customerId: session.userId, status: "active" },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            slug: true,
            type: true,
            business: { select: { businessName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
  ]);

  const claims = myCoupons.map((c) => {
    const expires = c.expiresAt ?? c.coupon.validUntil;
    return {
      id: c.id,
      status:
        c.status === "available" && expires < new Date()
          ? "expired"
          : c.status,
      qrCode: c.qrCode,
      coupon: {
        title: c.coupon.title,
        valueCents: c.coupon.valueCents,
        validUntil: expires.toISOString(),
        businessName: c.coupon.business?.businessName || null,
        campaignId: c.coupon.campaignId || c.coupon.campaign?.id || null,
        campaignName: c.coupon.campaign?.name || null,
        campaignType: c.coupon.campaign?.type || null,
      },
    };
  });

  // 与首页同一套：活动 → 赠券 / 抽奖 / 余额
  const activeBundles = buildCustomerActivityBundles({
    lang,
    claims: claims
      .filter((c) => c.status === "available")
      .map((c) => ({
        id: c.id,
        status: c.status,
        qrCode: c.qrCode,
        campaignId: c.coupon.campaignId,
        campaignName: c.coupon.campaignName,
        campaignType: c.coupon.campaignType,
        businessName: c.coupon.businessName,
        title: c.coupon.title,
        valueCents: c.coupon.valueCents,
        validUntil: c.coupon.validUntil,
        href: `/redeem/${c.id}`,
      })),
    draws: myVouchers
      .filter((v) => (v.drawWeight ?? 0) > 0)
      .map((v) => {
        const slug = v.campaign?.slug?.trim() || null;
        return {
          id: v.id,
          campaignId: v.campaignId,
          campaignName: v.campaign?.name || null,
          campaignSlug: slug,
          campaignType: v.campaign?.type || null,
          businessName: v.campaign?.business?.businessName || null,
          drawWeight: v.drawWeight,
          shortCode: v.shortCode,
          isGiftEntry:
            v.paidCents === 0 ||
            v.paymentMethod === "free" ||
            v.issueReason === "marketing" ||
            v.issueReason === "ndp_draw_entry",
          balanceCents: v.balanceCents,
          amountCents: v.amountCents,
          countdownHref: slug
            ? `/voucher/${encodeURIComponent(slug)}#grand-countdown`
            : v.campaignId
              ? `/activity/${encodeURIComponent(v.campaignId)}`
              : "/discover/draws",
          balanceHref: "/balance",
        };
      }),
    prepaid: myVouchers
      .filter((v) => isSpendableBalanceVoucher(v) && (v.drawWeight ?? 0) <= 0)
      .map((v) => ({
        id: v.id,
        campaignId: v.campaignId,
        campaignName: v.campaign?.name || null,
        businessName: v.campaign?.business?.businessName || null,
        balanceCents: v.balanceCents,
        amountCents: v.amountCents,
        href: "/balance",
      })),
  });

  const usedClaims = claims.filter(
    (c) => c.status === "used" || c.status === "gifted"
  );
  const expiredClaims = claims.filter((c) => {
    if (c.status === "expired") return true;
    if (c.status === "available") return false;
    return false;
  });
  // 按有效期再算一遍过期
  const now = Date.now();
  const availableClaims = claims.filter((c) => {
    if (c.status !== "available") return false;
    return new Date(c.coupon.validUntil).getTime() >= now;
  });
  const expiredByDate = claims.filter(
    (c) =>
      c.status === "available" &&
      new Date(c.coupon.validUntil).getTime() < now
  );

  return (
    <WalletClient
      lang={lang}
      activeBundles={activeBundles}
      usedClaims={[...usedClaims]}
      expiredClaims={[...expiredClaims, ...expiredByDate]}
      availableClaimCount={availableClaims.length}
      activeEntitlementCount={activeBundles.reduce(
        (s, b) => s + b.entitlements.length,
        0
      )}
    />
  );
}

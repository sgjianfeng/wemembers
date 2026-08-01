import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { WalletClient } from "./WalletClient";

export default async function WalletPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const myCoupons = await prisma.customerCoupon.findMany({
    where: { customerId: session.userId },
    include: {
      coupon: {
        include: {
          business: { select: { businessName: true } },
          campaign: { select: { id: true, name: true, type: true } },
        },
      },
    },
    orderBy: { claimedAt: "desc" },
  });

  // 大奖资格：零余额 / 营销 gift 路径或有 drawWeight 的券
  const drawVouchers = await prisma.voucher.findMany({
    where: {
      customerId: session.userId,
      status: "active",
      drawWeight: { gt: 0 },
    },
    include: {
      campaign: {
        select: {
          id: true,
          name: true,
          business: { select: { businessName: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const claims = myCoupons.map((c) => {
    const expires =
      c.expiresAt ?? c.coupon.validUntil;
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

  const drawEntries = drawVouchers.map((v) => ({
    id: v.id,
    campaignId: v.campaignId,
    campaignName: v.campaign?.name || null,
    businessName: v.campaign?.business?.businessName || null,
    drawWeight: v.drawWeight,
    shortCode: v.shortCode,
    status: v.status,
    createdAt: v.createdAt.toISOString(),
    isGiftEntry:
      v.paidCents === 0 ||
      v.paymentMethod === "free" ||
      v.issueReason === "marketing",
    amountCents: v.amountCents,
    balanceCents: v.balanceCents,
  }));

  return <WalletClient claims={claims} drawEntries={drawEntries} />;
}

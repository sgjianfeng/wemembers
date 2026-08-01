import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import {
  NDP_GIFT_COUPON_CENTS,
  NDP_MIN_SPEND_CENTS,
  parseNdpMetaFromCampaign,
  paidVsGiftWeightMultiple,
} from "@/lib/ndp-promo";
import { NdpLandingClient } from "./NdpLandingClient";

/**
 * 国庆活动落地页（桌码 / 前台码同一页）
 * /ndp/{slug}?from=table|counter
 */
export default async function NdpLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const from =
    sp.from === "counter" ? "counter" : sp.from === "table" ? "table" : "table";

  const campaign = await prisma.campaign.findFirst({
    where: {
      OR: [{ slug }, { id: slug }],
      status: { in: ["active", "draft"] },
    },
    include: {
      business: {
        select: {
          businessName: true,
          businessLogo: true,
          businessSlug: true,
        },
      },
    },
  });
  if (!campaign) notFound();

  const meta = parseNdpMetaFromCampaign(campaign);
  // 无 ndp 标记也允许打开（名称含国庆时 meta.enabled 已 true）
  if (!meta.enabled && campaign.type !== "holiday") {
    // 仍展示，便于老板预览 draft
  }

  const session = await getSession();
  const isCustomer = session?.role === "customer";
  let customerPhone: string | null = null;
  let myGiftCount = 0;
  let myDrawWeight = 0;

  if (isCustomer && session) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { phone: true },
    });
    customerPhone = user?.phone || null;

    myGiftCount = await prisma.customerCoupon.count({
      where: {
        customerId: session.userId,
        status: "available",
        coupon: { campaignId: campaign.id },
      },
    });

    const drawV = await prisma.voucher.findFirst({
      where: {
        customerId: session.userId,
        campaignId: campaign.id,
        status: "active",
        drawWeight: { gt: 0 },
      },
      select: { drawWeight: true },
      orderBy: { createdAt: "desc" },
    });
    // 也可能挂在购券活动上
    const paidDraw = await prisma.voucher.findFirst({
      where: {
        customerId: session.userId,
        status: "active",
        drawWeight: { gt: 0 },
        paidCents: { gt: 0 },
        campaign: { businessId: campaign.businessId },
      },
      select: { drawWeight: true },
      orderBy: { createdAt: "desc" },
    });
    myDrawWeight = paidDraw?.drawWeight || drawV?.drawWeight || 0;
  }

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const buySlug = meta.buyVoucherSlug || campaign.slug || null;
  const buyPath = buySlug ? `/voucher/${buySlug}` : null;
  const multiple = paidVsGiftWeightMultiple(meta);

  return (
    <NdpLandingClient
      lang={lang}
      from={from}
      campaign={{
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        slug: campaign.slug,
        businessName: campaign.business?.businessName || "",
        businessLogo: campaign.business?.businessLogo || null,
        startDate: campaign.startDate.toISOString(),
        endDate: campaign.endDate.toISOString(),
      }}
      rules={{
        minSpendSgd: (meta.minSpendCents || NDP_MIN_SPEND_CENTS) / 100,
        giftSgd: (meta.giftCouponCents || NDP_GIFT_COUPON_CENTS) / 100,
        validDays: meta.validDays,
        weightMultiple: multiple,
      }}
      buyPath={buyPath}
      isLoggedIn={isCustomer}
      customerPhone={customerPhone}
      myGiftCount={myGiftCount}
      myDrawWeight={myDrawWeight}
      loginRedirect={`/ndp/${encodeURIComponent(slug)}?from=${from}`}
    />
  );
}

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import {
  NDP_GIFT_COUPON_CENTS,
  NDP_MIN_SPEND_CENTS,
  parseNdpMetaFromCampaign,
  paidVsGiftWeightMultiple,
  buildNdpTermsDatesView,
} from "@/lib/ndp-promo";
import { parseStoreIdsScope } from "@/lib/utils";
import { NdpLandingClient } from "./NdpLandingClient";

const SITE =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "https://wemembers.store";

function absUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return `${SITE}/icon-512.png`;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${SITE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

async function loadNdpCampaign(slug: string) {
  return prisma.campaign.findFirst({
    where: {
      OR: [{ slug }, { id: slug }],
      status: { in: ["active", "draft"] },
    },
    include: {
      business: {
        select: {
          id: true,
          businessName: true,
          displayName: true,
          businessLogo: true,
          businessSlug: true,
        },
      },
    },
  });
}

/**
 * WhatsApp / 微信链接预览：活动标题 + 满赠卖点 + 商家图
 * （根 layout 默认是平台文案，必须在此覆盖）
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await loadNdpCampaign(slug);
  if (!campaign) {
    return {
      title: "活动不存在 · WeMembers",
      description: "该国庆活动链接无效或已结束",
    };
  }

  const meta = parseNdpMetaFromCampaign(campaign);
  const minSgd = ((meta.minSpendCents || NDP_MIN_SPEND_CENTS) / 100).toFixed(0);
  const giftSgd = (
    (meta.giftCouponCents || NDP_GIFT_COUPON_CENTS) / 100
  ).toFixed(0);
  // OG：用品牌展示名，不用公司注册名
  const biz =
    campaign.business?.displayName ||
    campaign.business?.businessName ||
    "WeMembers";
  const title = `${campaign.name} · ${biz}`;
  const description = `满 S$${minSgd} 送 S$${giftSgd} 赠券 · 到店核销 · ${biz} · 国庆满赠活动`;
  const pageUrl = `${SITE}/ndp/${encodeURIComponent(campaign.slug || slug)}`;
  const image = absUrl(campaign.business?.businessLogo || "/icon-512.png");

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: "WeMembers",
      locale: "zh_SG",
      type: "website",
      images: [
        {
          url: image,
          width: 512,
          height: 512,
          alt: biz,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    alternates: {
      canonical: pageUrl,
    },
  };
}

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

  const campaign = await loadNdpCampaign(slug);
  if (!campaign) notFound();

  const meta = parseNdpMetaFromCampaign(campaign);
  // 无 ndp 标记也允许打开（名称含国庆时 meta.enabled 已 true）
  if (!meta.enabled && campaign.type !== "holiday") {
    // 仍展示，便于老板预览 draft
  }

  const session = await getSession();
  const isCustomer = session?.role === "customer";
  const isBusinessSession =
    session?.role === "business" || session?.role === "staff";
  let customerPhone: string | null = null;
  let myGiftCount = 0;
  let myDrawWeight = 0;
  let businessSessionLabel: string | null = null;

  if (isBusinessSession && session) {
    const bu = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { businessName: true, displayName: true, phone: true },
    });
    businessSessionLabel =
      bu?.businessName || bu?.displayName || bu?.phone || session.role;
  }

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
  const termsView = buildNdpTermsDatesView(
    {
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      description: campaign.description,
    },
    meta
  );

  // 品牌展示名（displayName）+ 参与门店；不用 legal businessName
  const brandName =
    campaign.business?.displayName?.trim() ||
    campaign.business?.businessName?.trim() ||
    "";
  let storeNames: string[] = [];
  if (campaign.businessId) {
    const scope = parseStoreIdsScope(campaign.storeIds);
    const stores = await prisma.store.findMany({
      where: {
        businessId: campaign.businessId,
        ...(scope.mode === "selected" && scope.ids.length > 0
          ? { id: { in: scope.ids } }
          : {}),
      },
      select: { name: true },
      orderBy: { name: "asc" },
      take: 6,
    });
    storeNames = stores.map((s) => s.name).filter(Boolean);
  }

  // 已持有赠送券的最近一张有效至（展示用）
  let latestValidUntil: string | null = null;
  if (isCustomer && session) {
    const latest = await prisma.customerCoupon.findFirst({
      where: {
        customerId: session.userId,
        status: "available",
        coupon: { campaignId: campaign.id },
      },
      orderBy: { claimedAt: "desc" },
      select: { expiresAt: true, claimedAt: true },
    });
    if (latest?.expiresAt) {
      latestValidUntil = latest.expiresAt.toISOString();
    }
  }

  return (
    <NdpLandingClient
      lang={lang}
      from={from}
      campaign={{
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        slug: campaign.slug,
        brandName,
        storeNames,
        businessLogo: campaign.business?.businessLogo || null,
        startDate: campaign.startDate.toISOString(),
        endDate: campaign.endDate.toISOString(),
      }}
      rules={{
        minSpendSgd: (meta.minSpendCents || NDP_MIN_SPEND_CENTS) / 100,
        giftSgd: (meta.giftCouponCents || NDP_GIFT_COUPON_CENTS) / 100,
        validDays: meta.validDays,
        weightMultiple: multiple,
        dualProtection: meta.dualProtection,
      }}
      termsView={termsView}
      latestValidUntil={latestValidUntil}
      buyPath={buyPath}
      isLoggedIn={isCustomer}
      isBusinessSession={isBusinessSession}
      businessSessionLabel={businessSessionLabel}
      customerPhone={customerPhone}
      myGiftCount={myGiftCount}
      myDrawWeight={myDrawWeight}
      loginRedirect={`/ndp/${encodeURIComponent(campaign.slug || slug)}?from=${from}`}
    />
  );
}

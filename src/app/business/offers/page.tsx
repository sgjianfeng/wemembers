import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { OffersClient } from "./OffersClient";
import {
  activityToneFromType,
  type ActivityBundle,
  type EntitlementItem,
} from "@/lib/activity-entitlements";
import {
  NDP_GIFT_COUPON_CENTS,
  parseNdpMetaFromCampaign,
} from "@/lib/ndp-promo";

/**
 * 企业 / 门店「活动券」：活动分类 + 权益券 + 匹配操作
 * 与客户首页/钱包同一心智
 */
export default async function BusinessOffersPage() {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    redirect("/auth/login");
  }

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";
  const zh = lang === "zh";

  let businessId = session.userId;
  let storeId: string | null = null;
  if (session.role === "staff") {
    if (!session.storeId) redirect("/business");
    const st = await prisma.store.findUnique({
      where: { id: session.storeId },
      select: { id: true, businessId: true, name: true },
    });
    if (!st) redirect("/business");
    businessId = st.businessId;
    storeId = st.id;
  }

  const campaigns = await prisma.campaign.findMany({
    where: {
      businessId,
      role: { not: "product_mirror" },
      status: { in: ["active", "draft", "ended"] },
    },
    include: {
      coupons: {
        select: {
          id: true,
          title: true,
          valueCents: true,
          status: true,
          claimedCount: true,
          usedCount: true,
          type: true,
        },
      },
      catalogProducts: {
        include: {
          product: {
            select: { id: true, name: true, status: true, type: true, slug: true },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
      _count: {
        select: {
          vouchers: true,
          promoGrants: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 40,
  });

  // 发放统计 per campaign
  const grantCounts = await prisma.promoGrant.groupBy({
    by: ["campaignId"],
    where: {
      businessId,
      status: "claimed",
      campaignId: { in: campaigns.map((x) => x.id) },
    },
    _count: { id: true },
  });
  const grantMap = new Map(grantCounts.map((g) => [g.campaignId, g._count.id]));

  const bundles: ActivityBundle[] = campaigns.map((camp) => {
    const meta = parseNdpMetaFromCampaign(camp);
    const tone = activityToneFromType(camp.type, camp.name, camp.tags);
    const entitlements: EntitlementItem[] = [];

    for (const coupon of camp.coupons) {
      entitlements.push({
        id: coupon.id,
        kind: "gift_coupon",
        tone: "gift",
        title: coupon.title,
        primaryLabel: `S$${(coupon.valueCents / 100).toFixed(0)}`,
        secondaryLabel: zh
          ? `领 ${coupon.claimedCount} · 用 ${coupon.usedCount} · ${coupon.status}`
          : `Claimed ${coupon.claimedCount} · used ${coupon.usedCount}`,
        status: coupon.status,
        href:
          session.role === "business"
            ? `/business/coupons/${coupon.id}`
            : undefined,
        ops:
          session.role === "business"
            ? [
                {
                  label: "券详情",
                  labelEn: "Details",
                  href: `/business/coupons/${coupon.id}`,
                },
              ]
            : undefined,
      });
    }

    for (const link of camp.catalogProducts) {
      const p = link.product;
      entitlements.push({
        id: p.id,
        kind: "catalog",
        tone: p.type?.includes("draw") ? "draw" : "prepaid",
        title: p.name,
        primaryLabel: p.status === "active" ? (zh ? "在售" : "Live") : p.status,
        secondaryLabel: p.slug ? `/voucher/${p.slug}` : p.type,
        href: session.role === "business" ? `/business/products/${p.id}` : undefined,
      });
    }

    // 国庆无券模版时仍展示「可发权益」占位
    if (meta.enabled && !camp.coupons.some((x) => x.valueCents === NDP_GIFT_COUPON_CENTS)) {
      entitlements.unshift({
        id: `ndp-gift-${camp.id}`,
        kind: "gift_coupon",
        tone: "gift",
        title: zh ? "国庆赠送券 S$61（发放时自动建）" : "NDP gift S$61 (auto)",
        primaryLabel: "S$61",
        secondaryLabel: zh
          ? `门槛 S$${meta.minSpendCents / 100} · 已发放 ${grantMap.get(camp.id) || 0}`
          : `Min S$${meta.minSpendCents / 100} · issued ${grantMap.get(camp.id) || 0}`,
      });
    }

    const ops: ActivityBundle["ops"] = [];
    if (meta.enabled || tone === "ndp") {
      ops.push({
        label: "凭票发券",
        labelEn: "Issue gift",
        href: "/business/ndp-issue",
        primary: true,
      });
    }
    ops.push({
      label: "核销",
      labelEn: "Redeem",
      href: storeId ? `/business/scan?storeId=${storeId}` : "/business/scan",
      primary: !meta.enabled,
    });
    if (camp.slug) {
      ops.push({
        label: "顾客页",
        labelEn: "Landing",
        href:
          meta.enabled || tone === "ndp"
            ? `/ndp/${camp.slug}?from=counter`
            : `/voucher/${camp.slug}`,
      });
    }
    if (session.role === "business") {
      ops.push({
        label: "活动详情",
        labelEn: "Details",
        href: `/business/campaigns/${camp.id}`,
      });
    }

    const nGift = camp.coupons.length;
    const nProd = camp.catalogProducts.length;
    const issued = grantMap.get(camp.id) || 0;

    return {
      key: camp.id,
      campaignId: camp.id,
      title: camp.name,
      businessName: null,
      type: camp.type,
      status: camp.status,
      tone,
      blurb:
        meta.enabled || tone === "ndp"
          ? zh
            ? `满 S$${meta.minSpendCents / 100} 送 S$${meta.giftCouponCents / 100} · 购券约 5 倍抽奖`
            : `Spend S$${meta.minSpendCents / 100} → S$${meta.giftCouponCents / 100}`
          : zh
            ? "活动容器 · 展开看权益与操作"
            : "Activity · expand perks & actions",
      href:
        session.role === "business"
          ? `/business/campaigns/${camp.id}`
          : camp.slug
            ? `/ndp/${camp.slug}?from=counter`
            : null,
      entitlements,
      summary: zh
        ? `${nGift} 赠券模版 · ${nProd} 产品 · 发放 ${issued} · 购券 ${camp._count.vouchers}`
        : `${nGift} coupons · ${nProd} products · ${issued} grants · ${camp._count.vouchers} sold`,
      ops,
      stats: [
        { label: zh ? "状态" : "Status", value: camp.status },
        { label: zh ? "发放" : "Issued", value: String(issued) },
        {
          label: zh ? "购券" : "Sold",
          value: String(camp._count.vouchers),
        },
      ],
    };
  });

  // 无活动时的引导
  const empty = bundles.length === 0;

  return (
    <div className="pb-6">
      <div className="px-4 py-3 border-b border-border">
        <h1 className="text-lg font-semibold">
          {zh ? "活动券" : "Activity perks"}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {zh
            ? "按活动分类 · 展开看权益券 · 匹配发券/核销/顾客页"
            : "By activity · expand entitlements · issue / redeem / landing"}
        </p>
      </div>

      <div className="px-4 mt-3 rounded-2xl border border-border bg-muted/40 px-3 py-2.5 text-[11px] text-muted-foreground leading-relaxed">
        {zh ? (
          <>
            与客户首页/钱包同一心智：
            <strong className="text-foreground">活动 = 故事</strong>，
            <strong className="text-foreground">权益 = 可操作的券</strong>
            。国庆：购券核销自动发 61；现金走「凭票发券」。
          </>
        ) : (
          <>
            Same model as customer home/wallet:{" "}
            <strong className="text-foreground">activity</strong> holds{" "}
            <strong className="text-foreground">entitlements</strong>.
          </>
        )}
      </div>

      {session.role === "business" && (
        <div className="px-4 mt-3 flex flex-wrap gap-2">
          <Link
            href="/business/ndp-issue"
            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-rose-600 text-white"
          >
            {zh ? "国庆一键配置 / 发券" : "NDP setup / issue"}
          </Link>
          <Link
            href="/business/campaigns"
            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-card"
          >
            {zh ? "活动管理" : "Manage campaigns"}
          </Link>
          <Link
            href="/business/products"
            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-card"
          >
            {zh ? "券产品" : "Products"}
          </Link>
        </div>
      )}

      {session.role === "staff" && (
        <div className="px-4 mt-3 flex flex-wrap gap-2">
          <Link
            href="/business/ndp-issue"
            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-rose-600 text-white"
          >
            {zh ? "国庆凭票发券" : "NDP issue"}
          </Link>
          <Link
            href={storeId ? `/business/scan?storeId=${storeId}` : "/business/scan"}
            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-primary text-primary-foreground"
          >
            {zh ? "扫码核销" : "Scan redeem"}
          </Link>
        </div>
      )}

      <div className="px-4 mt-4">
        {empty ? (
          <div className="text-center py-12 rounded-2xl border border-dashed border-border">
            <p className="text-sm text-muted-foreground">
              {zh ? "暂无活动" : "No activities"}
            </p>
            {session.role === "business" && (
              <Link
                href="/business/ndp-issue"
                className="inline-block mt-3 text-sm font-semibold text-primary"
              >
                {zh ? "一键开启国庆活动 →" : "Enable NDP →"}
              </Link>
            )}
          </div>
        ) : (
          <OffersClient lang={lang === "en" ? "en" : "zh"} bundles={bundles} />
        )}
      </div>
    </div>
  );
}

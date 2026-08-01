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
  buildNdpTermsDatesView,
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
    const tone = activityToneFromType(
      camp.type,
      camp.name,
      camp.tags,
      camp.rulesSnapshot
    );
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
            ? `/business/coupons/${coupon.id}?from=offers&campaignId=${camp.id}`
            : undefined,
        ops:
          session.role === "business"
            ? [
                {
                  label: "券详情",
                  labelEn: "Details",
                  href: `/business/coupons/${coupon.id}?from=offers&campaignId=${camp.id}`,
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
      // 打印设计：活动广告（台卡/海报）+ 实体券 PT-
      if (camp.slug) {
        ops.push({
          label: "活动广告",
          labelEn: "Ad print",
          href: `/business/campaigns/${camp.id}/print?from=offers`,
        });
      }
      ops.push({
        label: "实体券",
        labelEn: "Physical",
        href: `/business/physical?campaignId=${camp.id}&from=offers`,
      });
      ops.push({
        label: "活动设置",
        labelEn: "Settings",
        href: `/business/campaigns/${camp.id}`,
      });
    }

    const nGift = camp.coupons.length;
    const nProd = camp.catalogProducts.length;
    const issued = grantMap.get(camp.id) || 0;

    const ndpBlurb =
      meta.enabled || tone === "ndp"
        ? zh
          ? `满 S$${meta.minSpendCents / 100} 送 S$${meta.giftCouponCents / 100} · 领后 ${meta.validDays} 天有效（活动结束不缩短）`
          : `Spend S$${meta.minSpendCents / 100} → S$${meta.giftCouponCents / 100} · ${meta.validDays}d from claim`
        : null;

    // 国庆：副文带有效期规则，方便店员对客
    if (meta.enabled || tone === "ndp") {
      const terms = buildNdpTermsDatesView(
        {
          startDate: camp.startDate,
          endDate: camp.endDate,
          description: camp.description,
        },
        meta
      );
      entitlements.push({
        id: `terms-${camp.id}`,
        kind: "gift_coupon",
        tone: "default",
        title: zh ? "日期与条款（对客口径）" : "Dates & terms (customer copy)",
        primaryLabel: zh ? "展开活动见详情" : "See activity",
        secondaryLabel: `${terms.redeemRuleZh}`,
      });
    }

    return {
      key: camp.id,
      campaignId: camp.id,
      title: camp.name,
      businessName: null,
      type: camp.type,
      status: camp.status,
      tone,
      blurb:
        ndpBlurb ||
        (zh
          ? "活动容器 · 展开看权益与操作"
          : "Activity · expand perks & actions"),
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
            ? "活动 × 券的组合 · 发券/核销 · 活动广告与实体券打印设计"
            : "Activity × vouchers · issue / redeem · ad & physical print design"}
        </p>
      </div>

      <div className="px-4 mt-3 rounded-2xl border border-border bg-muted/40 px-3 py-2.5 text-[11px] text-muted-foreground leading-relaxed">
        {zh ? (
          <>
            三层：
            <strong className="text-foreground">券产品</strong>
            （可售）·
            <strong className="text-foreground">活动</strong>
            （设置）· 本页
            <strong className="text-foreground">活动券</strong>
            （组合操作）。默认场次：长期 / 大奖倒计时 / 国庆满赠。
          </>
        ) : (
          <>
            Layers:{" "}
            <strong className="text-foreground">Products</strong> ·{" "}
            <strong className="text-foreground">Activity</strong> · this page{" "}
            <strong className="text-foreground">Activity perks</strong>. Defaults:
            Evergreen · Grand countdown · National Day.
          </>
        )}
      </div>

      {session.role === "business" && (
        <div className="px-4 mt-3 flex flex-wrap gap-2">
          <Link
            href="/business/ndp-issue"
            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-rose-600 text-white"
          >
            {zh ? "一键开启默认活动" : "Enable default activities"}
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
          <Link
            href="/business/physical?from=offers"
            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-amber-600/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
          >
            {zh ? "实体印刷" : "Physical print"}
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
          <OffersClient
            lang={lang === "en" ? "en" : "zh"}
            bundles={bundles}
            showPrint={session.role === "business"}
            printables={campaigns.map((camp) => {
              const tone = activityToneFromType(
                camp.type,
                camp.name,
                camp.tags,
                camp.rulesSnapshot
              );
              return {
                id: camp.id,
                name: camp.name,
                slug: camp.slug,
                status: camp.status,
                tone,
                productCount: camp.catalogProducts.length,
                couponCount: camp.coupons.length,
              };
            })}
          />
        )}
      </div>
    </div>
  );
}

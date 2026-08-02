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
 * 门店优先：?storeId= 锁定本店（核销/发券不再二次选店）
 * 企业主未带 storeId 时先选门店
 */
export default async function BusinessOffersPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    redirect("/auth/login");
  }

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";
  const zh = lang === "zh";
  const sp = await searchParams;

  let businessId = session.userId;
  let storeId: string | null = null;
  let storeName: string | null = null;

  if (session.role === "staff") {
    if (!session.storeId) redirect("/business");
    const st = await prisma.store.findUnique({
      where: { id: session.storeId },
      select: { id: true, businessId: true, name: true },
    });
    if (!st) redirect("/business");
    businessId = st.businessId;
    storeId = st.id;
    storeName = st.name;
  } else {
    // 企业主：优先 query storeId
    const qid = sp.storeId?.trim() || null;
    if (qid) {
      const st = await prisma.store.findFirst({
        where: { id: qid, businessId: session.userId },
        select: { id: true, name: true },
      });
      if (st) {
        storeId = st.id;
        storeName = st.name;
      }
    }
  }

  // 企业主未选门店：先选店再进活动券
  if (session.role === "business" && !storeId) {
    const stores = await prisma.store.findMany({
      where: { businessId: session.userId },
      select: { id: true, name: true, address: true },
      orderBy: { createdAt: "asc" },
    });
    return (
      <div className="pb-6">
        <div className="px-4 py-3 border-b border-border">
          <h1 className="text-lg font-semibold">
            {zh ? "活动券" : "Activity perks"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {zh
              ? "请先选择门店 · 核销与国庆发券都在本店完成"
              : "Pick a store first · redeem & NDP issue stay on that outlet"}
          </p>
        </div>
        <div className="px-4 mt-4 space-y-2">
          {stores.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                {zh ? "还没有门店" : "No stores yet"}
              </p>
              <Link
                href="/business/stores"
                className="inline-block mt-3 text-sm font-semibold text-primary"
              >
                {zh ? "去添加门店 →" : "Add store →"}
              </Link>
            </div>
          ) : (
            stores.map((s) => (
              <Link
                key={s.id}
                href={`/business/offers?storeId=${encodeURIComponent(s.id)}`}
                className="block rounded-2xl border border-border bg-card p-4 active:scale-[0.99] transition-transform"
              >
                <p className="text-sm font-semibold text-foreground">{s.name}</p>
                {s.address && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.address}
                  </p>
                )}
                <p className="text-xs font-semibold text-primary mt-2">
                  {zh ? "进入本店活动券 →" : "Open store offers →"}
                </p>
              </Link>
            ))
          )}
        </div>
        <div className="px-4 mt-4">
          <Link
            href="/business/campaigns"
            className="text-xs font-medium text-muted-foreground"
          >
            {zh ? "仅配置活动（不选店）→ 活动管理" : "Config only → Campaigns"}
          </Link>
        </div>
      </div>
    );
  }

  const campaignsRaw = await prisma.campaign.findMany({
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

  // 已合并进长期券 / 清理掉的旧活动不再出现在「活动券」
  const campaigns = campaignsRaw.filter((c) => {
    try {
      const tags = JSON.parse(c.tags || "[]") as unknown;
      if (
        Array.isArray(tags) &&
        tags.some(
          (t) => t === "archived_cleanup" || t === "merged_to_long_term"
        )
      ) {
        return false;
      }
    } catch {
      /* ignore */
    }
    return true;
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
    /**
     * 真正的国庆满赠容器：只用 tone，勿用 meta.enabled。
     * 大奖/购券活动 rules 里也会挂 ndp 联动块，meta.enabled 会误判。
     */
    const isNdpActivity = tone === "ndp";
    const isDrawActivity = tone === "draw";
    const entitlements: EntitlementItem[] = [];

    // 仅国庆活动展示赠送券模版；其它活动只挂可售产品
    if (isNdpActivity) {
      for (const coupon of camp.coupons) {
        const terms = buildNdpTermsDatesView(
          {
            startDate: camp.startDate,
            endDate: camp.endDate,
            description: camp.description,
          },
          meta
        );
        entitlements.push({
          id: coupon.id,
          kind: "gift_coupon",
          tone: "gift",
          title: coupon.title,
          primaryLabel: `S$${(coupon.valueCents / 100).toFixed(0)}`,
          secondaryLabel: zh
            ? `门槛 S$${meta.minSpendCents / 100} · 领 ${coupon.claimedCount} · 用 ${coupon.usedCount} · ${terms.redeemRuleZh}`
            : `Min S$${meta.minSpendCents / 100} · claimed ${coupon.claimedCount} · ${terms.redeemRuleEn || terms.redeemRuleZh}`,
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

      // 国庆无券模版时仍展示「可发权益」占位（条款写在 secondary，不单开一行）
      if (!camp.coupons.some((x) => x.valueCents === NDP_GIFT_COUPON_CENTS)) {
        const terms = buildNdpTermsDatesView(
          {
            startDate: camp.startDate,
            endDate: camp.endDate,
            description: camp.description,
          },
          meta
        );
        entitlements.unshift({
          id: `ndp-gift-${camp.id}`,
          kind: "gift_coupon",
          tone: "gift",
          title: zh ? "国庆赠送券 S$61" : "National Day gift S$61",
          primaryLabel: "S$61",
          secondaryLabel: zh
            ? `门槛 S$${meta.minSpendCents / 100} · 已发放 ${grantMap.get(camp.id) || 0} · ${terms.redeemRuleZh}`
            : `Min S$${meta.minSpendCents / 100} · issued ${grantMap.get(camp.id) || 0}`,
        });
      }
    }

    for (const link of camp.catalogProducts) {
      const p = link.product;
      // 下架产品不展示；draft 历史线仅企业主可见（非店员）
      if (p.status === "archived") continue;
      if (p.status === "draft" && session.role !== "business") continue;
      // 国庆满赠容器一般不挂购券产品（购券在大奖活动）
      if (isNdpActivity) continue;
      entitlements.push({
        id: p.id,
        kind: "catalog",
        tone:
          isDrawActivity || p.type?.includes("draw") || p.type === "lucky_draw_v2"
            ? "draw"
            : "prepaid",
        title: p.name,
        primaryLabel:
          p.status === "active"
            ? zh
              ? "在售"
              : "Live"
            : p.status === "draft"
              ? zh
                ? "历史/草稿"
                : "History"
              : p.status,
        secondaryLabel: p.slug ? `/voucher/${p.slug}` : p.type,
        href: session.role === "business" ? `/business/products/${p.id}` : undefined,
      });
    }

    const ops: ActivityBundle["ops"] = [];
    const deskQs = new URLSearchParams();
    if (storeId) deskQs.set("storeId", storeId);
    deskQs.set("campaignId", camp.id);
    const ndpDeskHref = `/business/ndp-desk?${deskQs.toString()}`;
    const scanHref = storeId
      ? `/business/scan?storeId=${encodeURIComponent(storeId)}`
      : "/business/scan";

    // 操作按活动类型：只有国庆需要「活动券核销」定制台
    if (isNdpActivity) {
      ops.push({
        label: "活动券核销",
        labelEn: "Activity redeem",
        href: ndpDeskHref,
        primary: true,
      });
    } else if (!isDrawActivity) {
      // 长期券等预付：通用扫码核销
      ops.push({
        label: "核销",
        labelEn: "Redeem",
        href: scanHref,
        primary: true,
      });
    }

    if (camp.slug) {
      ops.push({
        label: "顾客页",
        labelEn: "Landing",
        href: isNdpActivity
          ? `/ndp/${camp.slug}?from=counter`
          : `/voucher/${camp.slug}`,
        primary: isDrawActivity,
      });
    }

    if (session.role === "business") {
      // 打印 / 实体 / 设置：各活动自有（国庆、大奖、长期均可）
      if (camp.slug || isNdpActivity) {
        ops.push({
          label: "活动广告",
          labelEn: "Ad print",
          href: `/business/campaigns/${camp.id}/print?from=offers`,
        });
      }
      // 实体券：大奖/长期有票；国庆以赠送券为主，仍可进批次页
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

    const nGift = isNdpActivity
      ? entitlements.filter((e) => e.kind === "gift_coupon").length
      : 0;
    const nProd = isNdpActivity
      ? 0
      : camp.catalogProducts.filter((l) => l.product.status !== "archived")
          .length;
    const issued = isNdpActivity ? grantMap.get(camp.id) || 0 : 0;

    let blurb: string;
    let blurbEn: string | undefined;
    if (isNdpActivity) {
      blurb = `满 S$${meta.minSpendCents / 100} 送 S$${meta.giftCouponCents / 100} · 领后 ${meta.validDays} 天有效（活动结束不缩短）`;
      blurbEn = `Spend S$${meta.minSpendCents / 100} → S$${meta.giftCouponCents / 100} · ${meta.validDays}d from claim`;
    } else if (isDrawActivity) {
      blurb = "独享购券 · 进奖池倒计时 · 可入箱票";
      blurbEn = "Exclusive buy · pool countdown · ballot optional";
    } else {
      blurb = "活动容器 · 展开看可售产品与操作";
      blurbEn = "Activity · expand products & actions";
    }

    return {
      key: camp.id,
      campaignId: camp.id,
      title: camp.name,
      businessName: null,
      type: camp.type,
      status: camp.status,
      tone,
      blurb,
      blurbEn,
      href:
        session.role === "business"
          ? `/business/campaigns/${camp.id}`
          : camp.slug
            ? isNdpActivity
              ? `/ndp/${camp.slug}?from=counter`
              : `/voucher/${camp.slug}`
            : null,
      entitlements,
      summary: zh
        ? isNdpActivity
          ? `${nGift} 赠券 · 发放 ${issued}`
          : `${nProd} 产品 · 购券 ${camp._count.vouchers}`
        : isNdpActivity
          ? `${nGift} gifts · ${issued} issued`
          : `${nProd} products · ${camp._count.vouchers} sold`,
      ops,
      stats: isNdpActivity
        ? [
            { label: zh ? "状态" : "Status", value: camp.status },
            { label: zh ? "发放" : "Issued", value: String(issued) },
          ]
        : [
            { label: zh ? "状态" : "Status", value: camp.status },
            {
              label: zh ? "购券" : "Sold",
              value: String(camp._count.vouchers),
            },
          ],
    };
  });

  // 无活动时的引导
  const empty = bundles.length === 0;

  // 仅真正的国庆满赠活动（勿用购券活动上的 ndp 联动 meta）
  const ndpCamp = campaigns.find(
    (c) =>
      activityToneFromType(c.type, c.name, c.tags, c.rulesSnapshot) === "ndp"
  );
  const ndpDeskHref =
    storeId && ndpCamp
      ? `/business/ndp-desk?storeId=${encodeURIComponent(storeId)}&campaignId=${encodeURIComponent(ndpCamp.id)}`
      : storeId
        ? `/business/ndp-desk?storeId=${encodeURIComponent(storeId)}`
        : "/business/ndp-desk";

  return (
    <div className="pb-6">
      <div className="px-4 py-3 border-b border-border">
        <h1 className="text-lg font-semibold">
          {zh ? "活动券" : "Activity perks"}
          {storeName ? (
            <span className="ml-2 text-sm font-medium text-primary">
              · {storeName}
            </span>
          ) : null}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {zh
            ? "本店活动 × 权益 · 国庆操作台 / 扫码核销（门店已锁定）"
            : "This store · NDP desk / scan (store locked)"}
        </p>
        {session.role === "business" && storeId && (
          <Link
            href="/business/offers"
            className="inline-block mt-1 text-[11px] font-medium text-primary"
          >
            {zh ? "更换门店" : "Change store"}
          </Link>
        )}
      </div>

      <div className="px-4 mt-3 rounded-2xl border border-border bg-muted/40 px-3 py-2.5 text-[11px] text-muted-foreground leading-relaxed">
        {zh ? (
          <>
            展开
            <strong className="text-foreground">国庆满赠</strong>
            → 点
            <strong className="text-foreground">活动券核销</strong>
            （本活动专用：购券扫码 / 收银凭票）。其它预付券请用底栏「核销」。
          </>
        ) : (
          <>
            Expand{" "}
            <strong className="text-foreground">National Day</strong> →{" "}
            <strong className="text-foreground">Activity redeem</strong>. Other
            prepaid vouchers use bottom-nav Scan.
          </>
        )}
      </div>

      <div className="px-4 mt-3 flex flex-wrap gap-2">
        {storeId && ndpCamp && (
          <Link
            href={ndpDeskHref}
            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-rose-600 text-white"
          >
            {zh ? "活动券核销（国庆）" : "Activity redeem"}
          </Link>
        )}
        {session.role === "business" && (
          <>
            <Link
              href="/business/ndp-issue"
              className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-card"
            >
              {zh ? "配置默认活动" : "Setup defaults"}
            </Link>
            <Link
              href="/business/campaigns"
              className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-card"
            >
              {zh ? "活动管理" : "Campaigns"}
            </Link>
            <Link
              href="/business/physical?from=offers"
              className="text-xs font-semibold px-3 py-1.5 rounded-full border border-amber-600/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
            >
              {zh ? "实体印刷" : "Physical"}
            </Link>
          </>
        )}
      </div>

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
                {zh ? "配置默认活动（含国庆）→" : "Setup default activities →"}
              </Link>
            )}
            {session.role === "staff" && storeId && (
              <Link
                href={`/business/ndp-desk?storeId=${encodeURIComponent(storeId)}`}
                className="inline-block mt-3 text-sm font-semibold text-primary"
              >
                {zh ? "国庆操作台 →" : "NDP desk →"}
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

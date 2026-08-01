import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import Link from "next/link";
import { CampaignActions } from "./CampaignActions";
import { CampaignShare } from "./CampaignShare";
import { DrawButton } from "./DrawButton";
import { PrizeEditor } from "./PrizeEditor";
import { ManualEntryButton } from "./ManualEntryButton";
import { StoreListingPanel } from "./StoreListingPanel";
import { CampaignProductsPanel } from "./CampaignProductsPanel";
import { timeAgo } from "@/lib/utils";
import { parseRulesSnapshot, getTemplate } from "@/lib/templates";
import {
  Tag,
  Flower2,
  PartyPopper,
  Calendar,
  Rocket,
  Dices,
  type LucideIcon,
} from "lucide-react";

const typeIcons: Record<string, LucideIcon> = {
  promotion: Tag,
  seasonal: Flower2,
  holiday: PartyPopper,
  event: Calendar,
  launch: Rocket,
  lucky_draw: Dices,
  lucky_draw_v2: Dices,
  voucher_sale: Tag,
};

const typeLabels: Record<string, Record<string, string>> = {
  promotion: { zh: "促销", en: "Promotion" },
  seasonal: { zh: "季节", en: "Seasonal" },
  holiday: { zh: "节日", en: "Holiday" },
  event: { zh: "活动", en: "Event" },
  launch: { zh: "新品", en: "New Launch" },
  lucky_draw: { zh: "幸运抽奖", en: "Lucky Draw" },
  lucky_draw_v2: { zh: "抽奖券", en: "Draw voucher" },
  voucher_sale: { zh: "代金券", en: "Voucher sale" },
};

const campaignStatusLabels: Record<string, Record<string, string>> = {
  active: { zh: "进行中", en: "Active" },
  ended: { zh: "已结束", en: "Ended" },
  draft: { zh: "草稿", en: "Draft" },
};

const couponStatusLabels: Record<string, Record<string, string>> = {
  published: { zh: "进行中", en: "Active" },
  draft: { zh: "草稿", en: "Draft" },
  paused: { zh: "暂停", en: "Paused" },
  ended: { zh: "结束", en: "Ended" },
};

const statsLabels: Record<string, Record<string, string>> = {
  vouchers: { zh: "代金券", en: "Vouchers" },
  totalClaims: { zh: "总领取", en: "Total Claims" },
  totalRedeems: { zh: "总核销", en: "Total Redeems" },
  conversion: { zh: "转化率", en: "Conversion" },
};

const prizeTypeLabels: Record<string, Record<string, string>> = {
  cash: { zh: "现金", en: "Cash" },
  coupon: { zh: "代金券", en: "Voucher" },
  physical: { zh: "实物", en: "Physical" },
};

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ stores?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const autoStores = sp.stores === "1";
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const campaign = await prisma.campaign.findFirst({
    where: { id, businessId: session.userId },
    include: {
      coupons: {
        include: { business: { select: { businessName: true } } },
        orderBy: { createdAt: "desc" },
      },
      catalogProducts: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              status: true,
              slug: true,
              type: true,
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
      prizes: { orderBy: { weight: "desc" } },
      entries: {
        take: 20,
        orderBy: { createdAt: "desc" },
        include: { customer: { select: { displayName: true, phone: true } }, store: { select: { name: true } } },
      },
    },
  });

  if (!campaign) return <div className="p-8 text-center text-muted-foreground">{t("campaign.detail.notFound", lang)}</div>;

  // 产品镜像不属于「活动」列表；引导回券产品页，避免两套入口混淆
  if (campaign.role === "product_mirror") {
    return (
      <div className="px-4 py-10 text-center space-y-3">
        <p className="text-sm font-semibold text-foreground">
          {lang === "en" ? "This is a product shelf (internal)" : "这是券产品货架（系统内部）"}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
          {lang === "en"
            ? "Purchase links attach to products, not activities. Manage it under Voucher products."
            : "购买链接挂在「券产品」上，不在活动列表里展示。请到券产品页管理。"}
        </p>
        <Link
          href="/business/products"
          className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground"
        >
          {lang === "en" ? "Go to products" : "去券产品"}
        </Link>
      </div>
    );
  }

  const coupons = campaign.coupons;
  const totalClaims = coupons.reduce((s, c) => s + c.claimedCount, 0);
  const totalUsed = coupons.reduce((s, c) => s + c.usedCount, 0);
  const rate = totalClaims > 0 ? Math.round((totalUsed / totalClaims) * 100) : 0;
  const totalValue = (coupons.reduce((s, c) => s + c.valueCents * c.usedCount, 0) / 100).toFixed(0);
  const now = new Date();
  const daysLeft = Math.ceil((campaign.endDate.getTime() - now.getTime()) / 86400000);

  let tags: string[] = [];
  try { tags = JSON.parse(campaign.tags || "[]"); } catch {}

  const TypeIcon = typeIcons[campaign.type] || typeIcons.promotion;
  const typeLabel = typeLabels[campaign.type] || typeLabels.promotion;
  const cs = campaignStatusLabels[campaign.status] || campaignStatusLabels.draft;
  const rules = parseRulesSnapshot(campaign.rulesSnapshot);
  const tplMeta = campaign.templateId ? getTemplate(campaign.templateId) : undefined;

  let partnerIds: string[] = [];
  try {
    partnerIds = JSON.parse(campaign.partnerIds || "[]");
  } catch {
    /* ignore */
  }

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-4 py-4" style={{ backgroundColor: (campaign.color || "#1A6EFF") + "15" }}>
        <div className="flex items-center justify-between mb-3">
          <Link href="/business/campaigns" className="text-xs text-muted-foreground">{t("campaign.detail.backToList", lang)}</Link>
          <Badge variant={campaign.status === "active" ? "green" : campaign.status === "ended" ? "orange" : "slate"}>
            {cs[lang]}
          </Badge>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <TypeIcon size={20} className="text-foreground/80" />
          <h1 className="text-xl font-bold text-foreground">{campaign.name}</h1>
        </div>
        {campaign.description && <p className="text-sm text-muted-foreground mt-1">{campaign.description}</p>}
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <span>{typeLabel[lang]}</span>
          <span>·</span>
          <span className="nums">{campaign.startDate.toLocaleDateString("zh-CN")} ~ {campaign.endDate.toLocaleDateString("zh-CN")}</span>
          {campaign.status === "active" && daysLeft > 0 && <span className="text-amber-600 dark:text-amber-500 font-medium nums">· {t("campaign.detail.daysLeft", lang, { days: daysLeft })}</span>}
        </div>
        {tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-2">
            {tags.map((tag) => <span key={tag} className="px-2 py-0.5 bg-white/60 text-muted-foreground text-[10px] rounded-full">{tag}</span>)}
          </div>
        )}
      </div>

      {/* 三层模型：活动只做设置；本块 = 活动 × 券 的组合列表 */}
      <div className="px-4 mt-4 space-y-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">
                {t("campaign.detail.couponsHeader", lang)}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                {t("campaign.detail.couponsHint", lang)}
              </p>
            </div>
            <Link
              href={`/business/coupons/new?campaignId=${campaign.id}&from=campaign`}
              className="shrink-0 text-xs text-primary font-semibold"
            >
              {t("campaign.detail.addCoupon", lang)}
            </Link>
          </div>

          {coupons.length === 0 && campaign.catalogProducts.length === 0 ? (
            <EmptyState
              tone="calm"
              icon="coupons"
              title={t("campaign.detail.emptyBundled", lang)}
              action={
                <div className="flex flex-col items-center gap-2">
                  <Link
                    href={`/business/coupons/new?campaignId=${campaign.id}&from=campaign`}
                    className="inline-block px-4 py-1.5 bg-primary text-primary-foreground text-xs rounded-full"
                  >
                    {t("campaign.detail.addFirstCoupon", lang)}
                  </Link>
                  <p className="text-[10px] text-muted-foreground">
                    {lang === "en"
                      ? "Or link sellable products below"
                      : "或在下方关联可售产品线"}
                  </p>
                </div>
              }
              className="py-6 bg-muted/40 rounded-xl mt-3"
            />
          ) : (
            <div className="space-y-2 mt-3">
              {coupons.map((c) => {
                const s = couponStatusLabels[c.status] || couponStatusLabels.draft;
                return (
                  <Link
                    key={c.id}
                    href={`/business/coupons/${c.id}?from=campaign&campaignId=${campaign.id}`}
                  >
                    <Card className="hover:border-primary/30 active:scale-[0.98] transition-transform border-border">
                      <CardContent className="p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
                              {lang === "en" ? "Gift" : "赠送"}
                            </span>
                            <p className="text-sm font-medium text-foreground truncate">
                              {c.title}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 nums">
                            S${(c.valueCents / 100).toFixed(0)} · {c.pointsRequired}⭐ ·{" "}
                            {lang === "zh" ? "领取" : "Claimed"}
                            {c.claimedCount}/{c.totalQuantity || "∞"} ·{" "}
                            {lang === "zh" ? "核销" : "Redeemed"}
                            {c.usedCount}
                          </p>
                        </div>
                        <Badge
                          variant={
                            c.status === "published"
                              ? "green"
                              : c.status === "paused"
                                ? "orange"
                                : c.status === "ended"
                                  ? "red"
                                  : "slate"
                          }
                          size="sm"
                        >
                          {s[lang]}
                        </Badge>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
              {campaign.catalogProducts.map((link) => {
                const p = link.product;
                return (
                  <Link
                    key={p.id}
                    href={`/business/products/${p.id}`}
                  >
                    <Card className="hover:border-primary/30 active:scale-[0.98] transition-transform border-border">
                      <CardContent className="p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                              {lang === "en" ? "Sellable" : "可售"}
                            </span>
                            <p className="text-sm font-medium text-foreground truncate">
                              {p.name}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {p.slug ? `/voucher/${p.slug}` : p.type} · {p.status}
                          </p>
                        </div>
                        <span className="text-muted-foreground text-sm shrink-0">→</span>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="mt-3">
            <CampaignProductsPanel campaignId={campaign.id} />
          </div>
        </div>

        <StoreListingPanel
          campaignId={campaign.id}
          productKind={campaign.productKind}
          autoOpen={autoStores || campaign.productKind === "self_use"}
        />

        {/* 打印设计：活动广告 + 实体券（与活动券页同一心智） */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">
            {lang === "en" ? "Print design" : "打印设计"}
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            {lang === "en"
              ? "Activity ad (shared QR) · Physical PT- (one code = one perk)"
              : "活动广告（同一码多人扫）· 实体券 PT-（一码一份）"}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {campaign.slug ? (
              <Link
                href={`/business/campaigns/${campaign.id}/print?from=offers`}
                className="inline-flex text-xs font-semibold px-3 py-1.5 rounded-full bg-violet-600 text-white"
              >
                {lang === "en" ? "Activity ad" : "活动广告"}
              </Link>
            ) : (
              <span className="inline-flex text-xs font-medium px-3 py-1.5 rounded-full bg-muted text-muted-foreground">
                {lang === "en" ? "Ad (no slug yet)" : "广告（缺公开链接）"}
              </span>
            )}
            <Link
              href={`/business/physical?campaignId=${campaign.id}&from=offers`}
              className="inline-flex text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-600 text-white"
            >
              {lang === "en" ? "Physical tickets" : "实体券"}
            </Link>
            <Link
              href="/business/offers"
              className="inline-flex text-xs font-medium px-3 py-1.5 rounded-full border border-border"
            >
              {lang === "en" ? "Activity perks" : "活动券"}
            </Link>
          </div>
        </div>
      </div>

      {/* Share + print QR for draw / voucher campaigns */}
      {campaign.slug &&
        (campaign.type === "lucky_draw_v2" || campaign.type === "voucher_sale") && (
          <div className="px-4 mt-4">
            <CampaignShare
              slug={campaign.slug}
              campaignName={campaign.name}
              sellerId={session.userId}
              campaignId={campaign.id}
              type={campaign.type}
              endDate={campaign.endDate}
              rulesSnapshot={campaign.rulesSnapshot}
              voucherTiers={campaign.voucherTiers}
            />
          </div>
        )}

      {/* Template rules snapshot */}
      {rules && (
        <div className="px-4 mt-4">
          <Card className="border-border bg-muted/50">
            <CardContent className="p-3 space-y-1">
              <p className="text-xs font-semibold text-foreground/80">
                {tplMeta ? `${tplMeta.icon} ${lang === "en" ? tplMeta.nameEn : tplMeta.nameZh}` : "模板规则"}
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {lang === "en" ? (
                  <>
                    Seller {rules.sellerCommissionPercent}% of paid
                    {rules.kind === "draw" || campaign.type === "lucky_draw_v2"
                      ? ` · Redeem ${campaign.budgetPercent ?? 20}% pot → seller ${rules.sellerCommissionPercent}% + platform ${rules.platformFeePercent}% + pool (full balance at buy)`
                      : rules.prizePoolPercent > 0
                        ? ` · Prize pool ${rules.prizePoolPercent}%`
                        : " · No prize pool"}
                    {rules.allowDiscount ? ` · Discount ${rules.discountPercent}%` : " · No discount"}
                    {rules.exclusiveFeeTotalPercent
                      ? ` · Exclusive fee ${rules.exclusiveFeeTotalPercent}% at sale`
                      : ""}
                    {rules.shareSellingEnabled ? " · Share selling on" : ""}
                    {` · Tiers: ${rules.enabledTiers.map((a) => `S$${a}`).join(", ")}`}
                    {partnerIds.length > 0 ? ` · ${partnerIds.length} partner(s)` : ""}
                  </>
                ) : (
                  <>
                    卖家佣金 {rules.sellerCommissionPercent}%（实付）
                    {rules.kind === "draw" || campaign.type === "lucky_draw_v2"
                      ? ` · 核销 ${campaign.budgetPercent ?? 20}% 分账：卖家 ${rules.sellerCommissionPercent}% + 平台 ${rules.platformFeePercent}% + 奖池（购券余额全额，未消费无佣金）`
                      : rules.prizePoolPercent > 0
                        ? ` · 奖池 ${rules.prizePoolPercent}%`
                        : " · 无奖池"}
                    {rules.allowDiscount ? ` · 折扣 ${rules.discountPercent}%` : " · 不打折"}
                    {rules.exclusiveFeeTotalPercent
                      ? ` · 独享付款扣 ${rules.exclusiveFeeTotalPercent}%`
                      : ""}
                    {rules.shareSellingEnabled ? " · 分享卖货开" : ""}
                    {` · 面额 ${rules.enabledTiers.map((a) => `S$${a}`).join(" / ")}`}
                    {partnerIds.length > 0 ? ` · 伙伴 ${partnerIds.length} 家` : ""}
                  </>
                )}
              </p>
              {campaign.slug && (
                <p className="text-[11px] text-muted-foreground">
                  slug: <span className="font-mono text-foreground/70">{campaign.slug}</span>
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stats */}
      <div className="px-4 mt-4">
        <div className="grid grid-cols-4 gap-2">
          {[
            {
              v: coupons.length + campaign.catalogProducts.length,
              l: lang === "en" ? "Linked" : "已挂券",
            },
            { v: totalClaims, l: statsLabels.totalClaims[lang] },
            { v: totalUsed, l: statsLabels.totalRedeems[lang] },
            { v: `${rate}%`, l: statsLabels.conversion[lang] },
          ].map((s) => (
            <Card key={s.l} className="bg-muted/50 border-0">
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-foreground nums">{s.v}</p>
                <p className="text-[10px] text-muted-foreground">{s.l}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-center mt-2">
          <p className="text-xs text-muted-foreground nums">{t("campaign.detail.totalSaved", lang, { amount: totalValue })}</p>
        </div>
      </div>

      {/* 抽奖专区 (lucky_draw) */}
      {campaign.type === "lucky_draw" && (
        <>
          {/* 抽奖配置信息 */}
          <div className="px-4 mt-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">{t("campaign.detail.drawConfig", lang)}</h3>
            <Card>
              <CardContent className="p-3 space-y-1.5 text-xs">
                <Info label={t("campaign.detail.minSpendLabel", lang)} value={campaign.minSpendCents ? t("campaign.detail.minSpendQualify", lang, { amount: (campaign.minSpendCents / 100).toFixed(0) }) : t("campaign.detail.noThreshold", lang)} />
                <Info label={t("campaign.detail.maxEntriesLabel", lang)} value={campaign.maxEntries ? t("campaign.detail.peopleCount", lang, { count: campaign.maxEntries }) : t("campaign.detail.unlimited", lang)} />
                <Info label={t("campaign.detail.drawMethodLabel", lang)} value={campaign.drawMethod === "weighted" ? t("campaign.detail.weightedRandom", lang) : campaign.drawMethod || t("campaign.detail.weightedRandom", lang)} />
                {campaign.drawDate && <Info label={t("campaign.detail.drawDateLabel", lang)} value={campaign.drawDate.toLocaleDateString("zh-CN")} />}
                <Info label={t("campaign.detail.entryCountLabel", lang)} value={t("campaign.detail.peopleCount", lang, { count: campaign.entryCount })} />
                {campaign.budgetCents && <Info label={t("campaign.detail.budgetLabel", lang)} value={`S$${(campaign.budgetCents / 100).toFixed(0)}`} />}
              </CardContent>
            </Card>
          </div>

          {/* 奖池 */}
          <div className="px-4 mt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground">{t("campaign.detail.prizeConfig", lang)}</h3>
              <PrizeEditor campaignId={campaign.id} currentPrizes={JSON.parse(JSON.stringify(campaign.prizes))} />
            </div>
            {campaign.prizes.length > 0 ? (
              <div className="space-y-1">
                {campaign.prizes.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 bg-card rounded-lg border border-border text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{p.icon}</span>
                      <div>
                        <p className="text-foreground/80 font-medium">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground nums">
                          {lang === "zh" ? "权重" : "Weight"} {p.weight} · {lang === "zh" ? "库存" : "Stock"} {p.totalStock ?? "∞"} · {lang === "zh" ? "已发" : "Claimed"} {p.claimed}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground nums">
                      {p.type === "cash" ? `S$${(p.valueCents / 100).toFixed(0)}` : prizeTypeLabels[p.type] ? prizeTypeLabels[p.type][lang] : prizeTypeLabels.physical[lang]}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4 bg-muted/50 rounded-xl">{t("campaign.detail.noPrizes", lang)}</p>
            )}
          </div>

          {/* 参与记录 */}
          <div className="px-4 mt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground">{t("campaign.detail.entriesHeader", lang)}</h3>
              <ManualEntryButton campaignId={campaign.id} />
            </div>
            {campaign.entries.length > 0 ? (
              <div className="space-y-1">
                {campaign.entries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-3 py-2 bg-card rounded-lg border border-border text-xs">
                    <div>
                      <p className="text-foreground/80">
                        {e.customer?.displayName || e.name || t("campaign.detail.unknown", lang)}
                        {e.won && e.prizeName && (
                          <span className="ml-1 text-amber-600 dark:text-amber-500 font-medium">{e.prizeIcon} {e.prizeName}</span>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {e.source === "auto" ? t("campaign.detail.autoEntry", lang) : t("campaign.detail.manualEntry", lang)}
                        {e.store?.name && ` · ${e.store.name}`}
                        {" · "}{timeAgo(e.createdAt)}
                      </p>
                    </div>
                    <Badge variant={e.won ? "green" : "slate"} size="sm">
                      {e.won ? t("campaign.detail.won", lang) : t("campaign.detail.pending", lang)}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4 bg-muted/50 rounded-xl">{t("campaign.detail.noEntries", lang)}</p>
            )}
          </div>

          {/* 开奖按钮 */}
          {campaign.status === "active" && (
            <div className="px-4 mt-5">
              <DrawButton campaignId={campaign.id} entryCount={campaign.entryCount} />
            </div>
          )}
        </>
      )}

      {/* 快速操作 */}
      {campaign.status !== "ended" && (
        <div className="px-4 mt-5 flex gap-2">
          <CampaignActions campaignId={campaign.id} currentStatus={campaign.status} />
          <Link
            href={`/business/coupons/new?campaignId=${campaign.id}&from=campaign`}
            className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-full active:scale-[0.97] transition-transform"
          >
            {t("campaign.detail.addVoucher", lang)}
          </Link>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium nums">{value}</span>
    </div>
  );
}

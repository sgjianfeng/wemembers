import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { CampaignActions } from "./CampaignActions";
import { CampaignShare } from "./CampaignShare";
import { DrawButton } from "./DrawButton";
import { PrizeEditor } from "./PrizeEditor";
import { ManualEntryButton } from "./ManualEntryButton";
import { timeAgo } from "@/lib/utils";
import { parseRulesSnapshot, getTemplate } from "@/lib/templates";

const typeIcons: Record<string, string> = {
  promotion: "🏷️",
  seasonal: "🌸",
  holiday: "🎉",
  event: "📅",
  launch: "🚀",
  lucky_draw: "🎰",
  lucky_draw_v2: "🎰",
  voucher_sale: "🏷️",
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

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const { id } = await params;
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const campaign = await prisma.campaign.findFirst({
    where: { id, businessId: session.userId },
    include: {
      coupons: {
        include: { business: { select: { businessName: true } } },
        orderBy: { createdAt: "desc" },
      },
      prizes: { orderBy: { weight: "desc" } },
      entries: {
        take: 20,
        orderBy: { createdAt: "desc" },
        include: { customer: { select: { displayName: true, phone: true } }, store: { select: { name: true } } },
      },
    },
  });

  if (!campaign) return <div className="p-8 text-center text-slate-400">{t("campaign.detail.notFound", lang)}</div>;

  const coupons = campaign.coupons;
  const totalClaims = coupons.reduce((s, c) => s + c.claimedCount, 0);
  const totalUsed = coupons.reduce((s, c) => s + c.usedCount, 0);
  const rate = totalClaims > 0 ? Math.round((totalUsed / totalClaims) * 100) : 0;
  const totalValue = (coupons.reduce((s, c) => s + c.valueCents * c.usedCount, 0) / 100).toFixed(0);
  const now = new Date();
  const daysLeft = Math.ceil((campaign.endDate.getTime() - now.getTime()) / 86400000);

  let tags: string[] = [];
  try { tags = JSON.parse(campaign.tags || "[]"); } catch {}

  const icon = typeIcons[campaign.type] || typeIcons.promotion;
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
          <Link href="/business/campaigns" className="text-xs text-slate-500">{t("campaign.detail.backToList", lang)}</Link>
          <Badge variant={campaign.status === "active" ? "green" : campaign.status === "ended" ? "orange" : "slate"}>
            {cs[lang]}
          </Badge>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">{icon}</span>
          <h1 className="text-xl font-bold text-slate-900">{campaign.name}</h1>
        </div>
        {campaign.description && <p className="text-sm text-slate-500 mt-1">{campaign.description}</p>}
        <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
          <span>{typeLabel[lang]}</span>
          <span>·</span>
          <span>{campaign.startDate.toLocaleDateString("zh-CN")} ~ {campaign.endDate.toLocaleDateString("zh-CN")}</span>
          {campaign.status === "active" && daysLeft > 0 && <span className="text-amber-500 font-medium">· {t("campaign.detail.daysLeft", lang, { days: daysLeft })}</span>}
        </div>
        {tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-2">
            {tags.map((tag) => <span key={tag} className="px-2 py-0.5 bg-white/60 text-slate-600 text-[10px] rounded-full">{tag}</span>)}
          </div>
        )}
      </div>

      {/* Share + print QR for draw / voucher campaigns */}
      {campaign.slug &&
        (campaign.type === "lucky_draw_v2" || campaign.type === "voucher_sale") && (
          <div className="px-4 mt-4">
            <CampaignShare
              slug={campaign.slug}
              campaignName={campaign.name}
              sellerId={session.userId}
            />
          </div>
        )}

      {/* Template rules snapshot */}
      {rules && (
        <div className="px-4 mt-4">
          <Card className="border-slate-100 bg-slate-50">
            <CardContent className="p-3 space-y-1">
              <p className="text-xs font-semibold text-slate-700">
                {tplMeta ? `${tplMeta.icon} ${lang === "en" ? tplMeta.nameEn : tplMeta.nameZh}` : "模板规则"}
              </p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {lang === "en" ? (
                  <>
                    Seller {rules.sellerCommissionPercent}% of paid
                    {rules.kind === "draw" || campaign.type === "lucky_draw_v2"
                      ? ` · Redeem ${campaign.budgetPercent ?? 20}% pot → seller ${rules.sellerCommissionPercent}% + platform ${rules.platformFeePercent}% + pool (full balance at buy)`
                      : rules.prizePoolPercent > 0
                        ? ` · Prize pool ${rules.prizePoolPercent}%`
                        : " · No prize pool"}
                    {rules.allowDiscount ? ` · Discount ${rules.discountPercent}%` : " · No discount"}
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
                    {rules.shareSellingEnabled ? " · 分享卖货开" : ""}
                    {` · 面额 ${rules.enabledTiers.map((a) => `S$${a}`).join(" / ")}`}
                    {partnerIds.length > 0 ? ` · 伙伴 ${partnerIds.length} 家` : ""}
                  </>
                )}
              </p>
              {campaign.slug && (
                <p className="text-[11px] text-slate-400">
                  slug: <span className="font-mono text-slate-600">{campaign.slug}</span>
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
            { v: coupons.length, l: statsLabels.vouchers[lang] },
            { v: totalClaims, l: statsLabels.totalClaims[lang] },
            { v: totalUsed, l: statsLabels.totalRedeems[lang] },
            { v: `${rate}%`, l: statsLabels.conversion[lang] },
          ].map((s) => (
            <Card key={s.l} className="bg-slate-50 border-0">
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-slate-900">{s.v}</p>
                <p className="text-[10px] text-slate-400">{s.l}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-center mt-2">
          <p className="text-xs text-slate-400">{t("campaign.detail.totalSaved", lang, { amount: totalValue })}</p>
        </div>
      </div>

      {/* 券列表 */}
      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900">{t("campaign.detail.couponsHeader", lang)}</h3>
          <Link href={`/business/coupons/new?campaignId=${campaign.id}`} className="text-xs text-[#1A6EFF] font-medium">
            {t("campaign.detail.addCoupon", lang)}
          </Link>
        </div>

        {coupons.length > 0 ? (
          <div className="space-y-2">
            {coupons.map((c) => {
              const s = couponStatusLabels[c.status] || couponStatusLabels.draft;
              return (
                <Link key={c.id} href={`/business/coupons/${c.id}`}>
                  <Card className="hover:border-[#1A6EFF]/30 transition-colors">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{c.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          S${(c.valueCents / 100).toFixed(0)} · {c.pointsRequired}⭐ · {lang === "zh" ? "领取" : "Claimed"}{c.claimedCount}/{c.totalQuantity || "∞"} · {lang === "zh" ? "核销" : "Redeemed"}{c.usedCount}
                        </p>
                      </div>
                      <Badge variant={
                        c.status === "published" ? "green" : c.status === "paused" ? "orange" : c.status === "ended" ? "red" : "slate"
                      } size="sm">{s[lang]}</Badge>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 bg-slate-50 rounded-xl">
            <p className="text-3xl mb-2">🎫</p>
            <p className="text-sm text-slate-400">{t("business.coupons.noCoupons", lang)}</p>
            <Link href={`/business/coupons/new?campaignId=${campaign.id}`} className="inline-block mt-3 px-4 py-1.5 bg-[#1A6EFF] text-white text-xs rounded-full">
              {t("campaign.detail.addFirstCoupon", lang)}
            </Link>
          </div>
        )}
      </div>

      {/* 抽奖专区 (lucky_draw) */}
      {campaign.type === "lucky_draw" && (
        <>
          {/* 抽奖配置信息 */}
          <div className="px-4 mt-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">{t("campaign.detail.drawConfig", lang)}</h3>
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
              <h3 className="text-sm font-semibold text-slate-900">{t("campaign.detail.prizeConfig", lang)}</h3>
              <PrizeEditor campaignId={campaign.id} currentPrizes={JSON.parse(JSON.stringify(campaign.prizes))} />
            </div>
            {campaign.prizes.length > 0 ? (
              <div className="space-y-1">
                {campaign.prizes.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-slate-50 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{p.icon}</span>
                      <div>
                        <p className="text-slate-700 font-medium">{p.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {lang === "zh" ? "权重" : "Weight"} {p.weight} · {lang === "zh" ? "库存" : "Stock"} {p.totalStock ?? "∞"} · {lang === "zh" ? "已发" : "Claimed"} {p.claimed}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {p.type === "cash" ? `S$${(p.valueCents / 100).toFixed(0)}` : prizeTypeLabels[p.type] ? prizeTypeLabels[p.type][lang] : prizeTypeLabels.physical[lang]}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-xl">{t("campaign.detail.noPrizes", lang)}</p>
            )}
          </div>

          {/* 参与记录 */}
          <div className="px-4 mt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900">{t("campaign.detail.entriesHeader", lang)}</h3>
              <ManualEntryButton campaignId={campaign.id} />
            </div>
            {campaign.entries.length > 0 ? (
              <div className="space-y-1">
                {campaign.entries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-slate-50 text-xs">
                    <div>
                      <p className="text-slate-700">
                        {e.customer?.displayName || e.name || t("campaign.detail.unknown", lang)}
                        {e.won && e.prizeName && (
                          <span className="ml-1 text-amber-500 font-medium">🎉 {e.prizeIcon} {e.prizeName}</span>
                        )}
                      </p>
                      <p className="text-[10px] text-slate-400">
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
              <p className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-xl">{t("campaign.detail.noEntries", lang)}</p>
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
          <Link href={`/business/coupons/new?campaignId=${campaign.id}`} className="px-4 py-2 bg-[#1A6EFF] text-white text-sm rounded-full">
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
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-900 font-medium">{value}</span>
    </div>
  );
}

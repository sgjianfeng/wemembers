"use client";

import { useLang } from "@/components/i18n/LanguageProvider";
import { type VoucherTierConfig, DEFAULT_VOUCHER_TIERS } from "@/lib/draw-v2";

// Mirror the INSTANT_PRIZES from draw-v2.ts (kept in sync manually or imported if exported)
const PRIZES = [
  { name: "S$20 代金券", icon: "💵", valueCents: 2000, weight: 6 },
  { name: "S$10 代金券", icon: "💵", valueCents: 1000, weight: 14 },
  { name: "S$5 代金券",  icon: "🎫", valueCents: 500,  weight: 8 },
  { name: "S$2 代金券",  icon: "🎟", valueCents: 200,  weight: 15 },
  { name: "S$1 代金券",  icon: "☕", valueCents: 100,  weight: 35 },
  { name: "S$0.50 代金券", icon: "🍬", valueCents: 50, weight: 50 },
];

const TIER_LABELS: Record<string, { emoji: string; labelZh: string; labelEn: string }> = {
  small: { emoji: "☕", labelZh: "小额券 S$20", labelEn: "Small S$20" },
  medium: { emoji: "🎫", labelZh: "中额券 S$50", labelEn: "Medium S$50" },
  large: { emoji: "💎", labelZh: "大额券 S$100", labelEn: "Large S$100" },
};

interface InstantPrizePreviewProps {
  tier: VoucherTierConfig;
  selectedAmount: number;
}

export function InstantPrizePreview({ tier, selectedAmount }: InstantPrizePreviewProps) {
  const { t } = useLang();
  const lang = (t("voucher.title") || "").includes("Draw") ? "en" : "zh";
  const meta = TIER_LABELS[tier.tier] || TIER_LABELS.small;

  const capCents = tier.instantPrizeCap * 100;
  const available = PRIZES.filter((p) => p.valueCents <= capCents);
  const totalWeight = available.reduce((s, p) => s + p.weight, 0);

  const tierComparison = DEFAULT_VOUCHER_TIERS.map((tc) => ({
    tier: tc.tier,
    cap: tc.instantPrizeCap,
    weightLabel:
      tc.tier === "small"
        ? lang === "zh" ? "不参与" : "Not entered"
        : tc.tier === "large"
        ? `${selectedAmount >= tc.min ? "2×" : "—"}`
        : `${selectedAmount >= tc.min ? "1×" : "—"}`,
    isActive: tc.tier === tier.tier,
    isEligible: selectedAmount >= tc.min,
    emoji: TIER_LABELS[tc.tier]?.emoji || "🎫",
  }));

  return (
    <div className="space-y-4">
      {/* ── Prize Preview ── */}
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900">
            {lang === "zh" ? "你可能赢得" : "You Could Win"}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
              {lang === "zh" ? "上限" : "Cap"} S${tier.instantPrizeCap}
            </span>
            <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded font-medium">
              {lang === "zh" ? "100% 中奖" : "100% Win"}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          {available.map((prize) => {
            const pct = ((prize.weight / totalWeight) * 100).toFixed(1);
            const isTop = prize.valueCents === available[0]?.valueCents;
            const isRare = prize.weight <= 15;
            return (
              <div key={prize.name} className="flex items-center gap-2">
                <span className="text-sm w-5 text-center shrink-0">{prize.icon}</span>
                <span className={`text-xs w-16 shrink-0 ${isTop ? "font-semibold text-slate-900" : "text-slate-600"}`}>
                  S${(prize.valueCents / 100).toFixed(2)}
                </span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isRare ? "bg-gradient-to-r from-amber-400 to-orange-400" : "bg-gradient-to-r from-blue-300 to-blue-400"
                    }`}
                    style={{ width: `${Math.max(2, Number(pct))}%` }}
                  />
                </div>
                <span className={`text-[10px] w-10 text-right shrink-0 ${isRare ? "text-amber-600 font-medium" : "text-slate-400"}`}>
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Tier Comparison ── */}
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">
          {lang === "zh" ? "四档对比" : "Tier Comparison"}
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {tierComparison.map((tc) => (
            <div
              key={tc.tier}
              className={`rounded-lg p-2.5 text-center border-2 transition-all ${
                tc.isActive
                  ? "border-amber-400 bg-amber-50"
                  : tc.isEligible
                  ? "border-slate-100 bg-white"
                  : "border-slate-50 bg-slate-50/50 opacity-50"
              }`}
            >
              <p className="text-lg mb-0.5">{tc.emoji}</p>
              <p className={`text-[11px] font-semibold ${tc.isActive ? "text-amber-700" : "text-slate-500"}`}>
                S${tc.cap}
              </p>
              <p className="text-[10px] text-slate-400">{lang === "zh" ? "即时奖上限" : "Instant Cap"}</p>
              <p className="text-[10px] mt-1 font-medium text-slate-600">
                {lang === "zh" ? "大奖池权重" : "Grand Weight"}: {tc.weightLabel}
              </p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-2 text-center">
          {tier.tier === "small"
            ? lang === "zh"
              ? "升级到 S$50+ 解锁大奖池资格"
              : "Upgrade to S$50+ to unlock Grand Pool"
            : lang === "zh"
            ? "分享链接可额外 +1× 权重"
            : "Share link for +1× extra weight"}
        </p>
      </div>
    </div>
  );
}

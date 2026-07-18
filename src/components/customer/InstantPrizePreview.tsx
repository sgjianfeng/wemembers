"use client";

import { useLang } from "@/components/i18n/LanguageProvider";
import {
  type VoucherTierConfig,
  DEFAULT_VOUCHER_TIERS,
  REDEEM_WEIGHT_MULT,
} from "@/lib/draw-v2";

// Mirror INSTANT_PRIZES from draw-v2 (kept in sync for UI preview)
const PRIZES = [
  { valueCents: 3000, icon: "💰", weight: 3 },
  { valueCents: 2000, icon: "💵", weight: 6 },
  { valueCents: 1000, icon: "💵", weight: 14 },
  { valueCents: 500, icon: "🎫", weight: 8 },
  { valueCents: 200, icon: "🎟", weight: 15 },
  { valueCents: 100, icon: "☕", weight: 35 },
  { valueCents: 50, icon: "🍬", weight: 50 },
];

const TIER_EMOJI: Record<string, string> = {
  small: "🎫",
  medium: "💎",
  large: "👑",
};

interface InstantPrizePreviewProps {
  tier: VoucherTierConfig;
  selectedAmount: number;
}

export function InstantPrizePreview({ tier, selectedAmount }: InstantPrizePreviewProps) {
  const { t } = useLang();

  const capCents = tier.instantPrizeCap * 100;
  const available = PRIZES.filter((p) => p.valueCents <= capCents);
  const totalWeight = available.reduce((s, p) => s + p.weight, 0);

  const tierComparison = DEFAULT_VOUCHER_TIERS.map((tc) => {
    const mult = REDEEM_WEIGHT_MULT[tc.tier];
    return {
      tier: tc.tier,
      min: tc.min,
      cap: tc.instantPrizeCap,
      weightLabel: `${mult}×`,
      isActive: tc.tier === tier.tier,
      isEligible: selectedAmount >= tc.min,
      emoji: TIER_EMOJI[tc.tier] || "🎫",
    };
  });

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900">{t("prize.youCouldWin")}</h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
              {t("prize.cap")} S${tier.instantPrizeCap}
            </span>
            <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded font-medium">
              {t("prize.guaranteed")}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          {available.map((prize) => {
            const pct = ((prize.weight / totalWeight) * 100).toFixed(1);
            const isTop = prize.valueCents === available[0]?.valueCents;
            const isRare = prize.weight <= 15;
            return (
              <div key={prize.valueCents} className="flex items-center gap-2">
                <span className="text-sm w-5 text-center shrink-0">{prize.icon}</span>
                <span
                  className={`text-xs w-16 shrink-0 ${
                    isTop ? "font-semibold text-slate-900" : "text-slate-600"
                  }`}
                >
                  S${(prize.valueCents / 100).toFixed(2)}
                </span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isRare
                        ? "bg-gradient-to-r from-amber-400 to-orange-400"
                        : "bg-gradient-to-r from-blue-300 to-blue-400"
                    }`}
                    style={{ width: `${Math.max(2, Number(pct))}%` }}
                  />
                </div>
                <span
                  className={`text-[10px] w-10 text-right shrink-0 ${
                    isRare ? "text-amber-600 font-medium" : "text-slate-400"
                  }`}
                >
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">{t("prize.tierCompare")}</h3>
        <div className="grid grid-cols-3 gap-2">
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
              <p
                className={`text-[11px] font-semibold ${
                  tc.isActive ? "text-amber-700" : "text-slate-500"
                }`}
              >
                {t("prize.face")} S${tc.min}
              </p>
              <p className="text-[10px] text-slate-400">
                {t("prize.instantCap")} S${tc.cap}
              </p>
              <p className="text-[10px] mt-1 font-medium text-slate-600">
                {t("prize.grandWeight")}: {tc.weightLabel}
              </p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-2 text-center">{t("prize.shareWeight")}</p>
      </div>
    </div>
  );
}

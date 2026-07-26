"use client";

import { Ticket, Gem, Crown, type LucideIcon } from "lucide-react";
import { useLang } from "@/components/i18n/LanguageProvider";
import {
  type VoucherTierConfig,
  DEFAULT_VOUCHER_TIERS,
  REDEEM_WEIGHT_MULT,
} from "@/lib/draw-v2";

// Mirror INSTANT_PRIZES from draw-v2 (kept in sync for UI preview).
// Prize glyphs are content (they depict the actual prize), so emoji stays.
const PRIZES = [
  { valueCents: 3000, icon: "💰", weight: 3 },
  { valueCents: 2000, icon: "💵", weight: 6 },
  { valueCents: 1000, icon: "💵", weight: 14 },
  { valueCents: 500, icon: "🎫", weight: 8 },
  { valueCents: 200, icon: "🎟", weight: 15 },
  { valueCents: 100, icon: "☕", weight: 35 },
  { valueCents: 50, icon: "🍬", weight: 50 },
];

/** Tier category glyph (chrome) — matches VoucherTierSelector prestige ladder. */
function tierIcon(tier: string): LucideIcon {
  if (tier === "large") return Crown;
  if (tier === "medium") return Gem;
  return Ticket;
}

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
    };
  });

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">{t("prize.youCouldWin")}</h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded nums">
              {t("prize.cap")} S${tier.instantPrizeCap}
            </span>
            <span className="text-[10px] text-green-600 bg-green-50 dark:bg-green-950/40 px-2 py-0.5 rounded font-medium">
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
                  className={`text-xs w-16 shrink-0 nums ${
                    isTop ? "font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  S${(prize.valueCents / 100).toFixed(2)}
                </span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isRare ? "bg-gold" : "bg-primary/40"
                    }`}
                    style={{ width: `${Math.max(2, Number(pct))}%` }}
                  />
                </div>
                <span
                  className={`text-[10px] w-10 text-right shrink-0 nums ${
                    isRare ? "text-[color:var(--gold-strong)] font-medium" : "text-muted-foreground"
                  }`}
                >
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">{t("prize.tierCompare")}</h3>
        <div className="grid grid-cols-3 gap-2">
          {tierComparison.map((tc) => {
            const Icon = tierIcon(tc.tier);
            return (
              <div
                key={tc.tier}
                className={`rounded-lg p-2.5 text-center border-2 transition-all ${
                  tc.isActive
                    ? "border-gold bg-gold/10"
                    : tc.isEligible
                      ? "border-border bg-card"
                      : "border-border bg-muted/40 opacity-50"
                }`}
              >
                <Icon
                  size={18}
                  className={`mx-auto mb-1 ${
                    tc.isActive ? "text-[color:var(--gold-strong)]" : "text-muted-foreground"
                  }`}
                />
                <p
                  className={`text-[11px] font-semibold nums ${
                    tc.isActive ? "text-[color:var(--gold-strong)]" : "text-muted-foreground"
                  }`}
                >
                  {t("prize.face")} S${tc.min}
                </p>
                <p className="text-[10px] text-muted-foreground nums">
                  {t("prize.instantCap")} S${tc.cap}
                </p>
                <p className="text-[10px] mt-1 font-medium text-foreground nums">
                  {t("prize.grandWeight")}: {tc.weightLabel}
                </p>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 text-center">{t("prize.shareWeight")}</p>
      </div>
    </div>
  );
}

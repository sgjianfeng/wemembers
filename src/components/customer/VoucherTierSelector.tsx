"use client";

import { Ticket, Star, Gem, Crown, Target, Rocket, type LucideIcon } from "lucide-react";
import { useLang } from "@/components/i18n/LanguageProvider";

interface TierOption {
  value: number;
  label: string;
  descKey?: string;
  desc?: string;
  badge?: "featured" | "boost" | "max";
}

interface VoucherTierSelectorProps {
  selectedAmount: number;
  onSelect: (amount: number) => void;
  /** When provided, only these face values are shown (campaign enabled tiers) */
  enabledAmounts?: number[];
}

const PRESET: TierOption[] = [
  { value: 2, label: "S$2", desc: "PayNow 小额" },
  { value: 5, label: "S$5", desc: "小额代金" },
  { value: 10, label: "S$10", desc: "试点代金" },
  { value: 50, label: "S$50", descKey: "voucher.smallTier.desc", badge: "featured" },
  { value: 100, label: "S$100", descKey: "voucher.mediumTier.desc", badge: "boost" },
  { value: 200, label: "S$200", descKey: "voucher.largeTier.desc", badge: "max" },
];

/** Face value → tier glyph (chrome, ascending prestige). */
function iconFor(value: number): LucideIcon {
  if (value >= 200) return Crown;
  if (value >= 100) return Gem;
  if (value >= 50) return Star;
  return Ticket;
}

function optionsFor(enabledAmounts?: number[]): TierOption[] {
  if (enabledAmounts && enabledAmounts.length > 0) {
    return enabledAmounts
      .map((v) => Math.round(Number(v)))
      .filter((v) => Number.isFinite(v) && v > 0)
      .sort((a, b) => a - b)
      .map((value) => {
        const preset = PRESET.find((t) => t.value === value);
        return preset || { value, label: `S$${value}`, desc: "" };
      });
  }
  return PRESET.filter((t) => [50, 100, 200].includes(t.value));
}

function TierBadge({ badge }: { badge: NonNullable<TierOption["badge"]> }) {
  if (badge === "max") {
    return (
      <span className="absolute -top-1.5 -right-1.5 rounded-full bg-gold px-1.5 py-0.5 text-[9px] font-bold text-[color:var(--gold-foreground)]">
        MAX
      </span>
    );
  }
  const Icon = badge === "featured" ? Target : Rocket;
  return (
    <span className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-gold text-[color:var(--gold-foreground)]">
      <Icon size={11} />
    </span>
  );
}

export function VoucherTierSelector({
  selectedAmount,
  onSelect,
  enabledAmounts,
}: VoucherTierSelectorProps) {
  const { t } = useLang();
  const options = optionsFor(enabledAmounts);

  if (options.length === 0) {
    return (
      <p className="text-xs text-[color:var(--gold-strong)] bg-gold/10 rounded-lg px-3 py-2">
        {t("voucher.noTiers") || "暂无可选券面"}
      </p>
    );
  }

  // 单档：直接展示，避免空三列网格
  if (options.length === 1) {
    const only = options[0]!;
    const Icon = iconFor(only.value);
    return (
      <div className="rounded-xl border-2 border-gold bg-gold/10 px-4 py-3 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold/20 text-[color:var(--gold-strong)]">
          <Icon size={20} />
        </span>
        <div>
          <p className="text-sm font-bold text-foreground nums">{only.label}</p>
          <p className="text-[11px] text-muted-foreground">
            {only.descKey ? t(only.descKey) : only.desc || t("voucher.selectTier")}
          </p>
        </div>
      </div>
    );
  }

  const cols = options.length <= 2 ? "grid-cols-2" : "grid-cols-3";

  return (
    <div className={`grid ${cols} gap-2`}>
      {options.map((tier) => {
        const isSelected = selectedAmount === tier.value;
        const Icon = iconFor(tier.value);
        return (
          <button
            key={tier.value}
            type="button"
            onClick={() => onSelect(tier.value)}
            className={`relative rounded-xl border-2 p-3 text-center transition-all active:scale-[0.97] ${
              isSelected
                ? "border-gold bg-gold/10 shadow-md"
                : "border-border bg-card hover:border-gold/40"
            }`}
          >
            {tier.badge && <TierBadge badge={tier.badge} />}
            <Icon
              size={22}
              className={`mx-auto mb-1.5 ${
                isSelected ? "text-[color:var(--gold-strong)]" : "text-muted-foreground"
              }`}
            />
            <p className="text-sm font-bold text-foreground nums">{tier.label}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
              {tier.descKey ? t(tier.descKey) : tier.desc || ""}
            </p>
          </button>
        );
      })}
    </div>
  );
}

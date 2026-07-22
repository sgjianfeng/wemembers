"use client";

import { useLang } from "@/components/i18n/LanguageProvider";

interface TierOption {
  value: number;
  label: string;
  descKey?: string;
  desc?: string;
  icon: string;
  badge?: string;
}

interface VoucherTierSelectorProps {
  selectedAmount: number;
  onSelect: (amount: number) => void;
  /** When provided, only these face values are shown (campaign enabled tiers) */
  enabledAmounts?: number[];
}

const PRESET: TierOption[] = [
  { value: 2, label: "S$2", desc: "PayNow 小额", icon: "🎟" },
  { value: 5, label: "S$5", desc: "小额代金", icon: "🎫" },
  { value: 10, label: "S$10", desc: "试点代金", icon: "💵" },
  {
    value: 50,
    label: "S$50",
    descKey: "voucher.smallTier.desc",
    icon: "🎫",
    badge: "🎯",
  },
  {
    value: 100,
    label: "S$100",
    descKey: "voucher.mediumTier.desc",
    icon: "💎",
    badge: "🚀",
  },
  {
    value: 200,
    label: "S$200",
    descKey: "voucher.largeTier.desc",
    icon: "👑",
    badge: "MAX",
  },
];

function optionsFor(enabledAmounts?: number[]): TierOption[] {
  if (enabledAmounts && enabledAmounts.length > 0) {
    return enabledAmounts
      .map((v) => Math.round(Number(v)))
      .filter((v) => Number.isFinite(v) && v > 0)
      .sort((a, b) => a - b)
      .map((value) => {
        const preset = PRESET.find((t) => t.value === value);
        return (
          preset || {
            value,
            label: `S$${value}`,
            desc: "",
            icon: "🎫",
          }
        );
      });
  }
  return PRESET.filter((t) => [50, 100, 200].includes(t.value));
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
      <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
        {t("voucher.noTiers") || "暂无可选券面"}
      </p>
    );
  }

  // 单档：直接展示，避免空三列网格
  if (options.length === 1) {
    const only = options[0]!;
    return (
      <div className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 flex items-center gap-3">
        <span className="text-2xl">{only.icon}</span>
        <div>
          <p className="text-sm font-bold text-slate-900">{only.label}</p>
          <p className="text-[11px] text-slate-500">
            {only.descKey ? t(only.descKey) : only.desc || t("voucher.selectTier")}
          </p>
        </div>
      </div>
    );
  }

  const cols =
    options.length <= 2 ? "grid-cols-2" : options.length === 3 ? "grid-cols-3" : "grid-cols-3";

  return (
    <div className={`grid ${cols} gap-2`}>
      {options.map((tier) => {
        const isSelected = selectedAmount === tier.value;
        return (
          <button
            key={tier.value}
            type="button"
            onClick={() => onSelect(tier.value)}
            className={`relative rounded-xl border-2 p-3 text-center transition-all active:scale-[0.97] ${
              isSelected
                ? "border-amber-400 bg-amber-50 shadow-md"
                : "border-slate-100 bg-white hover:border-slate-200"
            }`}
          >
            {tier.badge && (
              <span className="absolute -top-1.5 -right-1.5 text-xs">{tier.badge}</span>
            )}
            <p className="text-2xl mb-1">{tier.icon}</p>
            <p className="text-sm font-bold text-slate-900">{tier.label}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {tier.descKey ? t(tier.descKey) : tier.desc || ""}
            </p>
          </button>
        );
      })}
    </div>
  );
}

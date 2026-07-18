"use client";

import { useLang } from "@/components/i18n/LanguageProvider";

interface TierOption {
  value: number;
  label: string;
  descKey: string;
  icon: string;
  badge?: string;
}

interface VoucherTierSelectorProps {
  selectedAmount: number;
  onSelect: (amount: number) => void;
  /** When provided, only these face values are shown (campaign enabled tiers) */
  enabledAmounts?: number[];
}

const TIERS: TierOption[] = [
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

export function VoucherTierSelector({
  selectedAmount,
  onSelect,
  enabledAmounts,
}: VoucherTierSelectorProps) {
  const { t } = useLang();
  const options =
    enabledAmounts && enabledAmounts.length > 0
      ? TIERS.filter((tier) => enabledAmounts.includes(tier.value))
      : TIERS;

  return (
    <div className="grid grid-cols-3 gap-2">
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
            <p className="text-[10px] text-slate-400 mt-0.5">{t(tier.descKey)}</p>
          </button>
        );
      })}
    </div>
  );
}

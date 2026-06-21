"use client";

import { useLang } from "@/components/i18n/LanguageProvider";

interface TierOption {
  value: number;
  label: string;
  descKey: string;
  gradient: string;
  bg: string;
  icon: string;
  badge?: string;
}

interface VoucherTierSelectorProps {
  selectedAmount: number;
  onSelect: (amount: number) => void;
}

const TIERS: TierOption[] = [
  { value: 20, label: "S$20", descKey: "voucher.smallTier", gradient: "from-slate-400 to-slate-500", bg: "bg-slate-50", icon: "☕" },
  { value: 50, label: "S$50", descKey: "voucher.mediumTier", gradient: "from-amber-400 to-amber-500", bg: "bg-amber-50", icon: "🎫", badge: "🎯" },
  { value: 100, label: "S$100", descKey: "voucher.largeTier", gradient: "from-violet-500 to-violet-600", bg: "bg-violet-50", icon: "💎", badge: "🚀" },
];

export function VoucherTierSelector({ selectedAmount, onSelect }: VoucherTierSelectorProps) {
  const { t } = useLang();

  return (
    <div className="grid grid-cols-3 gap-2">
      {TIERS.map((tier) => {
        const isSelected = selectedAmount === tier.value;
        return (
          <button
            key={tier.value}
            type="button"
            onClick={() => onSelect(tier.value)}
            className={`relative rounded-xl border-2 p-3 text-center transition-all active:scale-[0.97] ${
              isSelected
                ? `border-amber-400 bg-amber-50 shadow-md`
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

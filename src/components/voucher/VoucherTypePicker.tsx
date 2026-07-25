"use client";

import { cn } from "@/lib/utils";
import type { ProductKind } from "@/lib/product-kind";
import { useLang } from "@/components/i18n/LanguageProvider";

export function VoucherTypePicker({
  value,
  onChange,
}: {
  value: ProductKind | null;
  onChange: (k: ProductKind) => void;
}) {
  const { t } = useLang();

  const cards: {
    id: ProductKind;
    title: string;
    lines: string[];
    rail: string;
    selectedRing: string;
  }[] = [
    {
      id: "self_use",
      title: t("productKind.self"),
      lines: [
        t("productKind.selfL1"),
        t("productKind.selfL2"),
        t("productKind.selfL3"),
      ],
      rail: "bg-slate-500",
      selectedRing: "border-slate-400 ring-2 ring-slate-200",
    },
    {
      id: "distribution",
      title: t("productKind.dist"),
      lines: [
        t("productKind.distL1"),
        t("productKind.distL2"),
        t("productKind.distL3"),
      ],
      rail: "bg-amber-500",
      selectedRing: "border-amber-400 ring-2 ring-amber-100",
    },
  ];

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          {t("productKind.pickTitle")}
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          {t("productKind.pickHint")}
        </p>
      </div>
      <div className="space-y-2.5">
        {cards.map((c) => {
          const selected = value === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c.id)}
              className={cn(
                "w-full text-left rounded-2xl border bg-white overflow-hidden transition-colors",
                selected ? c.selectedRing : "border-slate-100 hover:border-slate-200"
              )}
            >
              <div className="flex">
                <div className={cn("w-1.5 shrink-0", c.rail)} />
                <div className="flex-1 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    {c.title}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {c.lines.map((line) => (
                      <li
                        key={line}
                        className="text-xs text-slate-500 leading-snug"
                      >
                        · {line}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="pr-4 flex items-center">
                  <span
                    className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                      selected
                        ? "border-[#1A6EFF] bg-[#1A6EFF]"
                        : "border-slate-200"
                    )}
                  >
                    {selected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { cn } from "@/lib/utils";
import type { ProductKind } from "@/lib/product-kind";
import {
  normalizeProductKind,
  productDisplayLabel,
} from "@/lib/product-kind";
import { useLang } from "@/components/i18n/LanguageProvider";

export function VoucherTypeBadge({
  kind,
  isDraw = false,
  className,
  size = "md",
  showPlay = true,
}: {
  kind: ProductKind | string | null | undefined;
  /** lucky_draw / lucky_draw_v2 */
  isDraw?: boolean;
  className?: string;
  size?: "sm" | "md";
  showPlay?: boolean;
}) {
  const { lang } = useLang();
  const k = normalizeProductKind(kind);
  const self = k === "self_use";
  const label = productDisplayLabel(k, isDraw, lang === "en" ? "en" : "zh");

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span
        className={cn(
          "inline-flex items-center font-semibold rounded-full border",
          size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2.5 py-1",
          self
            ? "bg-slate-100 text-slate-700 border-slate-200"
            : "bg-orange-50 text-amber-800 border-orange-100"
        )}
      >
        {label}
      </span>
      {isDraw && showPlay && (
        <span
          className={cn(
            "inline-flex items-center font-semibold rounded-full border bg-violet-50 text-violet-700 border-violet-100",
            size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5"
          )}
        >
          {lang === "en" ? "Draw" : "抽奖"}
        </span>
      )}
    </span>
  );
}

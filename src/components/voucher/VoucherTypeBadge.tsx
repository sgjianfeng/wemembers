"use client";

import { cn } from "@/lib/utils";
import type { ProductKind } from "@/lib/product-kind";
import { normalizeProductKind } from "@/lib/product-kind";

export function VoucherTypeBadge({
  kind,
  className,
  size = "md",
}: {
  kind: ProductKind | string | null | undefined;
  className?: string;
  size?: "sm" | "md";
}) {
  const k = normalizeProductKind(kind);
  const self = k === "self_use";
  return (
    <span
      className={cn(
        "inline-flex items-center font-semibold rounded-full border",
        size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2.5 py-1",
        self
          ? "bg-slate-100 text-slate-700 border-slate-200"
          : "bg-orange-50 text-amber-800 border-orange-100",
        className
      )}
    >
      {self ? "自用券" : "分发券"}
    </span>
  );
}

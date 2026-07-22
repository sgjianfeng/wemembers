"use client";

import { useState } from "react";
import { cn, resolveUploadUrl } from "@/lib/utils";

/**
 * Brand / business logo with letter fallback.
 * Prefer for company-level surfaces (not individual outlet photos).
 *
 * - Relative `/uploads/...` can be rewritten via NEXT_PUBLIC_MIRROR_ASSET_ORIGIN
 *   (used by `npm run dev:mirror` so prod logos load without a full file sync).
 * - onError falls back to the letter avatar (avoids broken-image chrome).
 */
export function BrandAvatar({
  src,
  name,
  size = 40,
  className,
  rounded = "xl",
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  rounded?: "full" | "xl" | "2xl" | "lg";
}) {
  const resolved = resolveUploadUrl(src);
  const [failed, setFailed] = useState(false);
  const letter = (name || "?").trim().charAt(0).toUpperCase() || "?";
  const radius =
    rounded === "full"
      ? "rounded-full"
      : rounded === "2xl"
        ? "rounded-2xl"
        : rounded === "lg"
          ? "rounded-lg"
          : "rounded-xl";

  if (resolved && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolved}
        alt={name || "Logo"}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={cn(
          radius,
          // contain: brand marks should not be cropped like photos
          "object-contain bg-white border border-slate-100 shrink-0 p-0.5",
          className
        )}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={cn(
        radius,
        "bg-gradient-to-br from-[#1A6EFF] to-[#3B82F6] flex items-center justify-center text-white font-semibold shrink-0",
        className
      )}
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.38) }}
      aria-hidden
    >
      {letter}
    </div>
  );
}

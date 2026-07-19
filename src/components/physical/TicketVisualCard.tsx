"use client";

import type { Ref } from "react";
import { formatMoney } from "@/lib/utils";
import {
  getVisualTemplate,
  resolveThemeHex,
  type VisualTemplateId,
} from "@/lib/visual-templates";
import { cn } from "@/lib/utils";

export type TicketVisualProps = {
  templateId?: string | null;
  themeColor?: string | null;
  type: string;
  title: string;
  valueCents: number;
  storeName: string;
  storeAddress?: string | null;
  businessName?: string | null;
  businessLogo?: string | null;
  validLabel: string;
  code: string;
  qrSrc?: string;
  claimUrl?: string;
  lang: "zh" | "en";
  /** print = 票面；share = 1:1 分享预览 */
  mode?: "print" | "share";
  className?: string;
  cardRef?: Ref<HTMLDivElement>;
};

/**
 * 系统视觉模版渲染（无自由设计）。
 * store_classic = 白底；store_bold = 深色块。
 */
export function TicketVisualCard({
  templateId,
  themeColor,
  type,
  title,
  valueCents,
  storeName,
  storeAddress,
  businessName,
  businessLogo,
  validLabel,
  code,
  qrSrc,
  lang,
  mode = "print",
  className,
  cardRef,
}: TicketVisualProps) {
  const tpl = getVisualTemplate(templateId);
  const accent = resolveThemeHex(themeColor, tpl.id);
  const isBold = tpl.surface === "dark";
  const isDraw = type === "draw";
  const isShare = mode === "share";

  return (
    <div
      ref={cardRef}
      className={cn(
        "break-inside-avoid overflow-hidden",
        isShare
          ? "w-full aspect-square rounded-2xl"
          : "rounded-xl border print:border-slate-400",
        isBold ? "border-transparent" : "border-slate-200 bg-white",
        className
      )}
      style={
        isBold
          ? {
              background: `linear-gradient(145deg, ${accent} 0%, #0f0e17 70%)`,
              color: "#fff",
            }
          : undefined
      }
    >
      <div className={cn("p-3", isShare && "p-5 h-full flex flex-col")}>
        {/* Header brand */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            {businessLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={businessLogo}
                alt=""
                className={cn(
                  "object-contain rounded-lg shrink-0 bg-white",
                  isShare ? "w-14 h-14" : "w-10 h-10",
                  "border border-white/20"
                )}
              />
            ) : (
              <div
                className={cn(
                  "rounded-lg shrink-0 flex items-center justify-center text-lg",
                  isShare ? "w-14 h-14" : "w-10 h-10",
                  isBold ? "bg-white/15" : "bg-slate-100"
                )}
              >
                🏪
              </div>
            )}
            <div className="min-w-0">
              <p
                className={cn(
                  "font-semibold truncate",
                  isShare ? "text-sm" : "text-[10px]",
                  isBold ? "text-white" : "text-slate-800"
                )}
              >
                {businessName || "Store"}
              </p>
              <p
                className={cn(
                  "tracking-wider uppercase",
                  isShare ? "text-[10px]" : "text-[9px]",
                  isBold ? "text-white/60" : "text-amber-700/80"
                )}
              >
                WeMembers
              </p>
            </div>
          </div>
          {isDraw && (
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 font-bold",
                isShare ? "text-xs" : "text-[10px]",
                isBold
                  ? "bg-white/20 text-white"
                  : "bg-violet-100 text-violet-700"
              )}
            >
              {lang === "en" ? "DRAW" : "抽奖"}
            </span>
          )}
        </div>

        <p
          className={cn(
            "font-bold mt-2 leading-snug",
            isShare ? "text-xl mt-4" : "text-sm",
            isBold ? "text-white" : "text-slate-900"
          )}
        >
          {title}
        </p>

        {type === "voucher" ? (
          <p
            className={cn(
              "font-bold mt-1",
              isShare ? "text-4xl mt-3" : "text-lg",
              isBold ? "text-white" : ""
            )}
            style={!isBold ? { color: accent } : undefined}
          >
            S${formatMoney(valueCents)}
          </p>
        ) : (
          <p
            className={cn(
              "font-semibold mt-1",
              isShare ? "text-lg mt-3" : "text-sm",
              isBold ? "text-amber-200" : "text-violet-600"
            )}
          >
            {lang === "en"
              ? "Lucky draw · scan to join"
              : "抽奖券 · 扫码绑定看大奖"}
          </p>
        )}

        <p
          className={cn(
            "mt-1",
            isShare ? "text-sm mt-2" : "text-[11px]",
            isBold ? "text-white/75" : "text-slate-500"
          )}
        >
          🏪 {storeName}
          {storeAddress ? ` · ${storeAddress}` : ""}
        </p>
        <p
          className={cn(
            "font-semibold mt-0.5",
            isShare ? "text-xs" : "text-[10px]",
            isBold ? "text-amber-300" : "text-red-600/80"
          )}
        >
          {lang === "en"
            ? "This store only · one-time use"
            : "仅限本店 · 一次用完"}
        </p>

        <div
          className={cn(
            "flex gap-3 items-center",
            isShare ? "mt-auto pt-4" : "mt-2"
          )}
        >
          {qrSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrSrc}
              alt="QR"
              className={cn(
                "rounded-lg bg-white shrink-0",
                isShare ? "w-28 h-28 border-2 border-white/30" : "w-24 h-24 border"
              )}
            />
          ) : (
            <div
              className={cn(
                "rounded-lg bg-white/90 shrink-0 flex items-center justify-center text-slate-300",
                isShare ? "w-28 h-28" : "w-24 h-24"
              )}
            >
              QR
            </div>
          )}
          <div className="min-w-0">
            <p
              className={cn(
                isShare ? "text-xs" : "text-[10px]",
                isBold ? "text-white/50" : "text-slate-400"
              )}
            >
              {lang === "en" ? "Code" : "券码"}
            </p>
            <p
              className={cn(
                "font-mono font-semibold break-all",
                isShare ? "text-sm" : "text-xs",
                isBold ? "text-white" : "text-slate-800"
              )}
            >
              {code}
            </p>
            <p
              className={cn(
                "mt-1",
                isShare ? "text-xs" : "text-[10px]",
                isBold ? "text-white/50" : "text-slate-400"
              )}
            >
              {lang === "en" ? "Valid until" : "有效期至"} {validLabel}
            </p>
            <p
              className={cn(
                "mt-1 leading-snug",
                isShare ? "text-xs" : "text-[10px]",
                isBold ? "text-white/70" : "text-slate-500"
              )}
            >
              {lang === "en"
                ? "Scan to bind to your phone"
                : "扫码绑定手机 · 注册或登录"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function defaultTemplateForType(type: string): VisualTemplateId {
  return type === "draw" ? "store_bold" : "store_classic";
}

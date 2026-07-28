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
  /** print = A4 条形票面；share = 1:1 分享预览 */
  mode?: "print" | "share";
  className?: string;
  cardRef?: Ref<HTMLDivElement>;
};

/**
 * 系统视觉模版渲染（无自由设计）。
 * print：横向条形代金券（像真券）；share：1:1 社媒卡。
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
  const isDraw = type === "draw" || type === "ballot";
  const isBallot = type === "ballot";
  const isShare = mode === "share";
  const face = `S$${formatMoney(valueCents)}`;

  const kindLabel =
    isBallot
      ? lang === "en"
        ? "BALLOT"
        : "入箱票"
      : isDraw
        ? lang === "en"
          ? "DRAW"
          : "抽奖券"
        : lang === "en"
          ? "VOUCHER"
          : "代金券";

  // ── Share (1:1) ──────────────────────────────────────────
  if (isShare) {
    return (
      <div
        ref={cardRef}
        className={cn(
          "w-full aspect-square rounded-2xl overflow-hidden break-inside-avoid",
          className
        )}
        style={
          isBold
            ? {
                background: `linear-gradient(145deg, ${accent} 0%, #0f0e17 72%)`,
                color: "#fff",
              }
            : {
                background: `linear-gradient(160deg, #fffef9 0%, #fff7eb 55%, #ffe8c8 100%)`,
                border: `2px solid ${accent}`,
                color: "#1a1a1a",
              }
        }
      >
        <div className="p-5 h-full flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <BrandRow
              businessName={businessName}
              businessLogo={businessLogo}
              isBold={isBold}
              large
            />
            <KindBadge label={kindLabel} accent={accent} isBold={isBold} />
          </div>
          <p
            className={cn(
              "font-bold mt-4 text-xl leading-snug",
              isBold ? "text-white" : "text-slate-900"
            )}
          >
            {title}
          </p>
          <p
            className={cn(
              "font-black mt-3 text-5xl tracking-tight nums",
              isBold ? "text-white" : ""
            )}
            style={!isBold ? { color: accent } : undefined}
          >
            {face}
          </p>
          {!isDraw && (
            <p
              className={cn(
                "text-sm font-semibold mt-1",
                isBold ? "text-white/80" : "text-slate-600"
              )}
            >
              {lang === "en" ? "Store credit" : "本店消费抵用"}
            </p>
          )}
          {isBallot && (
            <p
              className={cn(
                "text-sm font-semibold mt-1",
                isBold ? "text-amber-200" : "text-orange-700"
              )}
            >
              {lang === "en"
                ? "Box only · not spendable"
                : "仅投抽奖箱 · 不抵消费"}
            </p>
          )}
          <p
            className={cn(
              "text-sm mt-2",
              isBold ? "text-white/75" : "text-slate-600"
            )}
          >
            🏪 {storeName}
          </p>
          <p
            className={cn(
              "text-xs font-bold mt-1",
              isBold ? "text-amber-300" : "text-red-600"
            )}
          >
            {lang === "en"
              ? "This store only · one-time use"
              : "仅限本店 · 一次用完"}
          </p>
          <div className="mt-auto pt-4 flex gap-3 items-end">
            <QrBlock qrSrc={qrSrc} size="lg" bordered />
            <div className="min-w-0 pb-1">
              <p
                className={cn(
                  "text-xs",
                  isBold ? "text-white/50" : "text-slate-500"
                )}
              >
                {lang === "en" ? "Code" : "券码"}
              </p>
              <p
                className={cn(
                  "font-mono font-bold text-sm break-all",
                  isBold ? "text-white" : "text-slate-900"
                )}
              >
                {code}
              </p>
              <p
                className={cn(
                  "text-xs mt-1",
                  isBold ? "text-white/50" : "text-slate-500"
                )}
              >
                {lang === "en" ? "Valid until" : "有效期至"} {validLabel}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Print strip (A4 条形代金券) ──────────────────────────
  // 横向：左侧色条 + 面值 | 中部信息 | 虚线撕口 | 右侧 QR
  const stripBg = isBold
    ? undefined
    : isDraw
      ? "linear-gradient(90deg, #faf5ff 0%, #ffffff 40%, #fff 100%)"
      : "linear-gradient(90deg, #fff9f0 0%, #fffefb 45%, #ffffff 100%)";
  const stripBorder = isBold ? "transparent" : isDraw ? "#7c3aed" : accent;
  const ink = isBold ? "#ffffff" : "#111827";
  const muted = isBold ? "rgba(255,255,255,0.72)" : "#4b5563";
  const warn = isBold ? "#fcd34d" : "#dc2626";

  return (
    <div
      ref={cardRef}
      className={cn(
        "break-inside-avoid overflow-hidden w-full",
        "rounded-lg print:rounded-md",
        "print:shadow-none shadow-sm",
        className
      )}
      style={{
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
        border: `2.5px solid ${stripBorder}`,
        background: isBold
          ? `linear-gradient(100deg, ${accent} 0%, #1a1528 55%, #0f0e17 100%)`
          : stripBg,
        color: ink,
      }}
    >
      <div className="flex min-h-[148px] print:min-h-[132px]">
        {/* Left brand band */}
        <div
          className="w-[7px] shrink-0 print:w-2"
          style={{
            background: isBold
              ? "linear-gradient(180deg, #fbbf24, #f59e0b)"
              : `linear-gradient(180deg, ${accent}, ${shadeHex(accent, -28)})`,
          }}
          aria-hidden
        />

        {/* Face value column */}
        <div
          className="shrink-0 flex flex-col justify-center px-3 py-2.5 min-w-[92px] print:min-w-[100px] print:px-3.5"
          style={{
            borderRight: isBold
              ? "1px dashed rgba(255,255,255,0.25)"
              : `1px dashed ${hexAlpha(accent, 0.35)}`,
            background: isBold
              ? "rgba(0,0,0,0.15)"
              : hexAlpha(accent, 0.08),
          }}
        >
          <span
            className="text-[9px] font-extrabold tracking-[0.14em] uppercase mb-1"
            style={{ color: isBold ? "#fde68a" : accent }}
          >
            {kindLabel}
          </span>
          <p
            className="font-black leading-none tracking-tight nums text-[1.65rem] print:text-[1.85rem]"
            style={{ color: isBold ? "#fff" : accent }}
          >
            {face}
          </p>
          <p
            className="text-[9px] font-semibold mt-1.5 leading-tight"
            style={{ color: muted }}
          >
            {isBallot
              ? lang === "en"
                ? "Box only"
                : "仅投箱"
              : isDraw
                ? lang === "en"
                  ? "Draw ticket"
                  : "抽奖资格"
                : lang === "en"
                  ? "Store credit"
                  : "本店抵用"}
          </p>
        </div>

        {/* Main body */}
        <div className="flex-1 min-w-0 px-3 py-2.5 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2">
              <BrandRow
                businessName={businessName}
                businessLogo={businessLogo}
                isBold={isBold}
              />
            </div>
            <p
              className="font-bold text-[13px] print:text-sm leading-snug mt-1.5 line-clamp-2"
              style={{ color: ink }}
            >
              {title}
            </p>
            <p className="text-[11px] mt-1 leading-snug" style={{ color: muted }}>
              <span className="font-medium">{storeName}</span>
              {storeAddress ? (
                <span className="opacity-90"> · {storeAddress}</span>
              ) : null}
            </p>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span
              className="text-[10px] font-bold"
              style={{ color: warn }}
            >
              {lang === "en"
                ? "This store only · one-time"
                : "仅限本店 · 一次用完"}
            </span>
            <span className="text-[10px]" style={{ color: muted }}>
              {lang === "en" ? "Valid" : "有效期"} {validLabel}
            </span>
          </div>
        </div>

        {/* Perforation + QR stub */}
        <div
          className="shrink-0 flex items-stretch"
          style={{
            borderLeft: isBold
              ? "1px dashed rgba(255,255,255,0.35)"
              : "1.5px dashed #d1d5db",
          }}
        >
          <div
            className="flex flex-col items-center justify-center px-2.5 py-2 gap-1 min-w-[108px] print:min-w-[112px]"
            style={{
              background: isBold ? "rgba(255,255,255,0.08)" : "#ffffff",
            }}
          >
            <QrBlock qrSrc={qrSrc} size="md" bordered={!isBold} />
            <div className="text-center w-full px-0.5">
              <p
                className="text-[8px] font-medium uppercase tracking-wide"
                style={{ color: muted }}
              >
                {lang === "en" ? "Code" : "券码"}
              </p>
              <p
                className="font-mono text-[9px] font-bold leading-tight break-all"
                style={{ color: ink }}
              >
                {code}
              </p>
              <p className="text-[8px] mt-0.5 leading-tight" style={{ color: muted }}>
                {lang === "en" ? "Scan to bind" : "扫码绑定"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandRow({
  businessName,
  businessLogo,
  isBold,
  large,
}: {
  businessName?: string | null;
  businessLogo?: string | null;
  isBold: boolean;
  large?: boolean;
}) {
  return (
    <div className="min-w-0 flex items-center gap-2">
      {businessLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={businessLogo}
          alt=""
          className={cn(
            "object-contain rounded-md shrink-0 bg-white",
            large ? "w-12 h-12" : "w-8 h-8",
            "border border-black/10"
          )}
        />
      ) : (
        <div
          className={cn(
            "rounded-md shrink-0 flex items-center justify-center",
            large ? "w-12 h-12 text-lg" : "w-8 h-8 text-sm",
            isBold ? "bg-white/15" : "bg-amber-100"
          )}
        >
          🏪
        </div>
      )}
      <div className="min-w-0">
        <p
          className={cn(
            "font-bold truncate leading-tight",
            large ? "text-sm" : "text-[11px]",
            isBold ? "text-white" : "text-slate-900"
          )}
        >
          {businessName || "Store"}
        </p>
        <p
          className={cn(
            "tracking-[0.12em] uppercase font-semibold",
            large ? "text-[10px]" : "text-[8px]",
            isBold ? "text-amber-200/80" : "text-amber-800"
          )}
        >
          WeMembers
        </p>
      </div>
    </div>
  );
}

function KindBadge({
  label,
  accent,
  isBold,
}: {
  label: string;
  accent: string;
  isBold: boolean;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold tracking-wide",
        isBold ? "bg-white/20 text-white" : "text-white"
      )}
      style={!isBold ? { backgroundColor: accent } : undefined}
    >
      {label}
    </span>
  );
}

function QrBlock({
  qrSrc,
  size,
  bordered,
}: {
  qrSrc?: string;
  size: "md" | "lg";
  bordered?: boolean;
}) {
  const dim = size === "lg" ? "w-28 h-28" : "w-[72px] h-[72px] print:w-[76px] print:h-[76px]";
  if (qrSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={qrSrc}
        alt="QR"
        className={cn(
          "rounded-md bg-white shrink-0 object-contain",
          dim,
          bordered && "border border-slate-300"
        )}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-md bg-white shrink-0 flex items-center justify-center text-slate-400 text-xs",
        dim,
        bordered && "border border-slate-300"
      )}
    >
      QR
    </div>
  );
}

/** Darken/lighten hex by amount (-100..100). */
function shadeHex(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;
  const t = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c + (amount / 100) * 255)));
  r = t(r);
  g = t(g);
  b = t(b);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function defaultTemplateForType(type: string): VisualTemplateId {
  return type === "draw" || type === "ballot" ? "store_bold" : "store_classic";
}

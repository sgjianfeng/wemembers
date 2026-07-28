"use client";

import type { Ref } from "react";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { formatMoney, cn } from "@/lib/utils";
import {
  getVisualTemplate,
  resolveThemeHex,
  type VisualTemplateId,
} from "@/lib/visual-templates";

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
  terms?: string | null;
  mode?: "print" | "share";
  className?: string;
  cardRef?: Ref<HTMLDivElement>;
};

function defaultTerms(type: string, lang: "zh" | "en"): string {
  if (type === "ballot") {
    return lang === "en"
      ? "Box only · not spendable."
      : "仅投抽奖箱，不抵消费。";
  }
  if (type === "draw") {
    return lang === "en"
      ? "Exclusive draw · this store · one-time."
      : "独享抽奖 · 仅限本店 · 一次有效。";
  }
  return lang === "en"
    ? "This store only · one-time. Scan to bind."
    : "仅限本店 · 一次用完。扫码绑定手机后使用。";
}

function claimLink(code: string, claimUrl?: string | null): string {
  if (claimUrl?.trim()) return claimUrl.trim();
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/c/${encodeURIComponent(code)}`;
}

/** 本地生成 QR；同时保留 api 图作第二路 */
function useQrSrc(
  code: string,
  claimUrl?: string | null,
  apiQrSrc?: string | null,
  size = 168
): string {
  const [dataUrl, setDataUrl] = useState("");

  // 稳定的 API 兜底（公开接口）
  const apiFallback = useMemo(() => {
    if (apiQrSrc?.trim()) return apiQrSrc.trim();
    if (!code) return "";
    return `/api/physical/qr?code=${encodeURIComponent(code)}&size=${size}`;
  }, [apiQrSrc, code, size]);

  useEffect(() => {
    let dead = false;
    const target = claimLink(code, claimUrl);
    if (!target) return;

    QRCode.toDataURL(target, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((u) => {
        if (!dead) setDataUrl(u);
      })
      .catch((e) => {
        console.warn("local QR fail, use api", e);
      });

    return () => {
      dead = true;
    };
  }, [code, claimUrl, size]);

  // 优先 data URL，否则 API
  return dataUrl || apiFallback;
}

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
  claimUrl,
  lang,
  terms,
  mode = "print",
  className,
  cardRef,
}: TicketVisualProps) {
  const tpl = getVisualTemplate(templateId);
  const accent = resolveThemeHex(themeColor, tpl.id);
  const isDraw = type === "draw" || type === "ballot";
  const isBallot = type === "ballot";
  const isShare = mode === "share";
  const isBold = tpl.surface === "dark";
  const face = `S$${formatMoney(valueCents)}`;
  const termsText = (terms && terms.trim()) || defaultTerms(type, lang);

  const qr = useQrSrc(code, claimUrl, qrSrc, isShare ? 200 : 168);

  const kindLabel = isBallot
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
                background:
                  "linear-gradient(160deg, #fffef9 0%, #fff7eb 55%, #ffe8c8 100%)",
                border: `2px solid ${accent}`,
                color: "#1a1a1a",
              }
        }
      >
        <div className="p-5 h-full flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <BrandBlock
              businessName={businessName}
              businessLogo={businessLogo}
              isBold={isBold}
              large
            />
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold",
                isBold ? "bg-white/20 text-white" : "text-white"
              )}
              style={!isBold ? { backgroundColor: accent } : undefined}
            >
              {kindLabel}
            </span>
          </div>
          <p
            className={cn(
              "font-bold mt-4 text-xl leading-snug line-clamp-2",
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
          <p
            className={cn(
              "text-sm mt-2 truncate",
              isBold ? "text-white/75" : "text-slate-600"
            )}
          >
            {storeName}
          </p>
          <div className="mt-auto pt-3 flex gap-3 items-end">
            <QrPanel src={qr} px={112} />
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
                {lang === "en" ? "Valid" : "有效至"} {validLabel}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 紧凑礼券条：左信息 / 右金额+QR（QR 用绝对尺寸，绝不被挤没）──
  const ink = isBold ? "#ffffff" : "#0f172a";
  const muted = isBold ? "rgba(255,255,255,0.75)" : "#64748b";
  const bg = isBold
    ? `linear-gradient(100deg, ${accent} 0%, #1c1630 55%, #0f0e17 100%)`
    : isDraw
      ? "linear-gradient(90deg, #faf5ff 0%, #ffffff 55%)"
      : "linear-gradient(90deg, #fff7ed 0%, #ffffff 55%)";

  return (
    <div
      ref={cardRef}
      className={cn(
        "break-inside-avoid w-full overflow-hidden rounded-lg",
        "shadow-sm print:shadow-none print:rounded-md",
        className
      )}
      style={{
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
        border: isBold ? "none" : `1.5px solid ${hexAlpha(accent, 0.35)}`,
        background: bg,
        color: ink,
      }}
    >
      <div className="flex w-full items-stretch">
        {/* 左色条 */}
        <div
          className="w-1.5 shrink-0"
          style={{
            background: isBold
              ? "linear-gradient(180deg,#fbbf24,#f59e0b)"
              : `linear-gradient(180deg,${accent},${shadeHex(accent, -12)})`,
          }}
        />

        {/* 中：文案 */}
        <div className="flex-1 min-w-0 px-2.5 py-2 space-y-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {businessLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={businessLogo}
                alt=""
                className="w-6 h-6 rounded object-contain bg-white shrink-0 border border-black/10"
              />
            ) : (
              <div
                className={cn(
                  "w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold shrink-0",
                  isBold ? "bg-white/15" : "bg-orange-100 text-orange-800"
                )}
              >
                {(businessName || "W").slice(0, 1).toUpperCase()}
              </div>
            )}
            <span className="text-[11px] font-bold truncate">
              {businessName || "Brand"}
            </span>
            <span
              className="shrink-0 rounded px-1 text-[8px] font-extrabold"
              style={{
                background: isBold
                  ? "rgba(255,255,255,0.16)"
                  : hexAlpha(accent, 0.12),
                color: isBold ? "#fff" : accent,
              }}
            >
              {kindLabel}
            </span>
          </div>

          <p className="text-[13px] font-bold leading-tight line-clamp-1">
            {title}
          </p>
          <p
            className="text-[9px] leading-snug line-clamp-1"
            style={{ color: muted }}
          >
            {storeName}
            {storeAddress ? ` · ${storeAddress}` : ""}
          </p>
          <p
            className="text-[8px] leading-snug line-clamp-2"
            style={{ color: muted }}
          >
            {termsText}
          </p>
          <p
            className="text-[9px] font-semibold"
            style={{ color: isBold ? "#fde68a" : "#b45309" }}
          >
            {lang === "en" ? "This store · one-time" : "仅限本店 · 一次用完"}
            <span className="font-medium ml-1.5" style={{ color: muted }}>
              {lang === "en" ? "Until" : "至"} {validLabel}
            </span>
          </p>
        </div>

        {/* 右：金额 + 二维码（固定宽度，独立白底） */}
        <div
          className="shrink-0 flex flex-col items-center justify-center gap-1 border-l border-dashed px-2 py-2"
          style={{
            width: 112,
            minWidth: 112,
            borderColor: isBold ? "rgba(255,255,255,0.25)" : "#e2e8f0",
            background: isBold ? "rgba(0,0,0,0.28)" : "#ffffff",
          }}
        >
          <div
            className="font-black tabular-nums leading-none tracking-tight"
            style={{
              fontSize: 22,
              color: isBold ? "#ffffff" : accent,
            }}
          >
            {face}
          </div>

          {/* 强制 72×72 白底 + 图，避免被 flex 挤没 */}
          <QrPanel src={qr} px={72} />

          <div
            className="font-mono text-[7px] font-bold text-center leading-tight w-full px-0.5"
            style={{
              color: ink,
              wordBreak: "break-all",
              lineHeight: 1.15,
            }}
          >
            {code}
          </div>
          <div className="text-[7px]" style={{ color: muted }}>
            {lang === "en" ? "Scan to bind" : "扫码绑定"}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 固定像素盒：无论外层 flex 如何，QR 区域始终占位 */
function QrPanel({ src, px }: { src: string; px: number }) {
  return (
    <div
      style={{
        width: px,
        height: px,
        minWidth: px,
        minHeight: px,
        maxWidth: px,
        maxHeight: px,
        background: "#ffffff",
        borderRadius: 6,
        padding: 3,
        boxSizing: "border-box",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        border: "1px solid #e2e8f0",
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="QR"
          width={px - 6}
          height={px - 6}
          style={{
            width: px - 6,
            height: px - 6,
            display: "block",
            objectFit: "contain",
            background: "#fff",
          }}
        />
      ) : (
        <span
          style={{
            fontSize: 10,
            color: "#94a3b8",
            fontWeight: 600,
          }}
        >
          …
        </span>
      )}
    </div>
  );
}

function BrandBlock({
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
            "object-contain rounded-md shrink-0 bg-white border border-black/10",
            large ? "w-12 h-12" : "w-8 h-8"
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
            large ? "text-sm" : "text-[12px]",
            isBold ? "text-white" : "text-slate-900"
          )}
        >
          {businessName || "Store"}
        </p>
        <p
          className={cn(
            "tracking-[0.12em] uppercase font-semibold",
            large ? "text-[10px]" : "text-[8px]",
            isBold ? "text-amber-200/85" : "text-amber-800"
          )}
        >
          WeMembers
        </p>
      </div>
    </div>
  );
}

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

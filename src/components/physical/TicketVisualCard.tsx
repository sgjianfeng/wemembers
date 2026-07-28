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
  /** 票面条款（正面小字，约两行） */
  terms?: string | null;
  /** print = 宽幅条形；share = 1:1 分享 */
  mode?: "print" | "share";
  className?: string;
  cardRef?: Ref<HTMLDivElement>;
};

function defaultTerms(
  type: string,
  lang: "zh" | "en"
): string {
  if (type === "ballot") {
    return lang === "en"
      ? "Box ritual only · not spendable. Drop into the draw box after payment. Grand pool contribution is recorded online."
      : "仅投抽奖箱，不抵消费。收款后将本票投入抽奖箱。大奖贡献以线上记录为准。";
  }
  if (type === "draw") {
    return lang === "en"
      ? "Exclusive draw ticket · this store only · one-time. Scan to bind your phone for prizes. Non-transferable after bind."
      : "独享抽奖券 · 仅限本店 · 一次有效。扫码绑定手机参与开奖。绑定后不可转让。";
  }
  return lang === "en"
    ? "Store credit · this store only · one-time use. Scan QR to bind phone / register. Void after use or expiry. Subject to store rules."
    : "本店代金抵用 · 仅限本店 · 一次用完。扫码绑定手机后使用。用完或过期作废。详细规则以门店公示为准。";
}

/**
 * print：宽幅横向代金券（顶栏+正文+底栏条款/QR），拉满宽度，不搞左中右三栏。
 * share：1:1 社媒卡。
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
  const isBold =
    mode === "print"
      ? type !== "voucher" && tpl.surface === "dark"
      : tpl.surface === "dark";
  const face = `S$${formatMoney(valueCents)}`;
  const termsText = (terms && terms.trim()) || defaultTerms(type, lang);

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

  // ── Share 1:1 ────────────────────────────────────────────
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
            🏪 {storeName}
          </p>
          <p
            className={cn(
              "text-[11px] mt-2 leading-snug line-clamp-3",
              isBold ? "text-white/65" : "text-slate-500"
            )}
          >
            {termsText}
          </p>
          <div className="mt-auto pt-3 flex gap-3 items-end">
            <QrImg qrSrc={qrSrc} className="w-28 h-28" bordered />
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

  // ── Print 宽幅条形 ───────────────────────────────────────
  // 结构：顶色条 → 主内容全宽 → 底栏（条款占主要宽度 + QR 小块）
  const ink = isBold ? "#ffffff" : "#111827";
  const muted = isBold ? "rgba(255,255,255,0.78)" : "#4b5563";
  const border = isBold ? "transparent" : isDraw ? "#7c3aed" : accent;
  const bg = isBold
    ? `linear-gradient(105deg, ${accent} 0%, #1a1528 60%, #0f0e17 100%)`
    : isDraw
      ? "linear-gradient(180deg, #faf5ff 0%, #ffffff 40%)"
      : "linear-gradient(180deg, #fff9f2 0%, #ffffff 42%)";

  return (
    <div
      ref={cardRef}
      className={cn(
        "break-inside-avoid w-full overflow-hidden",
        "rounded-xl shadow-sm print:shadow-none print:rounded-lg",
        className
      )}
      style={{
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
        border: `2px solid ${border}`,
        background: bg,
        color: ink,
      }}
    >
      {/* 顶栏色带 — 满宽 */}
      <div
        className="h-1.5 w-full"
        style={{
          background: isBold
            ? "linear-gradient(90deg, #fbbf24, #f59e0b, #fbbf24)"
            : `linear-gradient(90deg, ${accent}, ${shadeHex(accent, 20)}, ${accent})`,
        }}
      />

      {/* 主区：品牌 + 票种 + 面值 同一行拉满 */}
      <div className="px-3.5 pt-2.5 pb-1.5 print:px-4 print:pt-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <BrandBlock
            businessName={businessName}
            businessLogo={businessLogo}
            isBold={isBold}
          />
          <div className="flex-1 min-w-0" />
          <span
            className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-extrabold tracking-wide"
            style={{
              background: isBold ? "rgba(255,255,255,0.18)" : hexAlpha(accent, 0.12),
              color: isBold ? "#fff" : accent,
              border: isBold ? "none" : `1px solid ${hexAlpha(accent, 0.35)}`,
            }}
          >
            {kindLabel}
          </span>
          <p
            className="shrink-0 font-black nums leading-none text-[1.75rem] print:text-[2rem] tracking-tight pl-1"
            style={{ color: isBold ? "#fff" : accent }}
          >
            {face}
          </p>
        </div>

        {/* 标题 — 满宽 */}
        <p
          className="mt-2 text-[15px] print:text-base font-bold leading-snug line-clamp-2"
          style={{ color: ink }}
        >
          {title}
        </p>

        {/* 门店 — 满宽一行 */}
        <p
          className="mt-1 text-[11px] print:text-xs leading-snug line-clamp-1"
          style={{ color: muted }}
          title={
            storeAddress ? `${storeName} · ${storeAddress}` : storeName
          }
        >
          <span className="font-semibold" style={{ color: ink }}>
            {storeName}
          </span>
          {storeAddress ? (
            <span>
              {" · "}
              {storeAddress}
            </span>
          ) : null}
        </p>
      </div>

      {/* 底栏：条款（主宽） + QR（紧凑，不占半屏） */}
      <div
        className="mx-3 mb-3 print:mx-4 print:mb-3.5 rounded-lg overflow-hidden"
        style={{
          border: isBold
            ? "1px solid rgba(255,255,255,0.2)"
            : `1px solid ${hexAlpha(accent, 0.22)}`,
          background: isBold ? "rgba(0,0,0,0.2)" : "#fffefb",
        }}
      >
        <div className="flex items-stretch min-w-0">
          {/* 条款区：吃掉绝大部分宽度 */}
          <div className="flex-1 min-w-0 px-3 py-2 print:px-3.5 print:py-2.5">
            <p
              className="text-[9px] font-bold uppercase tracking-wide mb-0.5"
              style={{ color: isBold ? "rgba(253,230,138,0.9)" : accent }}
            >
              {lang === "en" ? "Terms" : "使用条款"}
            </p>
            <p
              className="text-[10px] print:text-[11px] leading-relaxed"
              style={{
                color: muted,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {termsText}
            </p>
            <p
              className="mt-1.5 text-[10px] font-bold"
              style={{ color: isBold ? "#fcd34d" : "#b91c1c" }}
            >
              {lang === "en"
                ? "This store only · one-time use"
                : "仅限本店 · 一次用完"}
              <span
                className="font-medium ml-2"
                style={{ color: muted }}
              >
                {lang === "en" ? "Valid" : "有效期"} {validLabel}
              </span>
            </p>
          </div>

          {/* QR 区：固定窄宽，不空荡 */}
          <div
            className="shrink-0 flex items-center gap-2 px-2.5 py-2"
            style={{
              borderLeft: isBold
                ? "1px dashed rgba(255,255,255,0.3)"
                : "1px dashed #e5e7eb",
              background: isBold ? "rgba(255,255,255,0.06)" : "#ffffff",
              width: 132,
            }}
          >
            <QrImg qrSrc={qrSrc} className="w-[58px] h-[58px]" bordered={!isBold} />
            <div className="min-w-0 flex-1">
              <p
                className="text-[8px] font-medium uppercase tracking-wide"
                style={{ color: muted }}
              >
                {lang === "en" ? "Code" : "券码"}
              </p>
              <p
                className="font-mono text-[8px] font-bold leading-tight"
                style={{
                  color: ink,
                  wordBreak: "break-all",
                  lineHeight: 1.2,
                }}
              >
                {code}
              </p>
              <p className="text-[8px] mt-0.5" style={{ color: muted }}>
                {lang === "en" ? "Scan to bind" : "扫码绑定"}
              </p>
            </div>
          </div>
        </div>
      </div>
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

function QrImg({
  qrSrc,
  className,
  bordered,
}: {
  qrSrc?: string;
  className?: string;
  bordered?: boolean;
}) {
  if (qrSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={qrSrc}
        alt="QR"
        className={cn(
          "rounded-md bg-white shrink-0 object-contain",
          className,
          bordered && "border border-slate-300"
        )}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-md bg-white shrink-0 flex items-center justify-center text-slate-400 text-[10px]",
        className,
        bordered && "border border-slate-300"
      )}
    >
      QR
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

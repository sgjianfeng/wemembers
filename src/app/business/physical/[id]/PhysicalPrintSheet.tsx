"use client";

import { useCallback, useState } from "react";
import { TicketVisualCard } from "@/components/physical/TicketVisualCard";
import { getVisualTemplate } from "@/lib/visual-templates";

type Ticket = { code: string; status: string; claimUrl: string };

export function PhysicalPrintSheet({
  lang,
  title,
  type,
  valueCents,
  storeName,
  storeAddress,
  businessName,
  businessLogo,
  validUntil,
  tickets,
  visualTemplateId,
  themeColor,
}: {
  lang: "zh" | "en";
  title: string;
  type: string;
  valueCents: number;
  storeName: string;
  storeAddress: string | null;
  businessName: string | null;
  businessLogo?: string | null;
  validUntil: string | null;
  tickets: Ticket[];
  visualTemplateId?: string | null;
  themeColor?: string | null;
}) {
  const validLabel = validUntil
    ? new Date(validUntil).toLocaleDateString(lang === "en" ? "en-SG" : "zh-CN")
    : "—";
  const tpl = getVisualTemplate(visualTemplateId);
  const [shareBusy, setShareBusy] = useState(false);
  const first = tickets[0];

  const downloadSharePng = useCallback(async () => {
    if (!first) return;
    setShareBusy(true);
    try {
      await drawShareCanvas({
        title,
        type,
        valueCents,
        storeName,
        businessName: businessName || "Store",
        businessLogo,
        code: first.code,
        claimUrl: first.claimUrl,
        validLabel,
        themeColor: themeColor || "#1A6EFF",
        bold: tpl.surface === "dark",
        lang,
      });
    } catch (e) {
      console.error(e);
      alert(lang === "en" ? "Export failed" : "导出失败，请重试");
    }
    setShareBusy(false);
  }, [
    businessLogo,
    businessName,
    first,
    lang,
    storeName,
    themeColor,
    title,
    tpl.surface,
    type,
    validLabel,
    valueCents,
  ]);

  return (
    <div className="px-4 mt-4">
      <div className="print:hidden flex flex-wrap gap-2 mb-3 items-center">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-9 items-center rounded-full bg-[#1A6EFF] px-4 text-xs font-semibold text-white"
        >
          {lang === "en" ? "Print / Save PDF" : "打印 / 存为 PDF"}
        </button>
        <button
          type="button"
          disabled={!first || shareBusy}
          onClick={downloadSharePng}
          className="inline-flex h-9 items-center rounded-full bg-slate-900 px-4 text-xs font-semibold text-white disabled:opacity-50"
        >
          {shareBusy
            ? "…"
            : lang === "en"
              ? "Download 1:1 share PNG"
              : "下载 1:1 分享图"}
        </button>
        <p className="text-[11px] text-slate-400">
          {lang === "en" ? tpl.nameEn : tpl.nameZh}
          {" · "}
          {lang === "en"
            ? "WA / IG / Xiaohongshu"
            : "WhatsApp / IG / 小红书"}
        </p>
      </div>

      {/* Share preview (visible) */}
      {first && (
        <div className="print:hidden mb-6">
          <p className="text-xs font-medium text-slate-500 mb-2">
            {lang === "en" ? "Share preview (1:1)" : "分享预览（1:1 · 用第一张码）"}
          </p>
          <div className="max-w-[280px]">
            <TicketVisualCard
              templateId={visualTemplateId}
              themeColor={themeColor}
              type={type}
              title={title}
              valueCents={valueCents}
              storeName={storeName}
              storeAddress={storeAddress}
              businessName={businessName}
              businessLogo={businessLogo}
              validLabel={validLabel}
              code={first.code}
              qrSrc={`/api/physical/qr?code=${encodeURIComponent(first.code)}&size=200`}
              lang={lang}
              mode="share"
            />
          </div>
        </div>
      )}

      <p className="print:hidden text-xs font-medium text-slate-500 mb-2">
        {lang === "en" ? "Print sheet" : "印刷票面"}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 print:grid-cols-2 print:gap-2">
        {tickets.map((t) => (
          <TicketVisualCard
            key={t.code}
            templateId={visualTemplateId}
            themeColor={themeColor}
            type={type}
            title={title}
            valueCents={valueCents}
            storeName={storeName}
            storeAddress={storeAddress}
            businessName={businessName}
            businessLogo={businessLogo}
            validLabel={validLabel}
            code={t.code}
            qrSrc={`/api/physical/qr?code=${encodeURIComponent(t.code)}&size=120`}
            lang={lang}
            mode="print"
          />
        ))}
      </div>
    </div>
  );
}

async function drawShareCanvas(opts: {
  title: string;
  type: string;
  valueCents: number;
  storeName: string;
  businessName: string;
  businessLogo?: string | null;
  code: string;
  claimUrl: string;
  validLabel: string;
  themeColor: string;
  bold: boolean;
  lang: "zh" | "en";
}) {
  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (opts.bold) {
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, opts.themeColor);
    g.addColorStop(1, "#0f0e17");
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = "#ffffff";
  }
  ctx.fillRect(0, 0, size, size);

  const fg = opts.bold ? "#ffffff" : "#0f172a";
  const muted = opts.bold ? "rgba(255,255,255,0.7)" : "#64748b";

  ctx.fillStyle = fg;
  ctx.font = "bold 36px system-ui,sans-serif";
  ctx.fillText(opts.businessName.slice(0, 28), 64, 100);

  ctx.fillStyle = muted;
  ctx.font = "24px system-ui,sans-serif";
  ctx.fillText("WeMembers", 64, 140);

  ctx.fillStyle = fg;
  ctx.font = "bold 52px system-ui,sans-serif";
  wrapText(ctx, opts.title, 64, 240, size - 128, 60);

  if (opts.type === "voucher") {
    ctx.fillStyle = opts.bold ? "#fff" : opts.themeColor;
    ctx.font = "bold 96px system-ui,sans-serif";
    ctx.fillText(`S$${(opts.valueCents / 100).toFixed(0)}`, 64, 420);
  } else {
    ctx.fillStyle = opts.bold ? "#fde68a" : "#7c3aed";
    ctx.font = "bold 40px system-ui,sans-serif";
    ctx.fillText(
      opts.lang === "en" ? "Lucky draw ticket" : "抽奖券",
      64,
      400
    );
  }

  ctx.fillStyle = muted;
  ctx.font = "28px system-ui,sans-serif";
  ctx.fillText(`🏪 ${opts.storeName}`.slice(0, 40), 64, 500);
  ctx.fillStyle = opts.bold ? "#fbbf24" : "#dc2626";
  ctx.font = "bold 26px system-ui,sans-serif";
  ctx.fillText(
    opts.lang === "en"
      ? "This store only · one-time"
      : "仅限本店 · 一次用完",
    64,
    550
  );

  ctx.fillStyle = muted;
  ctx.font = "22px ui-monospace,monospace";
  ctx.fillText(opts.code, 64, 980);
  ctx.fillText(
    `${opts.lang === "en" ? "Valid" : "有效期"} ${opts.validLabel}`,
    64,
    1020
  );

  // QR via image
  try {
    const qrUrl = `/api/physical/qr?code=${encodeURIComponent(opts.code)}&size=320`;
    const img = await loadImage(qrUrl);
    ctx.fillStyle = "#fff";
    ctx.fillRect(size - 64 - 280, size - 64 - 320, 300, 300);
    ctx.drawImage(img, size - 64 - 260, size - 64 - 300, 260, 260);
  } catch {
    /* skip qr */
  }

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${opts.title.slice(0, 30)}-share.png`;
  a.click();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const chars = text.split("");
  let line = "";
  let yy = y;
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = ch;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, yy);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

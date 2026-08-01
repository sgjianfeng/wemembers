/**
 * 活动卡 PNG 导出（与屏幕版式语义对齐：卖点 + Logo + QR）
 * canvas 直接绘制，避免 Tailwind oklch / html-to-image 裁切问题。
 */

import JSZip from "jszip";
import type { CampaignPosterCopy } from "@/lib/campaign-poster-copy";
import {
  isNdpFestivalAccent,
  SG_NDP_RED_DEEP,
} from "@/lib/visual-templates";

/** tent 台卡 · poster 吧台 · sticker 1:1 社交 · a4 墙贴/打印店 */
export type CampaignPosterLayoutId = "tent" | "poster" | "sticker" | "a4";

export type CampaignPosterSurface = "light" | "dark";

export type DrawCampaignPosterPngOpts = {
  layout: CampaignPosterLayoutId;
  campaignName: string;
  businessName: string;
  businessLogo: string | null;
  buyUrl: string;
  qrSrc: string;
  copy: CampaignPosterCopy;
  distLabel: string;
  isDist: boolean;
  /** 主题强调色 #RRGGBB */
  accent: string;
  surface: CampaignPosterSurface;
  lang: "zh" | "en";
};

/**
 * PNG 像素尺寸
 * - a4：约 150dpi（1240×1754），打印店够用、文件不大
 * - sticker：1080 方图社交
 */
export function posterCanvasSize(layout: CampaignPosterLayoutId): {
  w: number;
  h: number;
} {
  if (layout === "sticker") return { w: 1080, h: 1080 };
  if (layout === "a4") return { w: 1240, h: 1754 };
  if (layout === "poster") return { w: 1080, h: 1680 };
  return { w: 1080, h: 1480 };
}

export function posterFilename(
  campaignName: string,
  isDist: boolean,
  layout: CampaignPosterLayoutId,
  distSuffix?: string
): string {
  const fileBase = campaignName
    .replace(/[^\w\u4e00-\u9fff-]+/g, "-")
    .slice(0, 20);
  const who = isDist
    ? `dist${distSuffix ? `-${distSuffix.replace(/[^\w\u4e00-\u9fff-]+/g, "").slice(0, 12)}` : ""}`
    : "store";
  return `${fileBase || "campaign"}-${who}-${layout}.png`;
}

/** dataURL → 纯 base64（给 JSZip） */
export function dataUrlToBase64(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

/**
 * 多张活动卡打成一个 ZIP（浏览器下载）
 */
export async function zipCampaignPosterFiles(
  files: { filename: string; dataUrl: string }[]
): Promise<Blob> {
  const zip = new JSZip();
  for (const f of files) {
    if (!f.dataUrl) continue;
    zip.file(f.filename, dataUrlToBase64(f.dataUrl), { base64: true });
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
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

/** 国庆抽象星月（非国旗复制，仅节日氛围装饰） */
function drawNdpMotif(
  ctx: CanvasRenderingContext2D,
  w: number,
  bandH: number,
  scale: number
) {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#ffffff";
  // 新月（两圆差集感：大白圆 + 略偏移暗圆，这里用描边新月）
  const cx = w * 0.14;
  const cy = bandH * 0.38;
  const r = Math.round(48 * scale);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0.35 * Math.PI, 1.55 * Math.PI, false);
  ctx.arc(cx + r * 0.35, cy - r * 0.08, r * 0.78, 1.45 * Math.PI, 0.4 * Math.PI, true);
  ctx.closePath();
  ctx.fill();
  // 五角小星
  const stars: [number, number, number][] = [
    [w * 0.22, bandH * 0.22, 10 * scale],
    [w * 0.28, bandH * 0.34, 8 * scale],
    [w * 0.24, bandH * 0.48, 7 * scale],
    [w * 0.18, bandH * 0.58, 6 * scale],
    [w * 0.12, bandH * 0.5, 5 * scale],
  ];
  for (const [sx, sy, sr] of stars) {
    drawStar(ctx, sx, sy, sr);
  }
  // 右侧淡星点
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 8; i++) {
    drawStar(ctx, w * (0.72 + (i % 3) * 0.08), bandH * (0.2 + i * 0.08), 4 * scale);
  }
  ctx.restore();
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillTextCenter(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxChars: number
) {
  const t = text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
  ctx.fillText(t, x, y);
}

/** 绘制到 canvas（调用方负责 dispose） */
export async function paintCampaignPosterCanvas(
  opts: DrawCampaignPosterPngOpts
): Promise<HTMLCanvasElement> {
  const { w, h } = posterCanvasSize(opts.layout);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");

  const isDark = opts.surface === "dark";
  const accent = opts.accent || "#1A6EFF";
  const festival = isNdpFestivalAccent(accent);
  // 国庆：深红底 + 白字，更像新加坡国庆物料
  const bg = festival ? "#1A0508" : isDark ? "#1E1B2E" : "#ffffff";
  const fg = isDark || festival ? "#F8FAFC" : "#0f172a";
  const muted = isDark || festival ? "#FCA5A5" : "#64748b";
  const isA4 = opts.layout === "a4";
  const isPosterLike = opts.layout === "poster" || isA4;
  // a4 略放大字号/二维码，贴墙可读
  const scale = isA4 ? 1.15 : 1;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const useGradientHeader =
    isPosterLike || opts.layout === "sticker" || isDark || festival;

  if (useGradientHeader) {
    const bandH = opts.layout === "sticker" ? 300 : isA4 ? 460 : 400;
    const g = ctx.createLinearGradient(0, 0, w, bandH);
    if (festival) {
      g.addColorStop(0, accent);
      g.addColorStop(0.55, SG_NDP_RED_DEEP);
      g.addColorStop(1, "#1A0508");
    } else {
      g.addColorStop(0, accent);
      g.addColorStop(1, isDark ? "#0f172a" : "#1e293b");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, bandH);

    // 国庆装饰：新月 + 五星（简化抽象，印刷安全）
    if (festival) {
      drawNdpMotif(ctx, w, bandH, scale);
    }

    try {
      if (opts.businessLogo) {
        const logo = await loadImage(opts.businessLogo);
        const s = opts.layout === "sticker" ? 80 : Math.round(100 * scale);
        const ly = isA4 ? 56 : 40;
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        roundRect(ctx, (w - s) / 2 - 8, ly - 8, s + 16, s + 16, 20);
        ctx.fill();
        ctx.drawImage(logo, (w - s) / 2, ly, s, s);
      }
    } catch {
      /* logo optional */
    }

    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    const nameY = opts.layout === "sticker" ? 190 : isA4 ? 240 : 200;
    ctx.font = `bold ${Math.round(44 * scale)}px system-ui, -apple-system, sans-serif`;
    fillTextCenter(ctx, opts.campaignName, w / 2, nameY, 22);
    ctx.font = `${Math.round(26 * scale)}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    fillTextCenter(ctx, opts.businessName, w / 2, nameY + Math.round(44 * scale), 36);
    if (opts.isDist) {
      ctx.font = `bold ${Math.round(24 * scale)}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = "#FDE68A";
      fillTextCenter(
        ctx,
        `${opts.lang === "en" ? "Via" : "分发"} · ${opts.distLabel}`,
        w / 2,
        nameY + Math.round(88 * scale),
        40
      );
    }
  } else {
    // light tent
    ctx.textAlign = "center";
    ctx.fillStyle = festival ? accent : "#b45309";
    ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
    ctx.fillText(
      festival
        ? opts.lang === "en"
          ? "WEMEMBERS · NATIONAL DAY"
          : "WEMEMBERS · 国庆"
        : opts.lang === "en"
          ? "WEMEMBERS · ACTIVITY"
          : "WEMEMBERS · 活动",
      w / 2,
      64
    );

    try {
      if (opts.businessLogo) {
        const logo = await loadImage(opts.businessLogo);
        const s = 88;
        ctx.drawImage(logo, (w - s) / 2, 88, s, s);
      }
    } catch {
      /* optional */
    }

    ctx.fillStyle = fg;
    ctx.font = "bold 46px system-ui, -apple-system, sans-serif";
    fillTextCenter(ctx, opts.campaignName, w / 2, 230, 24);
    ctx.fillStyle = muted;
    ctx.font = "26px system-ui, -apple-system, sans-serif";
    fillTextCenter(ctx, opts.businessName, w / 2, 280, 36);
    if (opts.isDist) {
      ctx.fillStyle = "#b45309";
      ctx.font = "bold 26px system-ui, -apple-system, sans-serif";
      fillTextCenter(
        ctx,
        `${opts.lang === "en" ? "Via" : "分发"} · ${opts.distLabel}`,
        w / 2,
        330,
        36
      );
    }
  }

  const bodyFg = isPosterLike && !festival ? "#0f172a" : fg;
  const bodyMuted =
    isPosterLike && !festival ? "#64748b" : festival ? "#FECACA" : muted;
  const benefitColor =
    opts.layout === "sticker" && useGradientHeader
      ? "#ffffff"
      : festival
        ? "#FFE4E6"
        : isDark && opts.layout === "tent"
          ? "#FDE68A"
          : accent;

  const qrSize =
    opts.layout === "sticker" ? 400 : isA4 ? 620 : 500;
  const qrY =
    opts.layout === "sticker"
      ? 380
      : isA4
        ? 560
        : opts.layout === "poster"
          ? 520
          : useGradientHeader
            ? 420
            : 420;

  ctx.textAlign = "center";
  ctx.fillStyle = benefitColor;
  ctx.font = `bold ${Math.round(38 * scale)}px system-ui, -apple-system, sans-serif`;
  fillTextCenter(ctx, opts.copy.benefitLine, w / 2, qrY - Math.round(36 * scale), 34);

  try {
    const qr = await loadImage(opts.qrSrc);
    const qx = (w - qrSize) / 2;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, qx - 14, qrY - 14, qrSize + 28, qrSize + 28, 24);
    ctx.fill();
    ctx.drawImage(qr, qx, qrY, qrSize, qrSize);
  } catch {
    ctx.fillStyle = bodyMuted;
    ctx.font = "28px system-ui, sans-serif";
    ctx.fillText("QR", w / 2, qrY + qrSize / 2);
  }

  const ty = qrY + qrSize + Math.round(56 * scale);
  ctx.fillStyle = opts.layout === "sticker" ? (isDark ? fg : "#0f172a") : bodyFg;
  ctx.font = `bold ${Math.round(36 * scale)}px system-ui, -apple-system, sans-serif`;
  fillTextCenter(ctx, opts.copy.headline, w / 2, ty, 30);
  ctx.fillStyle =
    opts.layout === "sticker" ? (isDark ? muted : "#64748b") : bodyMuted;
  ctx.font = `${Math.round(24 * scale)}px system-ui, -apple-system, sans-serif`;
  fillTextCenter(ctx, opts.copy.sub, w / 2, ty + Math.round(44 * scale), 40);
  ctx.font = `${Math.round(22 * scale)}px system-ui, -apple-system, sans-serif`;
  fillTextCenter(ctx, opts.copy.untilLine, w / 2, ty + Math.round(88 * scale), 36);

  if (opts.layout !== "sticker") {
    ctx.fillStyle = bodyMuted;
    ctx.font = "16px ui-monospace, SFMono-Regular, monospace";
    const url =
      opts.buyUrl.length > 54
        ? `${opts.buyUrl.slice(0, 52)}…`
        : opts.buyUrl;
    fillTextCenter(ctx, url, w / 2, h - (isA4 ? 56 : 40), 60);
  }

  ctx.fillStyle = bodyMuted;
  ctx.font = `${Math.round(18 * scale)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  if (isPosterLike) {
    fillTextCenter(ctx, "WeMembers", w / 2, h - (isA4 ? 96 : 72), 20);
  }

  return canvas;
}

function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export async function drawCampaignPosterPng(
  opts: DrawCampaignPosterPngOpts,
  filenameOverride?: string
): Promise<string> {
  const canvas = await paintCampaignPosterCanvas(opts);
  const filename =
    filenameOverride ||
    posterFilename(opts.campaignName, opts.isDist, opts.layout);
  const dataUrl = canvas.toDataURL("image/png");
  triggerDownload(dataUrl, filename);
  canvas.width = 1;
  canvas.height = 1;
  return filename;
}

export async function renderCampaignPosterDataUrl(
  opts: DrawCampaignPosterPngOpts,
  filenameOverride?: string
): Promise<{ dataUrl: string; filename: string }> {
  const canvas = await paintCampaignPosterCanvas(opts);
  const filename =
    filenameOverride ||
    posterFilename(opts.campaignName, opts.isDist, opts.layout);
  const dataUrl = canvas.toDataURL("image/png");
  canvas.width = 1;
  canvas.height = 1;
  return { dataUrl, filename };
}

/**
 * 活动卡 PNG 导出（与屏幕版式语义对齐：卖点 + Logo + QR）
 * canvas 直接绘制，避免 Tailwind oklch / html-to-image 裁切问题。
 */

import JSZip from "jszip";
import type { CampaignPosterCopy } from "@/lib/campaign-poster-copy";
import { isNdpFestivalAccent } from "@/lib/visual-templates";

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

/**
 * 新加坡国旗结构背景（上红下白 · 新月五星在左上）
 * 比例不拉伸变形；竖版台卡时红/白各约半幅，星月按标准相对位置绘制。
 * 国庆期（约 7/1–9/30）商用国旗意象在规范上允许，须庄重：不倒置、不扭曲、不遮挡星月核心。
 * 参考：National Symbols Regulations / NHB National Flag guidance
 */
function drawSingaporeFlagBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  redHex: string
) {
  const redH = Math.round(h * 0.48);
  // 上红
  ctx.fillStyle = redHex;
  ctx.fillRect(0, 0, w, redH);
  // 下白
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, redH, w, h - redH);

  // 星月区域：以红区左半为参考（接近国旗比例）
  const fieldW = w;
  const fieldH = redH;
  const unit = Math.min(fieldW, fieldH);
  // 新月中心
  const moonCx = fieldW * 0.22;
  const moonCy = fieldH * 0.5;
  const moonR = unit * 0.16;
  ctx.fillStyle = "#FFFFFF";
  // 外圆
  ctx.beginPath();
  ctx.arc(moonCx, moonCy, moonR, 0, Math.PI * 2);
  ctx.fill();
  // 内圆挖空（红底）形成新月
  ctx.fillStyle = redHex;
  ctx.beginPath();
  ctx.arc(moonCx + moonR * 0.38, moonCy - moonR * 0.06, moonR * 0.82, 0, Math.PI * 2);
  ctx.fill();

  // 五星：新月右侧正五边形布局
  ctx.fillStyle = "#FFFFFF";
  const starCx = fieldW * 0.42;
  const starCy = fieldH * 0.5;
  const ring = unit * 0.1;
  const starR = unit * 0.038;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const sx = starCx + Math.cos(a) * ring;
    const sy = starCy + Math.sin(a) * ring;
    drawStar(ctx, sx, sy, starR);
  }
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
  const isA4 = opts.layout === "a4";
  const isPosterLike = opts.layout === "poster" || isA4;
  // a4 略放大字号/二维码，贴墙可读
  const scale = isA4 ? 1.15 : 1;
  const redHex = festival ? accent : "#CE1126";

  if (festival) {
    // 国旗结构背景：上红下白 + 新月五星（不扭曲比例）
    drawSingaporeFlagBackdrop(ctx, w, h, redHex);
  } else {
    const bg = isDark ? "#1E1B2E" : "#ffffff";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }

  const fg = festival || isDark ? "#F8FAFC" : "#0f172a";
  const muted = festival ? "#475569" : isDark ? "#94A3B8" : "#64748b";
  const redH = Math.round(h * 0.48);

  const useGradientHeader =
    !festival && (isPosterLike || opts.layout === "sticker" || isDark);

  if (useGradientHeader) {
    const bandH = opts.layout === "sticker" ? 300 : isA4 ? 460 : 400;
    const g = ctx.createLinearGradient(0, 0, w, bandH);
    g.addColorStop(0, accent);
    g.addColorStop(1, isDark ? "#0f172a" : "#1e293b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, bandH);

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
  } else if (festival) {
    // 红区：店标 + 活动名 + SG61 利益点（避开左侧星月）
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = `bold ${Math.round(18 * scale)}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(
      opts.lang === "en" ? "SINGAPORE · NATIONAL DAY" : "新加坡 · 国庆满赠",
      w / 2,
      Math.round(36 * scale)
    );
    try {
      if (opts.businessLogo) {
        const logo = await loadImage(opts.businessLogo);
        const s = Math.round(72 * scale);
        ctx.fillStyle = "rgba(255,255,255,0.98)";
        roundRect(ctx, (w - s) / 2 - 6, Math.round(48 * scale), s + 12, s + 12, 16);
        ctx.fill();
        ctx.drawImage(logo, (w - s) / 2, Math.round(54 * scale), s, s);
      }
    } catch {
      /* optional */
    }
    const titleY = Math.round(redH * 0.52);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(40 * scale)}px system-ui, -apple-system, sans-serif`;
    fillTextCenter(ctx, opts.campaignName, w / 2, titleY, 22);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `${Math.round(22 * scale)}px system-ui, -apple-system, sans-serif`;
    fillTextCenter(
      ctx,
      opts.businessName,
      w / 2,
      titleY + Math.round(40 * scale),
      36
    );
    // SG61 卖点胶囊
    const pill = opts.copy.benefitLine;
    ctx.font = `bold ${Math.round(28 * scale)}px system-ui, -apple-system, sans-serif`;
    const pillW = Math.min(w * 0.86, ctx.measureText(pill).width + 48);
    const pillX = (w - pillW) / 2;
    const pillY = redH - Math.round(70 * scale);
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    roundRect(ctx, pillX, pillY, pillW, Math.round(48 * scale), 24);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 2;
    roundRect(ctx, pillX, pillY, pillW, Math.round(48 * scale), 24);
    ctx.stroke();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(pill, w / 2, pillY + Math.round(32 * scale));
    if (opts.isDist) {
      ctx.fillStyle = "#FDE68A";
      ctx.font = `bold ${Math.round(20 * scale)}px system-ui, sans-serif`;
      fillTextCenter(
        ctx,
        `${opts.lang === "en" ? "Via" : "分发"} · ${opts.distLabel}`,
        w / 2,
        redH - Math.round(18 * scale),
        40
      );
    }
  } else {
    // light tent
    ctx.textAlign = "center";
    ctx.fillStyle = "#b45309";
    ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
    ctx.fillText(
      opts.lang === "en" ? "WEMEMBERS · ACTIVITY" : "WEMEMBERS · 活动",
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

  // 国庆：二维码放在白区；其它布局保持原逻辑
  const qrSize = festival
    ? isA4
      ? 520
      : opts.layout === "sticker"
        ? 360
        : 440
    : opts.layout === "sticker"
      ? 400
      : isA4
        ? 620
        : 500;
  const qrY = festival
    ? redH + Math.round(36 * scale)
    : opts.layout === "sticker"
      ? 380
      : isA4
        ? 560
        : opts.layout === "poster"
          ? 520
          : 420;

  if (!festival) {
    const benefitColor =
      opts.layout === "sticker" && useGradientHeader
        ? "#ffffff"
        : isDark && opts.layout === "tent"
          ? "#FDE68A"
          : accent;
    ctx.textAlign = "center";
    ctx.fillStyle = benefitColor;
    ctx.font = `bold ${Math.round(38 * scale)}px system-ui, -apple-system, sans-serif`;
    fillTextCenter(ctx, opts.copy.benefitLine, w / 2, qrY - Math.round(36 * scale), 34);
  }

  try {
    const qr = await loadImage(opts.qrSrc);
    const qx = (w - qrSize) / 2;
    // 白区上的白底圆角卡，阴影感
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, qx - 16, qrY - 16, qrSize + 32, qrSize + 32, 28);
    ctx.fill();
    if (festival) {
      ctx.strokeStyle = "rgba(206,17,38,0.2)";
      ctx.lineWidth = 3;
      roundRect(ctx, qx - 16, qrY - 16, qrSize + 32, qrSize + 32, 28);
      ctx.stroke();
    }
    ctx.drawImage(qr, qx, qrY, qrSize, qrSize);
  } catch {
    ctx.fillStyle = muted;
    ctx.font = "28px system-ui, sans-serif";
    ctx.fillText("QR", w / 2, qrY + qrSize / 2);
  }

  const ty = qrY + qrSize + Math.round(48 * scale);
  const bodyFg = festival ? "#0f172a" : isPosterLike ? "#0f172a" : fg;
  const bodyMuted = festival ? "#64748b" : isPosterLike ? "#64748b" : muted;
  ctx.textAlign = "center";
  ctx.fillStyle = bodyFg;
  ctx.font = `bold ${Math.round(34 * scale)}px system-ui, -apple-system, sans-serif`;
  fillTextCenter(ctx, opts.copy.headline, w / 2, ty, 28);
  ctx.fillStyle = bodyMuted;
  ctx.font = `${Math.round(22 * scale)}px system-ui, -apple-system, sans-serif`;
  fillTextCenter(ctx, opts.copy.sub, w / 2, ty + Math.round(40 * scale), 42);
  ctx.font = `${Math.round(20 * scale)}px system-ui, -apple-system, sans-serif`;
  fillTextCenter(ctx, opts.copy.untilLine, w / 2, ty + Math.round(78 * scale), 36);

  if (opts.layout !== "sticker") {
    ctx.fillStyle = bodyMuted;
    ctx.font = "15px ui-monospace, SFMono-Regular, monospace";
    const url =
      opts.buyUrl.length > 54
        ? `${opts.buyUrl.slice(0, 52)}…`
        : opts.buyUrl;
    fillTextCenter(ctx, url, w / 2, h - (isA4 ? 48 : 36), 60);
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

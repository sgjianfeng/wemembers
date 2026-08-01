/**
 * 活动卡 PNG 导出（与屏幕版式语义对齐：卖点 + Logo + QR）
 * canvas 直接绘制，避免 Tailwind oklch / html-to-image 裁切问题。
 */

import JSZip from "jszip";
import type { CampaignPosterCopy } from "@/lib/campaign-poster-copy";
import { isNdpFestivalAccent } from "@/lib/visual-templates";

/**
 * tent 台卡 · poster 吧台 · sticker 1:1 社交 · a4 墙贴 ·
 * vhd 竖版全高清招贴（1080×1920，屏显/电梯/竖屏广告）
 */
export type CampaignPosterLayoutId =
  | "tent"
  | "poster"
  | "sticker"
  | "a4"
  | "vhd";

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
 * - vhd：1080×1920 竖版全高清招贴（电视竖屏 / 电梯屏 / 数字标牌）
 */
export function posterCanvasSize(layout: CampaignPosterLayoutId): {
  w: number;
  h: number;
} {
  if (layout === "sticker") return { w: 1080, h: 1080 };
  if (layout === "a4") return { w: 1240, h: 1754 };
  if (layout === "vhd") return { w: 1080, h: 1920 };
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
 * 国庆广告背景：上红（内容）下白（QR）· 右上角小星月徽章
 * 对齐顾客落地页 hero（非整幅国旗半白，避免大块假空白）。
 * 星月庄重：不倒置、不扭曲。
 */
function drawNdpLandingStyleBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  redHex: string,
  redH: number
) {
  ctx.fillStyle = redHex;
  ctx.fillRect(0, 0, w, redH);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, redH, w, h - redH);
  // 右上角星月徽章（约 11% 宽，不挡品牌）
  drawCrescentStarsBadge(ctx, w - w * 0.14, h * 0.06, Math.min(w, redH) * 0.11, redHex);
}

/** 小尺寸新月 + 五星（右上角装饰） */
function drawCrescentStarsBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  unit: number,
  redHex: string
) {
  const moonR = unit * 0.95;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.arc(cx - unit * 0.35, cy + unit * 0.15, moonR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = redHex;
  ctx.beginPath();
  ctx.arc(
    cx - unit * 0.35 + moonR * 0.4,
    cy + unit * 0.15 - moonR * 0.06,
    moonR * 0.82,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  const starCx = cx + unit * 0.45;
  const starCy = cy + unit * 0.1;
  const ring = unit * 0.55;
  const starR = unit * 0.2;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    drawStar(
      ctx,
      starCx + Math.cos(a) * ring,
      starCy + Math.sin(a) * ring,
      starR
    );
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

/** 按像素宽度裁切（中英文混排比按字数更准） */
function fitTextToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (!text) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t.length < text.length ? `${t}…` : t;
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
  const isVhd = opts.layout === "vhd";
  const isPosterLike = opts.layout === "poster" || isA4 || isVhd;
  // a4/vhd 略放大字号/二维码，贴墙/屏显可读
  const scale = isVhd ? 1.22 : isA4 ? 1.15 : 1;
  const redHex = festival ? accent : "#CE1126";
  // 红区略高，给品牌 + 满赠卡；白区放 QR（对齐落地页 hero 比重）
  // 竖版招贴红区略矮，留给下方钩子+大 QR
  const redH = Math.round(
    h *
      (opts.layout === "sticker"
        ? 0.55
        : isVhd
          ? 0.46
          : isA4
            ? 0.5
            : 0.52)
  );

  if (festival) {
    drawNdpLandingStyleBackdrop(ctx, w, h, redHex, redH);
  } else {
    const bg = isDark ? "#1E1B2E" : "#ffffff";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }

  const fg = festival || isDark ? "#F8FAFC" : "#0f172a";
  const muted = festival ? "#475569" : isDark ? "#94A3B8" : "#64748b";

  // 从 benefit 解析满赠数字（落地页同款大字）
  const spendMatch =
    opts.copy.benefitLine.match(/S\$\s*(\d+)\s*→\s*S\$\s*(\d+)/i) ||
    opts.copy.benefitLine.match(/满\s*S\$?\s*(\d+)\s*送\s*S\$?\s*(\d+)/) ||
    opts.campaignName.match(/满\s*(\d+)\s*送\s*(\d+)/);
  const minSpend = spendMatch ? spendMatch[1] : "120";
  const giftAmt = spendMatch ? spendMatch[2] : "61";

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
    // 对齐落地页：左品牌、右星月；下方满赠数字卡（S$120 → S$61）
    const pad = Math.round(40 * scale);
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = `bold ${Math.round(16 * scale)}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(
      opts.lang === "en" ? "Table scan · spend & get" : "桌边扫码 · 结账满额即送",
      pad,
      Math.round(36 * scale)
    );

    const logoS = Math.round(88 * scale);
    const rowY = Math.round(58 * scale);
    try {
      if (opts.businessLogo) {
        const logo = await loadImage(opts.businessLogo);
        ctx.fillStyle = "#ffffff";
        roundRect(ctx, pad, rowY, logoS, logoS, 18);
        ctx.fill();
        ctx.drawImage(logo, pad + 4, rowY + 4, logoS - 8, logoS - 8);
      }
    } catch {
      /* optional */
    }
    const textX = pad + logoS + Math.round(20 * scale);
    // 预留给右上角星月，按像素裁切避免「Meow BBQ …」误伤中文品牌
    const textMaxW = Math.max(
      120,
      w - textX - pad - Math.round(isVhd ? 100 : 90) * scale
    );
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `bold ${Math.round(14 * scale)}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(
      `SG${giftAmt} · ${opts.lang === "en" ? "National Day" : "国庆满赠"}`,
      textX,
      rowY + Math.round(22 * scale)
    );
    ctx.fillStyle = "#ffffff";
    // 品牌略小、按宽度适配，完整显示「Meow BBQ 猫抓烤肉」一类中英混排
    const brandFs = Math.round((isVhd ? 28 : 30) * scale);
    ctx.font = `bold ${brandFs}px system-ui, -apple-system, sans-serif`;
    const brand =
      opts.businessName?.trim() ||
      (opts.lang === "en" ? "Store" : "门店");
    const brandLine = fitTextToWidth(ctx, brand, textMaxW);
    ctx.fillText(brandLine, textX, rowY + Math.round(56 * scale));
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = `${Math.round(16 * scale)}px system-ui, -apple-system, sans-serif`;
    const campShort = fitTextToWidth(ctx, opts.campaignName, textMaxW);
    ctx.fillText(campShort, textX, rowY + Math.round(84 * scale));

    // 满赠数字卡
    const cardX = pad;
    const cardW = w - pad * 2;
    const cardH = Math.round(148 * scale);
    const cardY = redH - cardH - Math.round(28 * scale);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    roundRect(ctx, cardX, cardY, cardW, cardH, 24);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    roundRect(ctx, cardX, cardY, cardW, cardH, 24);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `${Math.round(16 * scale)}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(
      opts.lang === "en"
        ? `National Day · Spend ${minSpend} Get ${giftAmt}`
        : `国庆满赠 · 满${minSpend}送${giftAmt}`,
      cardX + Math.round(28 * scale),
      cardY + Math.round(36 * scale)
    );
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(48 * scale)}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(
      `S$${minSpend} → S$${giftAmt}`,
      cardX + Math.round(28 * scale),
      cardY + Math.round(92 * scale)
    );
    ctx.font = `bold ${Math.round(22 * scale)}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    const bigW = ctx.measureText(`S$${minSpend} → S$${giftAmt}`).width;
    // 若 measure 用了上一字号，重新量
    ctx.font = `bold ${Math.round(48 * scale)}px system-ui, -apple-system, sans-serif`;
    const bigW2 = ctx.measureText(`S$${minSpend} → S$${giftAmt}`).width;
    ctx.font = `bold ${Math.round(22 * scale)}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(
      `SG${giftAmt}`,
      cardX + Math.round(28 * scale) + bigW2 + Math.round(16 * scale),
      cardY + Math.round(88 * scale)
    );
    void bigW;
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = `${Math.round(15 * scale)}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(
      opts.copy.sub,
      cardX + Math.round(28 * scale),
      cardY + Math.round(124 * scale)
    );
    if (opts.isDist) {
      ctx.fillStyle = "#FDE68A";
      ctx.font = `bold ${Math.round(16 * scale)}px system-ui, sans-serif`;
      ctx.textAlign = "right";
      ctx.fillText(
        `${opts.lang === "en" ? "Via" : "分发"} · ${opts.distLabel}`,
        w - pad,
        Math.round(36 * scale)
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

  // 国庆白区：钩子语 + 卖点条 + 适中 QR（A4 不再占半屏）
  // 其它布局保持原逻辑
  const qrSize = festival
    ? isVhd
      ? 400
      : isA4
        ? 300
        : opts.layout === "poster"
          ? 320
          : opts.layout === "sticker"
            ? 280
            : 340
    : opts.layout === "sticker"
      ? 400
      : isVhd
        ? 520
        : isA4
          ? 480
          : 500;

  if (!festival) {
    const qrY =
      opts.layout === "sticker"
        ? 380
        : isVhd
          ? 640
          : isA4
            ? 560
            : opts.layout === "poster"
              ? 520
              : 420;
    const benefitColor =
      opts.layout === "sticker" && useGradientHeader
        ? "#ffffff"
        : isDark && opts.layout === "tent"
          ? "#FDE68A"
          : accent;
    ctx.textAlign = "center";
    ctx.fillStyle = benefitColor;
    ctx.font = `bold ${Math.round(38 * scale)}px system-ui, -apple-system, sans-serif`;
    fillTextCenter(
      ctx,
      opts.copy.benefitLine,
      w / 2,
      qrY - Math.round(36 * scale),
      34
    );

    try {
      const qr = await loadImage(opts.qrSrc);
      const qx = (w - qrSize) / 2;
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, qx - 16, qrY - 16, qrSize + 32, qrSize + 32, 28);
      ctx.fill();
      ctx.drawImage(qr, qx, qrY, qrSize, qrSize);
    } catch {
      ctx.fillStyle = muted;
      ctx.font = "28px system-ui, sans-serif";
      ctx.fillText("QR", w / 2, qrY + qrSize / 2);
    }

    const ty = qrY + qrSize + Math.round(48 * scale);
    const bodyFg = isPosterLike ? "#0f172a" : fg;
    const bodyMuted = isPosterLike ? "#64748b" : muted;
    ctx.textAlign = "center";
    ctx.fillStyle = bodyFg;
    ctx.font = `bold ${Math.round(34 * scale)}px system-ui, -apple-system, sans-serif`;
    fillTextCenter(ctx, opts.copy.headline, w / 2, ty, 28);
    ctx.fillStyle = bodyMuted;
    ctx.font = `${Math.round(22 * scale)}px system-ui, -apple-system, sans-serif`;
    fillTextCenter(ctx, opts.copy.sub, w / 2, ty + Math.round(40 * scale), 42);
    let untilY = ty + Math.round(78 * scale);
    if (opts.copy.termsLine) {
      ctx.fillStyle = isPosterLike ? "#94a3b8" : muted;
      ctx.font = `${Math.round(16 * scale)}px system-ui, -apple-system, sans-serif`;
      fillTextCenter(
        ctx,
        opts.copy.termsLine,
        w / 2,
        ty + Math.round(68 * scale),
        52
      );
      untilY = ty + Math.round(98 * scale);
    }
    ctx.fillStyle = bodyMuted;
    ctx.font = `${Math.round(20 * scale)}px system-ui, -apple-system, sans-serif`;
    fillTextCenter(ctx, opts.copy.untilLine, w / 2, untilY, 36);

    if (opts.layout !== "sticker") {
      ctx.fillStyle = bodyMuted;
      ctx.font = "15px ui-monospace, SFMono-Regular, monospace";
      const url =
        opts.buyUrl.length > 54
          ? `${opts.buyUrl.slice(0, 52)}…`
          : opts.buyUrl;
      fillTextCenter(ctx, url, w / 2, h - (isVhd ? 64 : isA4 ? 48 : 36), 60);
    }

    ctx.fillStyle = bodyMuted;
    ctx.font = `${Math.round(18 * scale)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    if (isPosterLike) {
      fillTextCenter(
        ctx,
        "WeMembers",
        w / 2,
        h - (isVhd ? 120 : isA4 ? 96 : 72),
        20
      );
    }

    return canvas;
  }

  // ── 国庆白区（钩子 + 卖点 pill + 中等 QR）──
  const whiteTop = redH;
  let y = whiteTop + Math.round(isVhd ? 48 : isA4 ? 40 : 32);

  ctx.textAlign = "center";
  // 钩子大标题
  const hook =
    opts.copy.hookLine ||
    (opts.lang === "en"
      ? `Celebrate SG${giftAmt} · Spend & get`
      : `庆 SG${giftAmt} · 本单满就送`);
  ctx.fillStyle = "#0f172a";
  const hookFs = isVhd ? 38 : isA4 ? 36 : 30;
  ctx.font = `bold ${Math.round(hookFs * scale)}px system-ui, -apple-system, sans-serif`;
  fillTextCenter(
    ctx,
    hook,
    w / 2,
    y + Math.round(28 * scale),
    isVhd ? 40 : isA4 ? 36 : 28
  );
  y += Math.round((isVhd ? 64 : isA4 ? 56 : 48) * scale);

  // 行动 CTA
  ctx.fillStyle = redHex;
  ctx.font = `bold ${Math.round((isVhd ? 28 : isA4 ? 26 : 22) * scale)}px system-ui, -apple-system, sans-serif`;
  fillTextCenter(
    ctx,
    opts.copy.headline,
    w / 2,
    y + Math.round(18 * scale),
    32
  );
  y += Math.round((isVhd ? 44 : isA4 ? 40 : 34) * scale);

  // 卖点 pills
  const pills =
    opts.copy.hookPills && opts.copy.hookPills.length > 0
      ? opts.copy.hookPills.slice(0, 3)
      : opts.lang === "en"
        ? ["Scan at table", `S$${giftAmt} next visit`, "Easy redeem"]
        : ["桌边扫一扫", `下次再用 S$${giftAmt}`, "到店核销即可"];
  const pillFont = Math.round((isVhd ? 20 : isA4 ? 18 : 16) * scale);
  ctx.font = `bold ${pillFont}px system-ui, -apple-system, sans-serif`;
  const pillGap = Math.round(12 * scale);
  const pillPadX = Math.round(18 * scale);
  const pillH = Math.round((isVhd ? 44 : isA4 ? 40 : 34) * scale);
  const pillWidths = pills.map(
    (p) => ctx.measureText(p).width + pillPadX * 2
  );
  const totalPillW =
    pillWidths.reduce((a, b) => a + b, 0) + pillGap * (pills.length - 1);
  let px = (w - totalPillW) / 2;
  const pillY = y;
  for (let i = 0; i < pills.length; i++) {
    const pw = pillWidths[i];
    ctx.fillStyle = "rgba(206,17,38,0.08)";
    roundRect(ctx, px, pillY, pw, pillH, pillH / 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(206,17,38,0.28)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, px, pillY, pw, pillH, pillH / 2);
    ctx.stroke();
    ctx.fillStyle = redHex;
    ctx.textAlign = "center";
    ctx.fillText(pills[i], px + pw / 2, pillY + pillH * 0.68);
    px += pw + pillGap;
  }
  y += pillH + Math.round((isVhd ? 40 : isA4 ? 36 : 28) * scale);

  // QR（居中，适中尺寸；竖版招贴更大）
  const qrY = y;
  try {
    const qr = await loadImage(opts.qrSrc);
    const qx = (w - qrSize) / 2;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, qx - 14, qrY - 14, qrSize + 28, qrSize + 28, 22);
    ctx.fill();
    ctx.strokeStyle = "rgba(206,17,38,0.18)";
    ctx.lineWidth = 2;
    roundRect(ctx, qx - 14, qrY - 14, qrSize + 28, qrSize + 28, 22);
    ctx.stroke();
    // 轻阴影感：外框
    ctx.strokeStyle = "rgba(15,23,42,0.06)";
    ctx.lineWidth = 6;
    roundRect(ctx, qx - 18, qrY - 18, qrSize + 36, qrSize + 36, 26);
    ctx.stroke();
    ctx.drawImage(qr, qx, qrY, qrSize, qrSize);
  } catch {
    ctx.fillStyle = muted;
    ctx.font = "28px system-ui, sans-serif";
    ctx.fillText("QR", w / 2, qrY + qrSize / 2);
  }
  y = qrY + qrSize + Math.round((isVhd ? 40 : isA4 ? 36 : 28) * scale);

  // 底部说明 + 条款 + 有效期
  ctx.textAlign = "center";
  ctx.fillStyle = "#64748b";
  ctx.font = `${Math.round((isVhd ? 20 : isA4 ? 18 : 16) * scale)}px system-ui, -apple-system, sans-serif`;
  fillTextCenter(ctx, opts.copy.sub, w / 2, y, 42);
  y += Math.round((isVhd ? 32 : isA4 ? 28 : 24) * scale);
  if (opts.copy.termsLine) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = `${Math.round((isVhd ? 17 : isA4 ? 15 : 13) * scale)}px system-ui, -apple-system, sans-serif`;
    fillTextCenter(ctx, opts.copy.termsLine, w / 2, y, 52);
    y += Math.round((isVhd ? 30 : isA4 ? 26 : 22) * scale);
  }
  ctx.fillStyle = "#64748b";
  ctx.font = `${Math.round((isVhd ? 19 : isA4 ? 17 : 15) * scale)}px system-ui, -apple-system, sans-serif`;
  fillTextCenter(ctx, opts.copy.untilLine, w / 2, y, 40);

  if (opts.layout !== "sticker") {
    ctx.fillStyle = "#94a3b8";
    ctx.font = `${isVhd ? 16 : 14}px ui-monospace, SFMono-Regular, monospace`;
    const url =
      opts.buyUrl.length > 54
        ? `${opts.buyUrl.slice(0, 52)}…`
        : opts.buyUrl;
    fillTextCenter(ctx, url, w / 2, h - (isVhd ? 72 : isA4 ? 56 : 40), 60);
  }

  ctx.fillStyle = "#94a3b8";
  ctx.font = `${Math.round(16 * scale)}px system-ui, sans-serif`;
  if (isPosterLike || opts.layout === "tent") {
    fillTextCenter(
      ctx,
      "WeMembers",
      w / 2,
      h - (isVhd ? 120 : isA4 ? 100 : 72),
      20
    );
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

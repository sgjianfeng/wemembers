/**
 * 实体券印刷 PNG 导出
 * - 代金券等「条形票」用物理尺寸（mm）+ DPI，便于裁切/打印店处理
 * - 不依赖 html2canvas：canvas 直接绘制，跨端稳定
 */

export type PrintSizePresetId =
  | "strip_180x48"
  | "strip_180x60"
  | "strip_150x44"
  | "strip_210x52"
  | "strip_100x40"
  | "custom";

export type PrintSizePreset = {
  id: PrintSizePresetId;
  /** 宽 mm */
  widthMm: number;
  /** 高 mm */
  heightMm: number;
  labelZh: string;
  labelEn: string;
  hintZh: string;
  hintEn: string;
};

/** 常用印刷尺寸（横条代金券） */
export const PRINT_SIZE_PRESETS: PrintSizePreset[] = [
  {
    id: "strip_180x48",
    widthMm: 180,
    heightMm: 48,
    labelZh: "180×48 mm",
    labelEn: "180×48 mm",
    hintZh: "紧凑礼券条 · 推荐拼版",
    hintEn: "Compact strip · best for PDF",
  },
  {
    id: "strip_180x60",
    widthMm: 180,
    heightMm: 60,
    labelZh: "180×60 mm",
    labelEn: "180×60 mm",
    hintZh: "稍高 · 条款更松",
    hintEn: "Taller · more room for terms",
  },
  {
    id: "strip_150x44",
    widthMm: 150,
    heightMm: 44,
    labelZh: "150×44 mm",
    labelEn: "150×44 mm",
    hintZh: "更小 · 省纸",
    hintEn: "Smaller · denser",
  },
  {
    id: "strip_210x52",
    widthMm: 210,
    heightMm: 52,
    labelZh: "210×52 mm",
    labelEn: "210×52 mm",
    hintZh: "A4 宽 · 紧凑高",
    hintEn: "A4 width · compact height",
  },
  {
    id: "strip_100x40",
    widthMm: 100,
    heightMm: 40,
    labelZh: "100×40 mm",
    labelEn: "100×40 mm",
    hintZh: "迷你条",
    hintEn: "Mini strip",
  },
];

export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

export function getPreset(id: string): PrintSizePreset {
  return (
    PRINT_SIZE_PRESETS.find((p) => p.id === id) || PRINT_SIZE_PRESETS[0]
  );
}

export type PrintTicketDrawInput = {
  title: string;
  type: string;
  valueCents: number;
  storeName: string;
  storeAddress?: string | null;
  businessName: string;
  businessLogo?: string | null;
  code: string;
  validLabel: string;
  terms?: string | null;
  themeColor: string;
  bold: boolean;
  lang: "zh" | "en";
};

function defaultTerms(type: string, lang: "zh" | "en"): string {
  if (type === "ballot") {
    return lang === "en"
      ? "Box ritual only · not spendable. Drop into the draw box after payment."
      : "仅投抽奖箱，不抵消费。收款后将本票投入抽奖箱。";
  }
  if (type === "draw") {
    return lang === "en"
      ? "Exclusive draw · this store only · one-time. Scan to bind phone."
      : "独享抽奖券 · 仅限本店 · 一次有效。扫码绑定手机参与开奖。";
  }
  return lang === "en"
    ? "Store credit · this store only · one-time. Scan QR to bind. Void after use or expiry."
    : "本店代金抵用 · 仅限本店 · 一次用完。扫码绑定手机后使用。用完或过期作废。";
}

function kindLabel(type: string, lang: "zh" | "en"): string {
  if (type === "ballot") return lang === "en" ? "BALLOT" : "入箱票";
  if (type === "draw") return lang === "en" ? "DRAW" : "抽奖券";
  return lang === "en" ? "VOUCHER" : "代金券";
}

function faceLabel(valueCents: number): string {
  const n = valueCents / 100;
  return Number.isInteger(n) ? `S$${n}` : `S$${n.toFixed(2)}`;
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
  return `#${((1 << 24) + (t(r) << 16) + (t(g) << 8) + t(b)).toString(16).slice(1)}`;
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

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const chars = text.split("");
  const lines: string[] = [];
  let line = "";
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && chars.length > 0) {
    const last = lines[maxLines - 1];
    if (ctx.measureText(last + "…").width <= maxWidth) {
      // keep
    } else {
      lines[maxLines - 1] = last.slice(0, Math.max(1, last.length - 1)) + "…";
    }
  }
  return lines;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * 紧凑礼券条 canvas（与 TicketVisualCard print 一致）
 * 左：品牌/标题/门店/条款；右：面值+QR+码
 */
export async function drawPrintStripCanvas(
  opts: PrintTicketDrawInput & { widthPx: number; heightPx: number }
): Promise<HTMLCanvasElement> {
  const { widthPx: W, heightPx: H } = opts;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const s = W / 900;
  const accent = opts.themeColor || "#E85D04";
  const bold = opts.bold;
  const isDraw = opts.type === "draw" || opts.type === "ballot";
  const ink = bold ? "#ffffff" : "#0f172a";
  const muted = bold ? "rgba(255,255,255,0.72)" : "#64748b";
  const terms =
    (opts.terms && opts.terms.trim()) || defaultTerms(opts.type, opts.lang);
  const face = faceLabel(opts.valueCents);
  const badge = kindLabel(opts.type, opts.lang);

  // 背景
  if (bold) {
    const g = ctx.createLinearGradient(0, 0, W, H * 0.2);
    g.addColorStop(0, accent);
    g.addColorStop(0.55, "#1c1630");
    g.addColorStop(1, "#0f0e17");
    ctx.fillStyle = g;
  } else {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, isDraw ? "#faf5ff" : "#fff7ed");
    g.addColorStop(0.5, "#ffffff");
    g.addColorStop(1, "#ffffff");
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, W, H);

  // 圆角描边
  if (!bold) {
    ctx.strokeStyle = isDraw ? "#7c3aed" : accent;
    ctx.lineWidth = Math.max(1.5, 2 * s);
    roundRect(ctx, 1 * s, 1 * s, W - 2 * s, H - 2 * s, 8 * s);
    ctx.stroke();
  }

  // 左侧色条
  const barW = 6 * s;
  const barG = ctx.createLinearGradient(0, 0, 0, H);
  if (bold) {
    barG.addColorStop(0, "#fbbf24");
    barG.addColorStop(1, "#f59e0b");
  } else {
    barG.addColorStop(0, accent);
    barG.addColorStop(1, shadeHex(accent, -12));
  }
  ctx.fillStyle = barG;
  ctx.fillRect(0, 0, barW, H);

  const rightW = Math.min(W * 0.22, 100 * s);
  const leftW = W - barW - rightW;
  const padX = 10 * s;
  const padY = 8 * s;

  // ── 左栏 ──
  let y = padY + 2 * s;
  const logoS = 22 * s;
  try {
    if (opts.businessLogo) {
      const logo = await loadImage(opts.businessLogo);
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, barW + padX, y, logoS, logoS, 4 * s);
      ctx.fill();
      ctx.drawImage(
        logo,
        barW + padX + 1 * s,
        y + 1 * s,
        logoS - 2 * s,
        logoS - 2 * s
      );
    } else {
      ctx.fillStyle = bold ? "rgba(255,255,255,0.15)" : "#ffedd5";
      roundRect(ctx, barW + padX, y, logoS, logoS, 4 * s);
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.font = `bold ${12 * s}px system-ui,sans-serif`;
      ctx.fillText(
        (opts.businessName || "W").slice(0, 1).toUpperCase(),
        barW + padX + 6 * s,
        y + 16 * s
      );
    }
  } catch {
    /* skip logo */
  }

  ctx.fillStyle = ink;
  ctx.font = `bold ${12 * s}px system-ui,sans-serif`;
  const brandX = barW + padX + logoS + 6 * s;
  ctx.fillText(opts.businessName.slice(0, 22), brandX, y + 10 * s);

  // badge
  ctx.font = `800 ${8 * s}px system-ui,sans-serif`;
  const bw = ctx.measureText(badge).width + 10 * s;
  const badgeX = brandX + ctx.measureText(opts.businessName.slice(0, 22)).width + 8 * s;
  // re-measure brand
  ctx.font = `bold ${12 * s}px system-ui,sans-serif`;
  const brandW = ctx.measureText(opts.businessName.slice(0, 22)).width;
  const bx = Math.min(brandX + brandW + 6 * s, barW + leftW - bw - padX);
  ctx.fillStyle = bold ? "rgba(255,255,255,0.16)" : `${accent}20`;
  roundRect(ctx, bx, y + 1 * s, bw, 14 * s, 3 * s);
  ctx.fill();
  ctx.fillStyle = bold ? "#fff" : accent;
  ctx.font = `800 ${8 * s}px system-ui,sans-serif`;
  ctx.fillText(badge, bx + 5 * s, y + 11 * s);

  y += logoS + 6 * s;
  ctx.fillStyle = ink;
  ctx.font = `bold ${14 * s}px system-ui,sans-serif`;
  const titleLine =
    wrapLines(ctx, opts.title, leftW - padX * 2, 1)[0] || opts.title;
  ctx.fillText(titleLine, barW + padX, y + 12 * s);

  y += 18 * s;
  ctx.fillStyle = muted;
  ctx.font = `${9 * s}px system-ui,sans-serif`;
  const storeLine = opts.storeAddress
    ? `${opts.storeName} · ${opts.storeAddress}`
    : opts.storeName;
  const storeClip =
    wrapLines(ctx, storeLine, leftW - padX * 2, 1)[0] || storeLine;
  ctx.fillText(storeClip, barW + padX, y + 8 * s);

  y += 14 * s;
  ctx.fillStyle = muted;
  ctx.font = `${8 * s}px system-ui,sans-serif`;
  const tLines = wrapLines(ctx, terms, leftW - padX * 2, 2);
  tLines.forEach((ln, i) => {
    ctx.fillText(ln, barW + padX, y + 8 * s + i * 11 * s);
  });

  y += tLines.length * 11 * s + 6 * s;
  ctx.fillStyle = bold ? "#fde68a" : "#b45309";
  ctx.font = `600 ${9 * s}px system-ui,sans-serif`;
  const restrict =
    opts.lang === "en" ? "This store · one-time" : "仅限本店 · 一次用完";
  ctx.fillText(
    `${restrict}  ·  ${opts.lang === "en" ? "Until" : "至"} ${opts.validLabel}`,
    barW + padX,
    Math.min(y + 8 * s, H - padY)
  );

  // ── 右栏（固定比例，QR 居中保证可见）──
  const rx = barW + leftW;
  ctx.fillStyle = bold ? "rgba(0,0,0,0.22)" : "#ffffff";
  ctx.fillRect(rx, 0, rightW, H);
  ctx.strokeStyle = bold ? "rgba(255,255,255,0.22)" : "#e2e8f0";
  ctx.setLineDash([3 * s, 3 * s]);
  ctx.beginPath();
  ctx.moveTo(rx, 4 * s);
  ctx.lineTo(rx, H - 4 * s);
  ctx.stroke();
  ctx.setLineDash([]);

  // 垂直居中：面值 + QR + 码
  const qrSize = Math.max(40 * s, Math.min(rightW - 20 * s, H * 0.48, 64 * s));
  const blockH = 22 * s + qrSize + 8 * s + 22 * s;
  let ry = Math.max(padY, (H - blockH) / 2);

  ctx.fillStyle = bold ? "#ffffff" : accent;
  ctx.font = `900 ${20 * s}px system-ui,sans-serif`;
  const faceW = ctx.measureText(face).width;
  ctx.fillText(face, rx + (rightW - faceW) / 2, ry + 16 * s);
  ry += 22 * s;

  try {
    const qrUrl = `/api/physical/qr?code=${encodeURIComponent(opts.code)}&size=240`;
    const qr = await loadImage(qrUrl);
    const qx = rx + (rightW - qrSize) / 2;
    // 白底托盘
    ctx.fillStyle = "#ffffff";
    const pad = 3 * s;
    ctx.fillRect(qx - pad, ry - pad, qrSize + pad * 2, qrSize + pad * 2);
    ctx.drawImage(qr, qx, ry, qrSize, qrSize);
    ry += qrSize + 10 * s;

    ctx.fillStyle = ink;
    ctx.font = `bold ${7 * s}px ui-monospace,monospace`;
    const codeLines = wrapLines(ctx, opts.code, rightW - 8 * s, 2);
    codeLines.forEach((ln) => {
      const lw = ctx.measureText(ln).width;
      ctx.fillText(ln, rx + (rightW - lw) / 2, ry);
      ry += 9 * s;
    });
    ctx.fillStyle = muted;
    ctx.font = `${7 * s}px system-ui,sans-serif`;
    const scan = opts.lang === "en" ? "Scan to bind" : "扫码绑定";
    const sw = ctx.measureText(scan).width;
    ctx.fillText(scan, rx + (rightW - sw) / 2, Math.min(ry + 2 * s, H - 4 * s));
  } catch {
    ctx.fillStyle = "#fff";
    ctx.fillRect(rx + 10 * s, H / 2 - 20 * s, rightW - 20 * s, 40 * s);
    ctx.fillStyle = "#94a3b8";
    ctx.font = `${11 * s}px system-ui,sans-serif`;
    ctx.fillText("QR", rx + rightW / 2 - 10 * s, H / 2);
  }

  return canvas;
}

export function downloadCanvasPng(
  canvas: HTMLCanvasElement,
  filename: string
) {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = filename.replace(/[^\w\u4e00-\u9fff.-]+/g, "_").slice(0, 80);
  a.click();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeFilename(name: string): string {
  return name.replace(/[^\w\u4e00-\u9fff.-]+/g, "_").slice(0, 80);
}

/** JPEG 更小，WhatsApp 兼容更好；PNG 保留透明 */
export type ImageExportFormat = "jpeg" | "png";

export async function canvasToImageFile(
  canvas: HTMLCanvasElement,
  filename: string,
  format: ImageExportFormat = "jpeg",
  quality = 0.88
): Promise<File> {
  const mime = format === "jpeg" ? "image/jpeg" : "image/png";
  const ext = format === "jpeg" ? ".jpg" : ".png";
  // JPEG 不支持透明：先铺白底
  let source: HTMLCanvasElement = canvas;
  if (format === "jpeg") {
    const c = document.createElement("canvas");
    c.width = canvas.width;
    c.height = canvas.height;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(canvas, 0, 0);
      source = c;
    }
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    source.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      mime,
      quality
    );
  });
  const base = safeFilename(filename.replace(/\.(png|jpe?g)$/i, ""));
  return new File([blob], `${base}${ext}`, { type: mime });
}

/** @deprecated 用 canvasToImageFile */
export async function canvasToPngFile(
  canvas: HTMLCanvasElement,
  filename: string
): Promise<File> {
  return canvasToImageFile(canvas, filename, "png");
}

/** 是否支持文件分享（手机 Safari/Chrome 通常可以） */
export function canShareFiles(files?: File[]): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }
  if (!files?.length) {
    // 探测：造一个极小 jpeg
    try {
      const probe = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "t.jpg", {
        type: "image/jpeg",
      });
      if (typeof navigator.canShare === "function") {
        return navigator.canShare({ files: [probe] });
      }
      return true;
    } catch {
      return false;
    }
  }
  try {
    if (typeof navigator.canShare === "function") {
      return navigator.canShare({ files });
    }
  } catch {
    return false;
  }
  return true;
}

/**
 * 只分享「一张」图到系统面板（WhatsApp 最稳）。
 */
export async function shareOneImage(opts: {
  file: File;
  title?: string;
  text?: string;
}): Promise<"shared" | "cancelled" | "unsupported" | "error"> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return "unsupported";
  }
  const file = opts.file;
  try {
    if (
      typeof navigator.canShare === "function" &&
      !navigator.canShare({ files: [file] })
    ) {
      return "unsupported";
    }
  } catch {
    /* continue try share */
  }
  try {
    await navigator.share({
      files: [file],
      title: opts.title,
      text: opts.text,
    });
    return "shared";
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    const msg = e instanceof Error ? e.message : String(e);
    if (name === "AbortError") return "cancelled";
    console.warn("shareOneImage failed:", name, msg);
    return "error";
  }
}

/** @deprecated 用 shareOneImage */
export async function shareFiles(opts: {
  files: File[];
  title?: string;
  text?: string;
}): Promise<"shared" | "cancelled" | "unsupported"> {
  if (!opts.files.length) return "unsupported";
  const r = await shareOneImage({
    file: opts.files[0],
    title: opts.title,
    text: opts.text,
  });
  if (r === "error") return "unsupported";
  return r;
}

/**
 * 触发浏览器下载（单文件）。
 * 注意：手机通常进「文件/下载」，不会进「相册 Photos」。
 */
export async function downloadFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 延迟释放，给浏览器时间读 blob
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return url;
}

/** 在本页打开大图预览 URL（便于长按保存到相册） */
export function createObjectUrl(file: File): string {
  return URL.createObjectURL(file);
}

/** 浏览器 canvas 安全上限（避免超长图崩溃） */
const CANVAS_MAX_EDGE = 8192;

/** 自动分份：紧凑条可多装几张 */
const AUTO_TARGET_PER_PART = 6;

/**
 * 根据总张数建议分成几份（用户可改）。
 * 规则：优先每份约 5 张；1～5 张不分；上限不超过总张数。
 */
export function suggestSplitParts(ticketCount: number): number {
  const n = Math.max(0, Math.floor(ticketCount));
  if (n <= 0) return 1;
  if (n <= AUTO_TARGET_PER_PART) return 1;
  return Math.min(n, Math.ceil(n / AUTO_TARGET_PER_PART));
}

/**
 * 按「份数」均分：整张券不跨份；份数尽量均摊（前 r 份多 1 张）。
 * 例：20 张分 3 份 → 7 + 7 + 6
 */
export function splitTicketsIntoParts<T>(
  tickets: T[],
  parts: number
): T[][] {
  const n = tickets.length;
  if (n === 0) return [[]];
  const p = Math.max(1, Math.min(n, Math.floor(parts) || 1));
  const base = Math.floor(n / p);
  const rem = n % p;
  const out: T[][] = [];
  let i = 0;
  for (let k = 0; k < p; k++) {
    const size = base + (k < rem ? 1 : 0);
    out.push(tickets.slice(i, i + size));
    i += size;
  }
  return out;
}

/** 某份在画布上的自然高度（px）= 边距 + 完整券 + 间距 */
export function sheetPartHeightPx(opts: {
  ticketsOnPart: number;
  ticketHeightPx: number;
  gapPx: number;
  marginPx: number;
}): number {
  const t = Math.max(0, opts.ticketsOnPart);
  if (t === 0) return opts.marginPx * 2;
  return (
    opts.marginPx * 2 +
    t * opts.ticketHeightPx +
    Math.max(0, t - 1) * opts.gapPx
  );
}

/**
 * 若某份按当前份数会超 canvas 上限，自动加份，直到安全。
 * 保证：每份至少 1 张完整券，PNG 高度刚好装下该份（不裁切）。
 */
export function resolveSafeParts(opts: {
  ticketCount: number;
  parts: number;
  ticketHeightPx: number;
  gapPx: number;
  marginPx: number;
}): { parts: number; maxOnPart: number; partHeightPx: number } {
  const n = Math.max(0, opts.ticketCount);
  let parts = Math.max(1, Math.min(n || 1, Math.floor(opts.parts) || 1));
  if (n === 0) {
    return { parts: 1, maxOnPart: 0, partHeightPx: opts.marginPx * 2 };
  }

  for (let guard = 0; guard < n + 2; guard++) {
    const maxOnPart = Math.ceil(n / parts);
    const h = sheetPartHeightPx({
      ticketsOnPart: maxOnPart,
      ticketHeightPx: opts.ticketHeightPx,
      gapPx: opts.gapPx,
      marginPx: opts.marginPx,
    });
    if (h <= CANVAS_MAX_EDGE || parts >= n) {
      return { parts, maxOnPart, partHeightPx: h };
    }
    parts += 1; // 太长 → 多分一份
  }
  return {
    parts: n,
    maxOnPart: 1,
    partHeightPx: sheetPartHeightPx({
      ticketsOnPart: 1,
      ticketHeightPx: opts.ticketHeightPx,
      gapPx: opts.gapPx,
      marginPx: opts.marginPx,
    }),
  };
}

/** 预估：分几份、每份大约几张、PNG 大约多高(mm) */
export function estimateSplitPlan(opts: {
  ticketCount: number;
  parts: number;
  ticketHeightMm: number;
  dpi: number;
}): {
  parts: number;
  /** 最多一份有几张（均分后的上限） */
  maxPerPart: number;
  /** 最少一份有几张 */
  minPerPart: number;
  /** 最高那份的大约高度 mm（给用户心里有数，不是固定页高） */
  approxHeightMm: number;
} {
  const heightPx = mmToPx(opts.ticketHeightMm, opts.dpi);
  const gapPx = Math.max(6, Math.round(heightPx * 0.025));
  const marginPx = 12;
  const safe = resolveSafeParts({
    ticketCount: opts.ticketCount,
    parts: opts.parts,
    ticketHeightPx: heightPx,
    gapPx,
    marginPx,
  });
  const n = opts.ticketCount;
  const p = safe.parts;
  const base = n === 0 ? 0 : Math.floor(n / p);
  const rem = n === 0 ? 0 : n % p;
  const maxPerPart = base + (rem > 0 ? 1 : 0);
  const minPerPart = base;
  const partHpx = sheetPartHeightPx({
    ticketsOnPart: maxPerPart,
    ticketHeightPx: heightPx,
    gapPx,
    marginPx,
  });
  const approxHeightMm = Math.round((partHpx / opts.dpi) * 25.4);
  return {
    parts: p,
    maxPerPart,
    minPerPart: minPerPart || maxPerPart,
    approxHeightMm,
  };
}

// 兼容旧测试名
export function paginateTicketsWithoutSplit<T>(
  tickets: T[],
  perPage: number
): T[][] {
  if (!tickets.length) return [[]];
  const per = Math.max(1, perPage);
  const parts = Math.ceil(tickets.length / per);
  return splitTicketsIntoParts(tickets, parts);
}

/** 生成印刷拼版 canvas 列表（不下载） */
export async function buildPrintSheetCanvases(args: {
  tickets: { code: string }[];
  base: Omit<PrintTicketDrawInput, "code">;
  widthMm: number;
  heightMm: number;
  dpi: number;
  mode: "one" | "each" | "sheet";
  splitParts?: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<HTMLCanvasElement[]> {
  const widthPx = mmToPx(args.widthMm, args.dpi);
  const heightPx = mmToPx(args.heightMm, args.dpi);
  const list =
    args.mode === "one" ? args.tickets.slice(0, 1) : args.tickets;
  if (!list.length) return [];

  const out: HTMLCanvasElement[] = [];

  if (args.mode === "sheet") {
    // 紧凑叠打：间距略小
    const gap = Math.max(6, Math.round(heightPx * 0.025));
    const margin = 12;
    const wanted =
      args.splitParts != null && args.splitParts > 0
        ? args.splitParts
        : suggestSplitParts(list.length);

    const safe = resolveSafeParts({
      ticketCount: list.length,
      parts: wanted,
      ticketHeightPx: heightPx,
      gapPx: gap,
      marginPx: margin,
    });

    const pages = splitTicketsIntoParts(list, safe.parts);
    const sheetW = widthPx + margin * 2;
    let done = 0;

    for (let p = 0; p < pages.length; p++) {
      const pageTickets = pages[p];
      const useH = Math.min(
        CANVAS_MAX_EDGE,
        sheetPartHeightPx({
          ticketsOnPart: pageTickets.length,
          ticketHeightPx: heightPx,
          gapPx: gap,
          marginPx: margin,
        })
      );

      const sheet = document.createElement("canvas");
      sheet.width = sheetW;
      sheet.height = useH;
      const sctx = sheet.getContext("2d");
      if (!sctx) continue;
      sctx.fillStyle = "#f1f5f9";
      sctx.fillRect(0, 0, sheet.width, sheet.height);

      if (pages.length > 1) {
        sctx.fillStyle = "#94a3b8";
        sctx.font = "12px system-ui,sans-serif";
        sctx.fillText(
          `${p + 1}/${pages.length}`,
          sheetW - margin - 36,
          useH - 6
        );
      }

      for (let i = 0; i < pageTickets.length; i++) {
        const c = await drawPrintStripCanvas({
          ...args.base,
          code: pageTickets[i].code,
          widthPx,
          heightPx,
        });
        const y = margin + i * (heightPx + gap);
        if (y + heightPx > useH + 0.5) {
          throw new Error(
            `layout bug: ticket would be clipped on part ${p + 1}`
          );
        }
        sctx.drawImage(c, margin, y);
        done += 1;
        args.onProgress?.(done, list.length);
      }
      out.push(sheet);
    }
    return out;
  }

  for (let i = 0; i < list.length; i++) {
    const c = await drawPrintStripCanvas({
      ...args.base,
      code: list[i].code,
      widthPx,
      heightPx,
    });
    out.push(c);
    args.onProgress?.(i + 1, list.length);
  }
  return out;
}

export type ExportImageItem = {
  file: File;
  /** 页面内预览 / 长按保存用 */
  previewUrl: string;
  index: number;
  total: number;
};

export type ExportPrintResult = {
  pages: number;
  delivery: "shared" | "preview" | "cancelled" | "failed";
  /** 单页预览（可选） */
  items: ExportImageItem[];
  /** 多页 PDF（推荐：一张文件含全部页，分页不裁券） */
  pdf?: { file: File; previewUrl: string };
  /** 实际印出的单张券尺寸（宽锚定 mm，高由 HTML 版式比例得出） */
  ticketSizeMm?: { widthMm: number; heightMm: number };
  errorKey?: "share_unsupported" | "share_error" | "empty" | "build";
};

// ─── 多页 PDF（每页 = 一整张拼版 canvas，绝不裁半张券）───

async function canvasToJpegBytes(
  canvas: HTMLCanvasElement,
  quality = 0.9
): Promise<Uint8Array> {
  // 白底
  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no 2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(canvas, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    c.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("jpeg failed"))),
      "image/jpeg",
      quality
    );
  });
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * 将多张 canvas 合成多页 PDF。
 * 每一页 MediaBox 按 canvas 像素 + dpi 换算成 point（72pt/inch），
 * 打印尺寸与票面 mm 一致；分页边界 = 整页拼版，不会截断单张券。
 */
export async function canvasesToPdfFile(
  canvases: HTMLCanvasElement[],
  opts: { dpi: number; filename: string; jpegQuality?: number }
): Promise<File> {
  if (!canvases.length) throw new Error("no pages");
  const dpi = opts.dpi || 150;
  const quality = opts.jpegQuality ?? 0.9;

  type PageData = {
    jpeg: Uint8Array;
    wPx: number;
    hPx: number;
    wPt: number;
    hPt: number;
  };
  const pages: PageData[] = [];
  for (const canvas of canvases) {
    const jpeg = await canvasToJpegBytes(canvas, quality);
    const wPx = canvas.width;
    const hPx = canvas.height;
    pages.push({
      jpeg,
      wPx,
      hPx,
      wPt: (wPx / dpi) * 72,
      hPt: (hPx / dpi) * 72,
    });
  }

  // 手工组装 PDF 1.4
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0]; // obj 0 unused
  let pos = 0;

  const push = (data: string | Uint8Array) => {
    const u =
      typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(u);
    pos += u.length;
  };

  const addObj = (num: number, body: string | Uint8Array[]) => {
    offsets[num] = pos;
    push(`${num} 0 obj\n`);
    if (typeof body === "string") {
      push(body);
      if (!body.endsWith("\n")) push("\n");
    } else {
      for (const b of body) push(b);
    }
    push("endobj\n");
  };

  push("%PDF-1.4\n");
  // binary comment (required by some PDF readers)
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  // Object layout:
  // 1 Catalog
  // 2 Pages
  // For each page i (0-based):
  //   pageObj = 3 + i*3
  //   contentObj = 4 + i*3
  //   imageObj = 5 + i*3

  const pageObjNums: number[] = [];
  for (let i = 0; i < pages.length; i++) {
    pageObjNums.push(3 + i * 3);
  }

  addObj(
    1,
    "<< /Type /Catalog /Pages 2 0 R >>\n"
  );
  addObj(
    2,
    `<< /Type /Pages /Kids [${pageObjNums
      .map((n) => `${n} 0 R`)
      .join(" ")}] /Count ${pages.length} >>\n`
  );

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const pageObj = 3 + i * 3;
    const contentObj = 4 + i * 3;
    const imageObj = 5 + i * 3;
    const w = p.wPt.toFixed(2);
    const h = p.hPt.toFixed(2);

    addObj(
      pageObj,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents ${contentObj} 0 R /Resources << /XObject << /Im${i} ${imageObj} 0 R >> >> >>\n`
    );

    const contentStream = `q ${w} 0 0 ${h} 0 0 cm /Im${i} Do Q\n`;
    addObj(contentObj, [
      encoder.encode(
        `<< /Length ${contentStream.length} >>\nstream\n`
      ),
      encoder.encode(contentStream),
      encoder.encode("endstream\n"),
    ]);

    addObj(imageObj, [
      encoder.encode(
        `<< /Type /XObject /Subtype /Image /Width ${p.wPx} /Height ${p.hPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`
      ),
      p.jpeg,
      encoder.encode("\nendstream\n"),
    ]);
  }

  const xrefPos = pos;
  const maxObj = 2 + pages.length * 3;
  push(`xref\n0 ${maxObj + 1}\n`);
  push("0000000000 65535 f \n");
  for (let i = 1; i <= maxObj; i++) {
    const off = offsets[i] ?? 0;
    push(`${String(off).padStart(10, "0")} 00000 n \n`);
  }
  push(
    `trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`
  );

  // concat
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }

  const name = safeFilename(
    opts.filename.endsWith(".pdf") ? opts.filename : `${opts.filename}.pdf`
  );
  return new File([out], name, { type: "application/pdf" });
}

export async function sharePdfFile(opts: {
  file: File;
  title?: string;
  text?: string;
}): Promise<"shared" | "cancelled" | "unsupported" | "error"> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return "unsupported";
  }
  try {
    if (
      typeof navigator.canShare === "function" &&
      !navigator.canShare({ files: [opts.file] })
    ) {
      return "unsupported";
    }
  } catch {
    /* try anyway */
  }
  try {
    await navigator.share({
      files: [opts.file],
      title: opts.title,
      text: opts.text,
    });
    return "shared";
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return "cancelled";
    console.warn("sharePdf failed", e);
    return "error";
  }
}

/**
 * 印刷导出（推荐 PDF）：
 * 1. 优先截取页面上「屏幕条形预览」HTML（所见即所得）
 * 2. 按真实截图高度叠页（不截断、不拉高留白）
 * 3. 合成多页 PDF 单文件
 * 4. DOM 失败时回退到手绘 canvas
 */
export async function exportPrintPdf(args: {
  tickets: { code: string; claimUrl?: string }[];
  base: Omit<PrintTicketDrawInput, "code"> & {
    templateId?: string | null;
  };
  widthMm: number;
  heightMm: number;
  dpi: number;
  filePrefix: string;
  splitParts?: number;
  delivery?: "share" | "download" | "auto";
  shareTitle?: string;
  shareText?: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<ExportPrintResult> {
  const delivery = args.delivery || "auto";
  const dpi =
    delivery === "share" ? Math.min(args.dpi, 150) : args.dpi;
  // 印刷像素宽 = 票宽 mm @ dpi。高度不再由预设决定：
  // HTML 票面是按宽度自适应的，强行拉到预设高就会走样。
  const widthPx = mmToPx(args.widthMm, dpi);
  const parts = Math.max(
    1,
    args.splitParts ?? suggestSplitParts(args.tickets.length)
  );
  const perPage = Math.max(1, Math.ceil(args.tickets.length / parts));

  let pageCanvases: HTMLCanvasElement[] = [];
  let pdfDpi = dpi;
  let ticketHeightMm = args.heightMm;

  // ── 主路径：按屏幕预览宽度渲染 HTML → 放大到印刷像素（比例与所见一致）──
  try {
    const {
      captureTicketsFromDom,
      composeTicketSheet,
      measureOnScreenStripWidth,
      releaseCanvas,
    } = await import("@/lib/physical-dom-export");

    const designWidthPx = measureOnScreenStripWidth();
    const toInput = (t: { code: string; claimUrl?: string }) => ({
      code: t.code,
      claimUrl: t.claimUrl,
      title: args.base.title,
      type: args.base.type,
      valueCents: args.base.valueCents,
      storeName: args.base.storeName,
      storeAddress: args.base.storeAddress,
      businessName: args.base.businessName,
      businessLogo: args.base.businessLogo,
      validLabel: args.base.validLabel,
      terms: args.base.terms,
      themeColor: args.base.themeColor,
      templateId: args.base.templateId,
      lang: args.base.lang,
    });

    // 先截 1 张探针，量出这版票面在该宽度下的真实高度
    const probe = await captureTicketsFromDom({
      tickets: [toInput(args.tickets[0])],
      targetWidthPx: widthPx,
      designWidthPx,
    });
    if (!probe.length) throw new Error("probe capture failed");
    const ticketW = probe[0].width;
    const ticketHpx = probe[0].height;
    releaseCanvas(probe[0]);

    ticketHeightMm =
      Math.round((args.widthMm * ticketHpx) / ticketW * 10) / 10;

    const margin = Math.max(8, Math.round(ticketW * 0.012));
    const gap = Math.max(6, Math.round(ticketW * 0.008));
    const pageWidthPx = ticketW + margin * 2;

    // 单页 canvas 上限 → 每页最多几张（整张券，绝不截断）
    const maxPerPage = Math.max(
      1,
      Math.floor((CANVAS_MAX_EDGE - margin * 2 + gap) / (ticketHpx + gap))
    );
    const perPageSafe = Math.min(perPage, maxPerPage);
    const groups = paginateTicketsWithoutSplit(args.tickets, perPageSafe);

    // 逐页截图 + 合成，合成完立即释放单票 canvas（100 张不至于 OOM）
    let done = 0;
    for (const group of groups) {
      if (!group.length) continue;
      const canvases = await captureTicketsFromDom({
        tickets: group.map(toInput),
        targetWidthPx: widthPx,
        designWidthPx,
        onProgress: (d) => args.onProgress?.(done + d, args.tickets.length),
      });
      pageCanvases.push(
        composeTicketSheet({
          tickets: canvases,
          gapPx: gap,
          marginPx: margin,
          pageWidthPx,
          background: "#f1f5f9",
        })
      );
      canvases.forEach(releaseCanvas);
      done += group.length;
    }
    // canvas 宽就是 mmToPx(widthMm, dpi)，所以 PDF 直接用 dpi
    pdfDpi = dpi;
  } catch (e) {
    console.warn("DOM export failed, fallback canvas draw", e);
    pageCanvases = [];
    ticketHeightMm = args.heightMm;
    try {
      pageCanvases = await buildPrintSheetCanvases({
        tickets: args.tickets,
        base: args.base,
        widthMm: args.widthMm,
        heightMm: args.heightMm,
        dpi,
        mode: "sheet",
        splitParts: parts,
        onProgress: args.onProgress,
      });
      pdfDpi = dpi;
    } catch (e2) {
      console.error(e2);
      return { pages: 0, delivery: "failed", items: [], errorKey: "build" };
    }
  }

  if (!pageCanvases.length) {
    return { pages: 0, delivery: "failed", items: [], errorKey: "empty" };
  }

  // PDF 页尺寸：按实际 canvas 像素 + 有效 dpi 换算 point
  const firstPreview = await canvasToImageFile(
    pageCanvases[0],
    `${args.filePrefix}-p1`,
    "jpeg",
    0.9
  );
  const items: ExportImageItem[] = [
    {
      file: firstPreview,
      previewUrl: createObjectUrl(firstPreview),
      index: 0,
      total: pageCanvases.length,
    },
  ];

  let pdfFile: File;
  try {
    pdfFile = await canvasesToPdfFile(pageCanvases, {
      dpi: pdfDpi,
      filename: `${args.filePrefix}-${args.widthMm}mm-${pageCanvases.length}p`,
      jpegQuality: 0.92,
    });
  } catch (e) {
    console.error(e);
    return {
      pages: pageCanvases.length,
      delivery: "failed",
      items,
      errorKey: "build",
    };
  }

  const pdf = { file: pdfFile, previewUrl: createObjectUrl(pdfFile) };
  const ticketSizeMm = {
    widthMm: args.widthMm,
    heightMm: ticketHeightMm,
  };
  const wantShare = delivery === "share" || delivery === "auto";
  if (wantShare) {
    const r = await sharePdfFile({
      file: pdfFile,
      title: args.shareTitle || args.filePrefix,
      text:
        args.shareText ||
        `${args.filePrefix} · ${pageCanvases.length} page PDF`,
    });
    if (r === "shared") {
      return {
        pages: pageCanvases.length,
        delivery: "shared",
        items,
        pdf,
        ticketSizeMm,
      };
    }
    if (r === "cancelled") {
      return {
        pages: pageCanvases.length,
        delivery: "cancelled",
        items,
        pdf,
        ticketSizeMm,
      };
    }
    return {
      pages: pageCanvases.length,
      delivery: "preview",
      items,
      pdf,
      ticketSizeMm,
      errorKey: r === "unsupported" ? "share_unsupported" : "share_error",
    };
  }

  return {
    pages: pageCanvases.length,
    delivery: "preview",
    items,
    pdf,
    ticketSizeMm,
  };
}

/** 兼容旧调用：走 PDF 主路径 */
export async function exportPrintPngs(args: {
  tickets: { code: string }[];
  base: Omit<PrintTicketDrawInput, "code">;
  widthMm: number;
  heightMm: number;
  dpi: number;
  mode: "one" | "each" | "sheet";
  filePrefix: string;
  splitParts?: number;
  delivery?: "share" | "download" | "auto";
  shareOptimized?: boolean;
  shareTitle?: string;
  shareText?: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<ExportPrintResult> {
  // one / each 也并入 sheet PDF（one = 仅第一张券）
  const list =
    args.mode === "one" ? args.tickets.slice(0, 1) : args.tickets;
  return exportPrintPdf({
    tickets: list,
    base: args.base,
    widthMm: args.widthMm,
    heightMm: args.heightMm,
    dpi: args.dpi,
    filePrefix: args.filePrefix,
    splitParts:
      args.mode === "each"
        ? list.length // 每张一页
        : args.splitParts,
    delivery: args.delivery,
    shareTitle: args.shareTitle,
    shareText: args.shareText,
    onProgress: args.onProgress,
  });
}

/** 分享 PDF 文件 */
export async function shareExportPdf(
  pdf: { file: File },
  opts?: { title?: string; text?: string }
): Promise<"shared" | "cancelled" | "unsupported" | "error"> {
  return sharePdfFile({
    file: pdf.file,
    title: opts?.title,
    text: opts?.text,
  });
}

/** @deprecated 单图分享 */
export async function shareExportItem(
  item: ExportImageItem,
  opts?: { title?: string; text?: string }
): Promise<"shared" | "cancelled" | "unsupported" | "error"> {
  return shareOneImage({
    file: item.file,
    title: opts?.title,
    text:
      opts?.text ||
      (item.total > 1 ? `${item.index + 1}/${item.total}` : undefined),
  });
}

/** 1:1 社媒分享方图：优先系统分享（WhatsApp），否则下载 */
export async function exportShareSquarePng(opts: {
  title: string;
  type: string;
  valueCents: number;
  storeName: string;
  businessName: string;
  businessLogo?: string | null;
  code: string;
  validLabel: string;
  themeColor: string;
  bold: boolean;
  lang: "zh" | "en";
  delivery?: "share" | "download" | "auto";
}): Promise<"shared" | "downloaded" | "cancelled"> {
  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "downloaded";

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
  const lines = wrapLines(ctx, opts.title, size - 128, 3);
  lines.forEach((ln, i) => ctx.fillText(ln, 64, 240 + i * 60));

  if (opts.type === "voucher" || opts.type === "ballot") {
    ctx.fillStyle = opts.bold ? "#fff" : opts.themeColor;
    ctx.font = "bold 96px system-ui,sans-serif";
    ctx.fillText(faceLabel(opts.valueCents), 64, 480);
  } else {
    ctx.fillStyle = opts.bold ? "#fde68a" : "#7c3aed";
    ctx.font = "bold 40px system-ui,sans-serif";
    ctx.fillText(
      opts.lang === "en" ? "Lucky draw ticket" : "抽奖券",
      64,
      460
    );
  }

  ctx.fillStyle = muted;
  ctx.font = "28px system-ui,sans-serif";
  ctx.fillText(`🏪 ${opts.storeName}`.slice(0, 40), 64, 560);
  ctx.fillStyle = opts.bold ? "#fbbf24" : "#dc2626";
  ctx.font = "bold 26px system-ui,sans-serif";
  ctx.fillText(
    opts.lang === "en" ? "This store only · one-time" : "仅限本店 · 一次用完",
    64,
    610
  );
  ctx.fillStyle = muted;
  ctx.font = "22px ui-monospace,monospace";
  ctx.fillText(opts.code, 64, 980);
  ctx.fillText(
    `${opts.lang === "en" ? "Valid" : "有效期"} ${opts.validLabel}`,
    64,
    1020
  );

  try {
    const qrUrl = `/api/physical/qr?code=${encodeURIComponent(opts.code)}&size=320`;
    const img = await loadImage(qrUrl);
    ctx.fillStyle = "#fff";
    ctx.fillRect(size - 64 - 280, size - 64 - 320, 300, 300);
    ctx.drawImage(img, size - 64 - 260, size - 64 - 300, 260, 260);
  } catch {
    /* skip */
  }

  const file = await canvasToImageFile(
    canvas,
    `${opts.title.slice(0, 24)}-share`,
    "jpeg",
    0.9
  );
  const delivery = opts.delivery || "auto";
  if (delivery === "share" || delivery === "auto") {
    const r = await shareOneImage({
      file,
      title: opts.title,
      text: opts.lang === "en" ? "WeMembers ticket" : "WeMembers 票面",
    });
    if (r === "shared") return "shared";
    if (r === "cancelled") return "cancelled";
  }
  await downloadFile(file);
  return "downloaded";
}

/**
 * 实体券导出：用「纯内联样式」拼出与屏幕条形预览一致的 HTML，再截图拼 PDF。
 * 避免 html-to-image 在屏外 / Tailwind oklch / overflow+flex 下裁掉右侧 QR 栏。
 */
import { toCanvas } from "html-to-image";
import QRCode from "qrcode";
import { getVisualTemplate } from "@/lib/visual-templates";

export type DomTicketExportInput = {
  code: string;
  title: string;
  type: string;
  valueCents: number;
  storeName: string;
  storeAddress?: string | null;
  businessName: string;
  businessLogo?: string | null;
  validLabel: string;
  terms?: string | null;
  themeColor: string | null;
  templateId?: string | null;
  lang: "zh" | "en";
  claimUrl?: string;
};

/**
 * 票面是「按 CSS 像素设计」的：右栏 112px、字号 8~22px 都是绝对值。
 * 所以必须先按屏幕预览的宽度渲染，再整体缩放到印刷像素宽，
 * 否则宽度一放大（180mm@300dpi = 2126px），右栏只剩 5% —— 就是「走样」。
 */
export const STRIP_DESIGN_WIDTH_PX = 480;

/** 量出页面上真实的屏幕条形预览宽度，导出即所见 */
export function measureOnScreenStripWidth(
  fallback = STRIP_DESIGN_WIDTH_PX
): number {
  if (typeof document === "undefined") return fallback;
  try {
    const el = document.querySelector<HTMLElement>("[data-physical-ticket]");
    const w = el?.getBoundingClientRect().width ?? 0;
    // 太窄（手机竖屏 <320）会把文案挤成两行，版式不稳；夹在设计区间内
    if (!Number.isFinite(w) || w < 320) return fallback;
    return Math.round(Math.min(w, 760));
  } catch {
    return fallback;
  }
}

/** 释放大 canvas 的显存/内存（100 张 × 2126px 很容易 OOM） */
export function releaseCanvas(c: HTMLCanvasElement) {
  c.width = 1;
  c.height = 1;
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((res) => {
            img.onload = () => res();
            img.onerror = () => res();
            setTimeout(res, 2500);
          })
    )
  );
}

export function scaleCanvasToWidth(
  src: HTMLCanvasElement,
  targetWidthPx: number
): HTMLCanvasElement {
  if (src.width === targetWidthPx) return src;
  if (src.width <= 0 || src.height <= 0) return src;
  const targetH = Math.max(
    1,
    Math.round((src.height * targetWidthPx) / src.width)
  );
  const out = document.createElement("canvas");
  out.width = targetWidthPx;
  out.height = targetH;
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, targetWidthPx, targetH);
  return out;
}

function faceLabel(valueCents: number): string {
  const n = valueCents / 100;
  return Number.isInteger(n) ? `S$${n}` : `S$${n.toFixed(2)}`;
}

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

function kindLabel(type: string, lang: "zh" | "en"): string {
  if (type === "ballot") return lang === "en" ? "BALLOT" : "入箱票";
  if (type === "draw") return lang === "en" ? "DRAW" : "抽奖券";
  return lang === "en" ? "VOUCHER" : "代金券";
}

/**
 * 纯 DOM + 内联样式的礼券条（与 TicketVisualCard print 同构）：
 * 左文案 | 右固定 112px：面值 + QR + 码
 */
export function buildInlineStripElement(
  t: DomTicketExportInput & { qrDataUrl: string }
): HTMLElement {
  const accent = (t.themeColor || "#E85D04").trim() || "#E85D04";
  const dark = getVisualTemplate(t.templateId).surface === "dark";

  const ink = dark ? "#ffffff" : "#0f172a";
  const muted = dark ? "rgba(255,255,255,0.75)" : "#64748b";
  const bg = dark
    ? `linear-gradient(100deg, ${accent} 0%, #1c1630 55%, #0f0e17 100%)`
    : t.type === "draw" || t.type === "ballot"
      ? "linear-gradient(90deg, #faf5ff 0%, #ffffff 55%)"
      : "linear-gradient(90deg, #fff7ed 0%, #ffffff 55%)";

  const terms = (t.terms && t.terms.trim()) || defaultTerms(t.type, t.lang);
  const face = faceLabel(t.valueCents);
  const badge = kindLabel(t.type, t.lang);
  const storeLine = t.storeAddress
    ? `${t.storeName} · ${t.storeAddress}`
    : t.storeName;
  const restrict =
    t.lang === "en" ? "This store · one-time" : "仅限本店 · 一次用完";
  const until = t.lang === "en" ? "Until" : "至";
  const scan = t.lang === "en" ? "Scan to bind" : "扫码绑定";

  const root = document.createElement("div");
  root.setAttribute("data-export-code", t.code);
  root.style.cssText = [
    "box-sizing:border-box",
    "width:100%",
    "display:flex",
    "align-items:stretch",
    "overflow:visible",
    "border-radius:8px",
    `background:${bg}`,
    `color:${ink}`,
    "font-family:system-ui,-apple-system,'Segoe UI',sans-serif",
    "-webkit-print-color-adjust:exact",
    "print-color-adjust:exact",
    dark ? "border:none" : `border:1.5px solid ${accent}59`,
  ].join(";");

  // 左色条
  const bar = document.createElement("div");
  bar.style.cssText = [
    "width:6px",
    "flex-shrink:0",
    dark
      ? "background:linear-gradient(180deg,#fbbf24,#f59e0b)"
      : `background:linear-gradient(180deg,${accent},${accent})`,
  ].join(";");
  root.appendChild(bar);

  // 中：文案
  const mid = document.createElement("div");
  mid.style.cssText =
    "flex:1 1 auto;min-width:0;padding:8px 10px;box-sizing:border-box;";

  const brandRow = document.createElement("div");
  brandRow.style.cssText =
    "display:flex;align-items:center;gap:6px;min-width:0;margin-bottom:2px;";

  if (t.businessLogo) {
    const logo = document.createElement("img");
    logo.src = t.businessLogo;
    logo.alt = "";
    logo.width = 24;
    logo.height = 24;
    logo.crossOrigin = "anonymous";
    logo.style.cssText =
      "width:24px;height:24px;border-radius:4px;object-fit:contain;background:#fff;flex-shrink:0;border:1px solid rgba(0,0,0,0.1);";
    brandRow.appendChild(logo);
  } else {
    const ph = document.createElement("div");
    ph.textContent = (t.businessName || "W").slice(0, 1).toUpperCase();
    ph.style.cssText = dark
      ? "width:24px;height:24px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;background:rgba(255,255,255,0.15);flex-shrink:0;"
      : "width:24px;height:24px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;background:#ffedd5;color:#9a3412;flex-shrink:0;";
    brandRow.appendChild(ph);
  }

  const brandName = document.createElement("span");
  brandName.textContent = t.businessName || "Brand";
  brandName.style.cssText =
    "font-size:11px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
  brandRow.appendChild(brandName);

  const badgeEl = document.createElement("span");
  badgeEl.textContent = badge;
  badgeEl.style.cssText = dark
    ? "flex-shrink:0;border-radius:3px;padding:1px 4px;font-size:8px;font-weight:800;background:rgba(255,255,255,0.16);color:#fff;"
    : `flex-shrink:0;border-radius:3px;padding:1px 4px;font-size:8px;font-weight:800;background:${accent}20;color:${accent};`;
  brandRow.appendChild(badgeEl);
  mid.appendChild(brandRow);

  const title = document.createElement("div");
  title.textContent = t.title;
  title.style.cssText =
    "font-size:13px;font-weight:700;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px;";
  mid.appendChild(title);

  const store = document.createElement("div");
  store.textContent = storeLine;
  store.style.cssText = `font-size:9px;line-height:1.3;color:${muted};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px;`;
  mid.appendChild(store);

  const termsEl = document.createElement("div");
  termsEl.textContent = terms;
  termsEl.style.cssText = `font-size:8px;line-height:1.35;color:${muted};display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:2px;`;
  mid.appendChild(termsEl);

  const restrictEl = document.createElement("div");
  restrictEl.innerHTML = `<span style="font-weight:600;color:${
    dark ? "#fde68a" : "#b45309"
  }">${restrict}</span><span style="font-weight:500;margin-left:6px;color:${muted}">${until} ${t.validLabel}</span>`;
  restrictEl.style.cssText = "font-size:9px;";
  mid.appendChild(restrictEl);

  root.appendChild(mid);

  // 右栏：固定 112px —— 绝不被 flex 挤没
  const right = document.createElement("div");
  right.style.cssText = [
    "flex:0 0 112px",
    "width:112px",
    "min-width:112px",
    "max-width:112px",
    "box-sizing:border-box",
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "justify-content:center",
    "gap:4px",
    "padding:8px 6px",
    dark
      ? "border-left:1px dashed rgba(255,255,255,0.25);background:rgba(0,0,0,0.28)"
      : "border-left:1px dashed #e2e8f0;background:#ffffff",
  ].join(";");

  const faceEl = document.createElement("div");
  faceEl.textContent = face;
  faceEl.style.cssText = [
    "font-weight:900",
    "font-size:22px",
    "line-height:1",
    "letter-spacing:-0.02em",
    "font-variant-numeric:tabular-nums",
    `color:${dark ? "#ffffff" : accent}`,
  ].join(";");
  right.appendChild(faceEl);

  // QR 白底托盘 72×72
  const qrBox = document.createElement("div");
  qrBox.style.cssText = [
    "width:72px",
    "height:72px",
    "min-width:72px",
    "min-height:72px",
    "box-sizing:border-box",
    "background:#ffffff",
    "border-radius:6px",
    "padding:3px",
    "border:1px solid #e2e8f0",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "flex-shrink:0",
    "overflow:hidden",
  ].join(";");
  const qrImg = document.createElement("img");
  qrImg.src = t.qrDataUrl;
  qrImg.alt = "QR";
  qrImg.width = 66;
  qrImg.height = 66;
  qrImg.style.cssText =
    "width:66px;height:66px;display:block;object-fit:contain;background:#fff;";
  qrBox.appendChild(qrImg);
  right.appendChild(qrBox);

  const codeEl = document.createElement("div");
  codeEl.textContent = t.code;
  codeEl.style.cssText = [
    "font-family:ui-monospace,SFMono-Regular,Menlo,monospace",
    "font-size:7px",
    "font-weight:700",
    "text-align:center",
    "line-height:1.15",
    "width:100%",
    "word-break:break-all",
    `color:${ink}`,
  ].join(";");
  right.appendChild(codeEl);

  const scanEl = document.createElement("div");
  scanEl.textContent = scan;
  scanEl.style.cssText = `font-size:7px;color:${muted};`;
  right.appendChild(scanEl);

  root.appendChild(right);
  return root;
}

async function makeQrDataUrl(code: string, claimUrl?: string): Promise<string> {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const target =
    claimUrl?.trim() || `${origin}/c/${encodeURIComponent(code)}`;
  try {
    return await QRCode.toDataURL(target, {
      width: 168,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    });
  } catch {
    // 最后兜底：公开 API
    try {
      const res = await fetch(
        `/api/physical/qr?code=${encodeURIComponent(code)}&size=168`
      );
      if (!res.ok) throw new Error("qr api");
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
    } catch {
      // 1×1 白图，避免整导出崩
      return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    }
  }
}

/** 检测截图右侧是否像「有 QR 白底」（避免再导出空右栏） */
function rightLooksLikeHasQr(canvas: HTMLCanvasElement): boolean {
  if (canvas.width < 40 || canvas.height < 20) return false;
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;
  const x0 = Math.floor(canvas.width * 0.82);
  const w = canvas.width - x0;
  const h = canvas.height;
  const data = ctx.getImageData(x0, 0, w, h).data;
  let white = 0;
  let dark = 0;
  let total = 0;
  // 抽样
  for (let i = 0; i < data.length; i += 16) {
    total++;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 230 && g > 230 && b > 230) white++;
    if (r < 60 && g < 60 && b < 60) dark++;
  }
  if (total === 0) return false;
  // 右栏应同时有白（QR 托盘）和深色（模块或背景）
  return white / total > 0.04 && dark / total > 0.02;
}

/**
 * 主路径：内联 HTML 条 + 视口内截图（不屏外 -16000，不丢右栏）
 *
 * 关键：以 designWidthPx（= 屏幕预览宽）渲染 DOM，用 pixelRatio 放大到
 * targetWidthPx（= 印刷像素宽）。版式比例恒等于屏幕所见，只是分辨率更高。
 */
export async function captureTicketsFromDom(opts: {
  tickets: DomTicketExportInput[];
  /** 输出 canvas 的像素宽（印刷宽 mm → px） */
  targetWidthPx: number;
  /** DOM 渲染宽度（CSS px），默认取屏幕预览宽 */
  designWidthPx?: number;
  /** 截图放大上限，防显存爆掉 */
  maxPixelRatio?: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<HTMLCanvasElement[]> {
  const { tickets } = opts;
  if (!tickets.length) return [];

  const designW =
    opts.designWidthPx && opts.designWidthPx >= 320
      ? Math.round(opts.designWidthPx)
      : STRIP_DESIGN_WIDTH_PX;
  const targetW = Math.max(designW, Math.round(opts.targetWidthPx));
  const pixelRatio = Math.min(
    opts.maxPixelRatio ?? 4,
    Math.max(1, targetW / designW)
  );
  const widthPx = designW;

  // 预生成全部 QR
  const qrMap = new Map<string, string>();
  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    qrMap.set(t.code, await makeQrDataUrl(t.code, t.claimUrl));
  }

  // 视口内、几乎透明的宿主 —— 浏览器会真实绘制，html-to-image 才能截到右栏
  const host = document.createElement("div");
  host.setAttribute("data-physical-export-host", "inline");
  host.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    `width:${widthPx}px`,
    "opacity:0.01",
    "pointer-events:none",
    "z-index:2147483000",
    "background:#ffffff",
    "overflow:visible",
  ].join(";");
  document.body.appendChild(host);

  const out: HTMLCanvasElement[] = [];
  try {
    for (let i = 0; i < tickets.length; i++) {
      const t = tickets[i];
      host.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.style.cssText = `width:${widthPx}px;max-width:none;margin:0;padding:0;box-sizing:border-box;background:#fff;`;
      const strip = buildInlineStripElement({
        ...t,
        qrDataUrl: qrMap.get(t.code) || "",
      });
      wrap.appendChild(strip);
      host.appendChild(wrap);

      await wait(30);
      await waitImages(wrap);
      await wait(30);

      const naturalH = Math.max(wrap.scrollHeight, wrap.offsetHeight, 120);
      const canvas = await toCanvas(wrap, {
        width: widthPx,
        height: naturalH,
        pixelRatio,
        cacheBust: true,
        backgroundColor: "#ffffff",
        style: {
          width: `${widthPx}px`,
          height: `${naturalH}px`,
          margin: "0",
          transform: "none",
          maxWidth: "none",
        },
      });

      let final = scaleCanvasToWidth(canvas, targetW);

      if (!rightLooksLikeHasQr(final)) {
        console.warn("QR column missing in capture, retry once", t.code);
        await wait(80);
        await waitImages(wrap);
        const retry = await toCanvas(wrap, {
          width: widthPx,
          height: naturalH,
          pixelRatio: Math.max(2, pixelRatio),
          cacheBust: true,
          backgroundColor: "#ffffff",
          style: {
            width: `${widthPx}px`,
            height: `${naturalH}px`,
            margin: "0",
            transform: "none",
          },
        });
        final = scaleCanvasToWidth(retry, targetW);
      }

      out.push(final);
      opts.onProgress?.(i + 1, tickets.length);
    }
  } finally {
    host.remove();
  }

  return out;
}

/** 兼容旧名：live 截图不再作为主路径 */
export async function captureLiveTicketStrips(opts: {
  codes: string[];
  widthPx: number;
  pixelRatio?: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<HTMLCanvasElement[]> {
  // 退化为：要求调用方走 captureTicketsFromDom
  throw new Error(
    `captureLiveTicketStrips deprecated (${opts.codes.length} codes)`
  );
}

/**
 * 把一组票 canvas 叠成「一整页」大图（调用方已保证这组能装下）。
 */
export function composeTicketSheet(opts: {
  tickets: HTMLCanvasElement[];
  gapPx: number;
  marginPx: number;
  pageWidthPx: number;
  background?: string;
}): HTMLCanvasElement {
  const {
    tickets,
    gapPx,
    marginPx,
    pageWidthPx,
    background = "#f1f5f9",
  } = opts;
  const contentH =
    tickets.reduce((s, c) => s + c.height, 0) +
    Math.max(0, tickets.length - 1) * gapPx;
  const sheet = document.createElement("canvas");
  sheet.width = pageWidthPx;
  sheet.height = contentH + marginPx * 2;
  const ctx = sheet.getContext("2d");
  if (!ctx) return sheet;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  let y = marginPx;
  for (const c of tickets) {
    const x = Math.max(0, Math.round((pageWidthPx - c.width) / 2));
    ctx.drawImage(c, x, y);
    y += c.height + gapPx;
  }
  return sheet;
}

/**
 * 把单张票 canvas 按「不截断」规则叠进多页大图。
 */
export function packTicketCanvasesIntoPages(opts: {
  tickets: HTMLCanvasElement[];
  maxPageHeightPx: number;
  gapPx: number;
  marginPx: number;
  pageWidthPx: number;
  background?: string;
}): HTMLCanvasElement[] {
  const {
    tickets,
    maxPageHeightPx,
    gapPx,
    marginPx,
    pageWidthPx,
    background = "#f8fafc",
  } = opts;
  if (!tickets.length) return [];

  const contentW = Math.max(1, pageWidthPx - marginPx * 2);
  const normalized = tickets.map((t) =>
    t.width === contentW ? t : scaleCanvasToWidth(t, contentW)
  );

  const pages: HTMLCanvasElement[][] = [];
  let cur: HTMLCanvasElement[] = [];
  let curH = marginPx * 2;

  for (const t of normalized) {
    const need = t.height + (cur.length ? gapPx : 0);
    if (cur.length > 0 && curH + need > maxPageHeightPx) {
      pages.push(cur);
      cur = [];
      curH = marginPx * 2;
    }
    if (cur.length === 0 && t.height + marginPx * 2 > maxPageHeightPx) {
      pages.push([t]);
      continue;
    }
    cur.push(t);
    curH += need;
  }
  if (cur.length) pages.push(cur);

  return pages.map((group) =>
    composeTicketSheet({
      tickets: group,
      gapPx,
      marginPx,
      pageWidthPx,
      background,
    })
  );
}

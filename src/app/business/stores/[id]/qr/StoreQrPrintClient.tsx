"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type LayoutId = "tent" | "poster" | "sticker";

/**
 * 系统模版：台卡 / 海报 / 贴纸（非自由设计）
 * 与顾客扫码后的「本店页」叙事一致：进店领券/活动
 */
export function StoreQrPrintClient({
  lang,
  storeId,
  storeName,
  address,
  publicUrl,
  businessName,
  businessLogo,
}: {
  lang: "zh" | "en";
  storeId: string;
  storeName: string;
  address: string | null;
  publicUrl: string;
  businessName: string | null;
  businessLogo: string | null;
}) {
  const [layout, setLayout] = useState<LayoutId>("tent");
  const [busy, setBusy] = useState(false);

  const qrSrc = `/api/store/qr?storeId=${encodeURIComponent(storeId)}&format=png&size=640`;
  const pngDownload = `/api/store/qr?storeId=${encodeURIComponent(storeId)}&format=png&size=1024&download=1`;

  const headline =
    lang === "en" ? "Scan for deals & rewards" : "扫码领优惠 · 进本店";
  const sub =
    lang === "en"
      ? "Vouchers · lucky draw · member perks at this outlet"
      : "本店代金券 · 抽奖活动 · 会员权益";
  const onlyHere =
    lang === "en" ? "This store only" : "仅限本店扫码有效";

  const layouts: {
    id: LayoutId;
    labelZh: string;
    labelEn: string;
    hintZh: string;
    hintEn: string;
  }[] = [
    {
      id: "tent",
      labelZh: "吧台台卡",
      labelEn: "Counter tent",
      hintZh: "竖版 · 放收银台 / 桌面",
      hintEn: "Portrait · counter / table",
    },
    {
      id: "poster",
      labelZh: "墙面海报",
      labelEn: "Wall poster",
      hintZh: "更大标题 · 贴入口 / 玻璃",
      hintEn: "Larger title · door / glass",
    },
    {
      id: "sticker",
      labelZh: "方形贴纸",
      labelEn: "Square sticker",
      hintZh: "1:1 · 小面积粘贴",
      hintEn: "1:1 · small stickers",
    },
  ];

  const downloadBrandedPng = useCallback(async () => {
    setBusy(true);
    try {
      await drawStoreQrPng({
        layout,
        storeName,
        address,
        businessName: businessName || storeName,
        businessLogo,
        publicUrl,
        qrSrc,
        headline,
        sub,
        onlyHere,
        lang,
      });
    } catch (e) {
      console.error(e);
      alert(lang === "en" ? "Export failed" : "导出失败");
    }
    setBusy(false);
  }, [
    address,
    businessLogo,
    businessName,
    headline,
    lang,
    layout,
    onlyHere,
    publicUrl,
    qrSrc,
    storeName,
    sub,
  ]);

  return (
    <div className="px-4 mt-4 space-y-4">
      {/* Layout picker */}
      <div className="print:hidden">
        <p className="text-xs font-medium text-slate-500 mb-2">
          {lang === "en" ? "Print layout (system templates)" : "印刷版式（系统模版）"}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {layouts.map((L) => (
            <button
              key={L.id}
              type="button"
              onClick={() => setLayout(L.id)}
              className={cn(
                "rounded-xl border p-2.5 text-left transition-colors",
                layout === L.id
                  ? "border-[#1A6EFF] bg-blue-50/70"
                  : "border-slate-100 hover:border-slate-200"
              )}
            >
              <p className="text-xs font-semibold text-slate-900">
                {lang === "en" ? L.labelEn : L.labelZh}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                {lang === "en" ? L.hintEn : L.hintZh}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="print:hidden flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-9 items-center rounded-full bg-[#1A6EFF] px-4 text-xs font-semibold text-white"
        >
          {lang === "en" ? "Print / Save PDF" : "打印 / 存为 PDF"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={downloadBrandedPng}
          className="inline-flex h-9 items-center rounded-full bg-slate-900 px-4 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy
            ? "…"
            : lang === "en"
              ? "Download branded PNG"
              : "下载带品牌 PNG"}
        </button>
        <a
          href={pngDownload}
          download
          className="inline-flex h-9 items-center rounded-full bg-slate-100 px-4 text-xs font-semibold text-slate-700"
        >
          {lang === "en" ? "QR only PNG" : "仅二维码 PNG"}
        </a>
        <a
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center rounded-full border border-slate-200 px-4 text-xs font-semibold text-slate-600"
        >
          {lang === "en" ? "Preview customer page" : "预览顾客页"}
        </a>
      </div>

      {/* What customer sees after scan */}
      <div className="print:hidden rounded-2xl border border-slate-100 bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-800">
          {lang === "en" ? "After scan → customer sees" : "顾客扫码后看到"}
        </p>
        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
          {lang === "en"
            ? "Store page with your brand, active vouchers & campaigns for this outlet. Ask them to log in to claim."
            : "进入本店顾客页：品牌、本店可用代金券与活动。引导登录后领券/参与。"}
        </p>
        <p className="text-[10px] font-mono text-slate-400 break-all mt-2">
          {publicUrl}
        </p>
        {!businessLogo && (
          <p className="text-[11px] text-amber-700 mt-2">
            {lang === "en" ? (
              <>
                Tip:{" "}
                <Link href="/business/settings" className="underline font-medium">
                  upload brand logo
                </Link>{" "}
                so print & customer page look consistent.
              </>
            ) : (
              <>
                建议先{" "}
                <Link href="/business/settings" className="underline font-medium">
                  上传品牌 Logo
                </Link>
                ，印刷与顾客页更统一。
              </>
            )}
          </p>
        )}
      </div>

      {/* Printable sheet */}
      <div className="flex justify-center print:block">
        <StoreQrSheet
          layout={layout}
          storeName={storeName}
          address={address}
          businessName={businessName}
          businessLogo={businessLogo}
          publicUrl={publicUrl}
          qrSrc={qrSrc}
          headline={headline}
          sub={sub}
          onlyHere={onlyHere}
        />
      </div>

      <p className="print:hidden text-[11px] text-slate-400 text-center leading-relaxed pb-4">
        {lang === "en"
          ? "Print tip: use colour if possible; keep QR unobstructed and ≥ 4cm wide."
          : "打印建议：尽量彩色；二维码无遮挡，边长建议 ≥ 4cm，放在光线充足处。"}
      </p>
    </div>
  );
}

function StoreQrSheet({
  layout,
  storeName,
  address,
  businessName,
  businessLogo,
  publicUrl,
  qrSrc,
  headline,
  sub,
  onlyHere,
}: {
  layout: LayoutId;
  storeName: string;
  address: string | null;
  businessName: string | null;
  businessLogo: string | null;
  publicUrl: string;
  qrSrc: string;
  headline: string;
  sub: string;
  onlyHere: string;
}) {
  if (layout === "sticker") {
    return (
      <div className="w-full max-w-[320px] aspect-square rounded-3xl border-2 border-slate-200 bg-white p-6 flex flex-col items-center justify-between print:border-slate-400 shadow-sm">
        <div className="flex items-center gap-2 w-full">
          {businessLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={businessLogo}
              alt=""
              className="w-10 h-10 object-contain rounded-lg border"
            />
          ) : (
            <span className="text-2xl">🏪</span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{storeName}</p>
            <p className="text-[10px] text-slate-400 truncate">
              {businessName || "WeMembers"}
            </p>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrSrc}
          alt="QR"
          className="w-44 h-44 rounded-2xl border border-slate-100"
        />
        <div className="text-center w-full">
          <p className="text-sm font-bold text-[#1A6EFF]">{headline}</p>
          <p className="text-[10px] text-red-600/80 font-semibold mt-1">
            {onlyHere}
          </p>
        </div>
      </div>
    );
  }

  if (layout === "poster") {
    return (
      <div className="w-full max-w-[400px] rounded-2xl overflow-hidden border border-slate-200 print:border-slate-400 shadow-sm bg-white">
        <div className="bg-gradient-to-br from-[#1A6EFF] to-[#3B82F6] px-6 pt-8 pb-6 text-white text-center">
          {businessLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={businessLogo}
              alt=""
              className="w-16 h-16 object-contain rounded-2xl bg-white mx-auto p-1"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-white/20 mx-auto flex items-center justify-center text-3xl">
              🏪
            </div>
          )}
          <h1 className="text-2xl font-bold mt-4">{storeName}</h1>
          {businessName && (
            <p className="text-white/70 text-sm mt-1">{businessName}</p>
          )}
          {address && (
            <p className="text-white/60 text-xs mt-2">📍 {address}</p>
          )}
        </div>
        <div className="px-6 py-6 text-center">
          <p className="text-lg font-bold text-slate-900">{headline}</p>
          <p className="text-xs text-slate-500 mt-1">{sub}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrSrc}
            alt="QR"
            className="w-56 h-56 mx-auto mt-5 rounded-2xl border border-slate-100 bg-white p-2"
          />
          <p className="text-sm font-semibold text-red-600 mt-4">{onlyHere}</p>
          <p className="text-[9px] font-mono text-slate-400 break-all mt-3 px-2">
            {publicUrl}
          </p>
          <p className="text-[10px] text-slate-300 mt-4 tracking-widest uppercase">
            WeMembers
          </p>
        </div>
      </div>
    );
  }

  // tent — default counter card
  return (
    <div className="w-full max-w-[360px] rounded-2xl border border-slate-200 print:border-slate-400 bg-white shadow-sm overflow-hidden">
      <div className="px-5 pt-5 pb-2 text-center">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-amber-700/90 uppercase">
          WeMembers
        </p>
        <div className="flex items-center justify-center gap-2 mt-3">
          {businessLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={businessLogo}
              alt=""
              className="w-12 h-12 object-contain rounded-xl border border-slate-100"
            />
          ) : null}
          <div className="text-left min-w-0">
            <h1 className="text-lg font-bold text-slate-900 leading-tight">
              {storeName}
            </h1>
            {businessName && (
              <p className="text-[11px] text-slate-400 truncate">{businessName}</p>
            )}
          </div>
        </div>
        {address && (
          <p className="text-[11px] text-slate-400 mt-2">📍 {address}</p>
        )}
      </div>
      <div className="px-5 py-3 flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrSrc}
          alt="QR"
          className="w-52 h-52 rounded-2xl border border-slate-100 bg-white p-2"
        />
      </div>
      <div className="px-5 pb-5 text-center">
        <p className="text-base font-bold text-[#1A6EFF]">{headline}</p>
        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{sub}</p>
        <p className="text-xs font-semibold text-red-600/90 mt-2">{onlyHere}</p>
        <p className="text-[9px] font-mono text-slate-400 break-all mt-3">
          {publicUrl}
        </p>
      </div>
    </div>
  );
}

async function drawStoreQrPng(opts: {
  layout: LayoutId;
  storeName: string;
  address: string | null;
  businessName: string;
  businessLogo: string | null;
  publicUrl: string;
  qrSrc: string;
  headline: string;
  sub: string;
  onlyHere: string;
  lang: "zh" | "en";
}) {
  const w = opts.layout === "sticker" ? 1080 : 1080;
  const h =
    opts.layout === "sticker" ? 1080 : opts.layout === "poster" ? 1520 : 1400;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  if (opts.layout === "poster") {
    const g = ctx.createLinearGradient(0, 0, w, 420);
    g.addColorStop(0, "#1A6EFF");
    g.addColorStop(1, "#3B82F6");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, 420);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 56px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(opts.storeName.slice(0, 24), w / 2, 200);
    ctx.font = "28px system-ui,sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(opts.businessName.slice(0, 36), w / 2, 260);
    if (opts.address) {
      ctx.font = "24px system-ui,sans-serif";
      ctx.fillText(`📍 ${opts.address}`.slice(0, 48), w / 2, 320);
    }
  } else {
    ctx.fillStyle = "#b45309";
    ctx.font = "bold 22px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("WEMEMBERS", w / 2, 80);
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 48px system-ui,sans-serif";
    ctx.fillText(opts.storeName.slice(0, 28), w / 2, 160);
    ctx.fillStyle = "#64748b";
    ctx.font = "26px system-ui,sans-serif";
    ctx.fillText(opts.businessName.slice(0, 36), w / 2, 210);
  }

  try {
    const qr = await loadImage(opts.qrSrc);
    const qrSize = opts.layout === "sticker" ? 520 : 560;
    const qx = (w - qrSize) / 2;
    const qy = opts.layout === "poster" ? 480 : opts.layout === "sticker" ? 280 : 300;
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(qx - 16, qy - 16, qrSize + 32, qrSize + 32);
    ctx.drawImage(qr, qx, qy, qrSize, qrSize);
  } catch {
    /* ignore */
  }

  const textY = opts.layout === "poster" ? 1120 : opts.layout === "sticker" ? 880 : 980;
  ctx.textAlign = "center";
  ctx.fillStyle = "#1A6EFF";
  ctx.font = "bold 40px system-ui,sans-serif";
  ctx.fillText(opts.headline.slice(0, 28), w / 2, textY);
  ctx.fillStyle = "#64748b";
  ctx.font = "26px system-ui,sans-serif";
  ctx.fillText(opts.sub.slice(0, 40), w / 2, textY + 50);
  ctx.fillStyle = "#dc2626";
  ctx.font = "bold 28px system-ui,sans-serif";
  ctx.fillText(opts.onlyHere, w / 2, textY + 100);

  if (opts.businessLogo) {
    try {
      const logo = await loadImage(opts.businessLogo);
      const ls = 96;
      ctx.drawImage(
        logo,
        opts.layout === "poster" ? w / 2 - ls / 2 : 80,
        opts.layout === "poster" ? 80 : 100,
        ls,
        ls
      );
    } catch {
      /* ignore cors */
    }
  }

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${opts.storeName.replace(/\s+/g, "-").slice(0, 24)}-qr-${opts.layout}.png`;
  a.click();
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

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type LayoutId = "tent" | "poster" | "sticker";

type Distributor = {
  userId: string;
  label: string;
  kind: "store" | "staff" | "promoter" | "business";
  phone?: string | null;
  storeName?: string | null;
};

export function CampaignPrintClient({
  lang,
  campaignId,
  campaignName,
  slug,
  type,
  description,
  color,
  status,
  endDate,
  businessName,
  businessLogo,
  businessUserId,
  stores,
}: {
  lang: "zh" | "en";
  campaignId: string;
  campaignName: string;
  slug: string;
  type: string;
  description: string | null;
  color: string | null;
  status: string;
  endDate: string;
  businessName: string | null;
  businessLogo: string | null;
  businessUserId: string;
  stores: { id: string; name: string }[];
}) {
  const [layout, setLayout] = useState<LayoutId>("tent");
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [sellerId, setSellerId] = useState(""); // empty = store generic
  const [phoneLookup, setPhoneLookup] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || "";

  const buyUrl = useMemo(() => {
    const base = `${origin}/voucher/${encodeURIComponent(slug)}`;
    return sellerId
      ? `${base}?seller=${encodeURIComponent(sellerId)}`
      : base;
  }, [origin, slug, sellerId]);

  const qrSrc = useMemo(() => {
    const q = new URLSearchParams({
      slug,
      size: "640",
      format: "png",
    });
    if (sellerId) q.set("seller", sellerId);
    return `/api/campaign/qr?${q.toString()}`;
  }, [slug, sellerId]);

  const selected = distributors.find((d) => d.userId === sellerId);
  const distLabel =
    !sellerId
      ? lang === "en"
        ? "In-store (no personal commission)"
        : "店内通用（无个人佣金）"
      : selected?.label || (lang === "en" ? "Distributor" : "分发人");

  useEffect(() => {
    (async () => {
      const res = await fetch(
        `/api/business/campaigns/${campaignId}/distributors`
      );
      const j = await res.json();
      if (res.ok) setDistributors(j.data?.distributors || []);
    })();
  }, [campaignId]);

  async function lookupPhone() {
    setLookupBusy(true);
    setErr("");
    try {
      const res = await fetch(
        `/api/business/campaigns/${campaignId}/distributors`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: phoneLookup }),
        }
      );
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error || "查找失败");
      } else {
        const row = j.data as Distributor;
        setDistributors((prev) =>
          prev.some((p) => p.userId === row.userId) ? prev : [...prev, row]
        );
        setSellerId(row.userId);
        setPhoneLookup("");
      }
    } catch {
      setErr(lang === "en" ? "Network error" : "网络错误");
    }
    setLookupBusy(false);
  }

  const isDraw = type === "lucky_draw_v2" || type === "lucky_draw";
  const headline = isDraw
    ? lang === "en"
      ? "Scan to join lucky draw"
      : "扫码参加抽奖"
    : lang === "en"
      ? "Scan to buy voucher"
      : "扫码购买代金券";
  const sub = isDraw
    ? lang === "en"
      ? "Buy voucher · win prizes · redeem in store"
      : "购券抽奖 · 到店核销 · 赢取奖品"
    : lang === "en"
      ? "Exclusive voucher · redeem at this brand"
      : "专属代金券 · 到店核销";

  const layouts: { id: LayoutId; zh: string; en: string }[] = [
    { id: "tent", zh: "餐桌台卡", en: "Table tent" },
    { id: "poster", zh: "吧台海报", en: "Counter poster" },
    { id: "sticker", zh: "方形贴纸", en: "Square sticker" },
  ];

  const downloadBranded = useCallback(async () => {
    setBusy(true);
    try {
      await drawCampaignCardPng({
        layout,
        campaignName,
        businessName: businessName || "Store",
        businessLogo,
        buyUrl,
        qrSrc,
        headline,
        sub,
        distLabel,
        isDist: Boolean(sellerId),
        accent: color || "#1A6EFF",
        lang,
      });
    } catch (e) {
      console.error(e);
      alert(lang === "en" ? "Export failed" : "导出失败");
    }
    setBusy(false);
  }, [
    businessLogo,
    businessName,
    buyUrl,
    campaignName,
    color,
    distLabel,
    headline,
    lang,
    layout,
    qrSrc,
    sellerId,
    sub,
  ]);

  return (
    <div className="px-4 mt-4 space-y-4">
      {/* 与实体券对齐说明 */}
      <div className="print:hidden rounded-xl border border-slate-100 bg-slate-50 p-3 text-[11px] text-slate-600 leading-relaxed">
        <p className="font-semibold text-slate-800">
          {lang === "en" ? "How this differs from paper tickets" : "与实体券对齐说明"}
        </p>
        <ul className="mt-1 space-y-0.5 list-disc pl-4">
          <li>
            {lang === "en"
              ? "Activity card = entry link (many people can scan the same code)"
              : "活动卡 = 入口链接（同一码可被多人扫）"}
          </li>
          <li>
            {lang === "en"
              ? "Physical ticket PT- = one entitlement per code"
              : "实体券 PT- = 一码一份权益，一次用完"}
          </li>
          <li>
            {lang === "en"
              ? "Distributor version adds ?seller= for commission on redeem"
              : "分发版带 seller，顾客购券并核销后计推广佣金"}
          </li>
        </ul>
        <Link
          href="/business/physical"
          className="inline-block mt-2 text-[#1A6EFF] font-medium"
        >
          {lang === "en" ? "Print physical tickets →" : "去印实体券 →"}
        </Link>
      </div>

      {/* Distributor */}
      <div className="print:hidden space-y-2">
        <p className="text-xs font-medium text-slate-500">
          {lang === "en" ? "Version" : "版本 · 分发账号绑定"}
        </p>
        <select
          value={sellerId}
          onChange={(e) => setSellerId(e.target.value)}
          className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm"
        >
          {distributors.map((d) => (
            <option key={d.userId || "store"} value={d.userId}>
              {d.kind === "store"
                ? lang === "en"
                  ? "In-store generic (no personal seller)"
                  : d.label
                : `${d.label}${d.storeName ? ` · ${d.storeName}` : ""}${
                    d.phone ? ` · ${d.phone}` : ""
                  } [${d.kind}]`}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Input
            placeholder={
              lang === "en"
                ? "Add distributor by phone"
                : "手机号查找分发人（店员/推广人）"
            }
            value={phoneLookup}
            onChange={(e) => setPhoneLookup(e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            size="sm"
            loading={lookupBusy}
            onClick={lookupPhone}
          >
            {lang === "en" ? "Add" : "添加"}
          </Button>
        </div>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <p className="text-[10px] text-slate-400 font-mono break-all">{buyUrl}</p>
      </div>

      {/* Layout */}
      <div className="print:hidden">
        <p className="text-xs font-medium text-slate-500 mb-2">
          {lang === "en" ? "Print layout" : "印刷版式"}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {layouts.map((L) => (
            <button
              key={L.id}
              type="button"
              onClick={() => setLayout(L.id)}
              className={cn(
                "rounded-xl border p-2.5 text-xs font-semibold",
                layout === L.id
                  ? "border-[#1A6EFF] bg-blue-50 text-[#1A6EFF]"
                  : "border-slate-100 text-slate-600"
              )}
            >
              {lang === "en" ? L.en : L.zh}
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
          onClick={downloadBranded}
          className="inline-flex h-9 items-center rounded-full bg-slate-900 px-4 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "…" : lang === "en" ? "Download PNG" : "下载品牌 PNG"}
        </button>
        <a
          href={buyUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center rounded-full border border-slate-200 px-4 text-xs font-semibold text-slate-600"
        >
          {lang === "en" ? "Open activity page" : "打开活动页"}
        </a>
      </div>

      {status !== "active" && (
        <p className="print:hidden text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
          {lang === "en"
            ? "Campaign is not active — customers may not complete purchase until active."
            : "活动非进行中：顾客可能无法完成购买，请先发布活动。"}
        </p>
      )}

      <div className="flex justify-center print:block">
        <CampaignCardSheet
          layout={layout}
          campaignName={campaignName}
          businessName={businessName}
          businessLogo={businessLogo}
          buyUrl={buyUrl}
          qrSrc={qrSrc}
          headline={headline}
          sub={sub}
          distLabel={distLabel}
          isDist={Boolean(sellerId)}
          accent={color || "#1A6EFF"}
          endDate={endDate}
          lang={lang}
        />
      </div>

      {stores.length > 0 && (
        <p className="print:hidden text-[11px] text-slate-400 text-center">
          {lang === "en"
            ? `Your stores: ${stores.map((s) => s.name).join(", ")}`
            : `你的门店：${stores.map((s) => s.name).join("、")}`}
        </p>
      )}
    </div>
  );
}

function CampaignCardSheet({
  layout,
  campaignName,
  businessName,
  businessLogo,
  buyUrl,
  qrSrc,
  headline,
  sub,
  distLabel,
  isDist,
  accent,
  endDate,
  lang,
}: {
  layout: LayoutId;
  campaignName: string;
  businessName: string | null;
  businessLogo: string | null;
  buyUrl: string;
  qrSrc: string;
  headline: string;
  sub: string;
  distLabel: string;
  isDist: boolean;
  accent: string;
  endDate: string;
  lang: "zh" | "en";
}) {
  const valid = new Date(endDate).toLocaleDateString(
    lang === "en" ? "en-SG" : "zh-CN"
  );

  if (layout === "sticker") {
    return (
      <div className="w-full max-w-[320px] aspect-square rounded-3xl border-2 border-slate-200 bg-white p-5 flex flex-col items-center justify-between shadow-sm print:border-slate-400">
        <div className="w-full flex items-center gap-2">
          {businessLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={businessLogo}
              alt=""
              className="w-10 h-10 object-contain rounded-lg border"
            />
          ) : (
            <span className="text-2xl">🎰</span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{campaignName}</p>
            <p className="text-[10px] text-slate-400 truncate">
              {businessName}
            </p>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrSrc} alt="QR" className="w-40 h-40 rounded-xl border" />
        <div className="text-center w-full">
          <p className="text-sm font-bold" style={{ color: accent }}>
            {headline}
          </p>
          {isDist && (
            <p className="text-[10px] font-semibold text-amber-700 mt-1">
              {lang === "en" ? "Via" : "分发"} · {distLabel}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (layout === "poster") {
    return (
      <div className="w-full max-w-[400px] rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white print:border-slate-400">
        <div
          className="px-6 pt-8 pb-6 text-white text-center"
          style={{
            background: `linear-gradient(145deg, ${accent} 0%, #1e293b 100%)`,
          }}
        >
          {businessLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={businessLogo}
              alt=""
              className="w-16 h-16 object-contain rounded-2xl bg-white mx-auto p-1"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-white/20 mx-auto flex items-center justify-center text-3xl">
              🎰
            </div>
          )}
          <h1 className="text-xl font-bold mt-4">{campaignName}</h1>
          {businessName && (
            <p className="text-white/70 text-sm mt-1">{businessName}</p>
          )}
          {isDist && (
            <p className="mt-2 inline-block px-3 py-0.5 rounded-full bg-white/20 text-xs font-semibold">
              {lang === "en" ? "Distributed by" : "分发"} · {distLabel}
            </p>
          )}
        </div>
        <div className="px-6 py-6 text-center">
          <p className="text-lg font-bold text-slate-900">{headline}</p>
          <p className="text-xs text-slate-500 mt-1">{sub}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrSrc}
            alt="QR"
            className="w-52 h-52 mx-auto mt-4 rounded-2xl border p-2 bg-white"
          />
          <p className="text-xs text-slate-400 mt-3">
            {lang === "en" ? "Until" : "活动至"} {valid}
          </p>
          <p className="text-[9px] font-mono text-slate-400 break-all mt-2">
            {buyUrl}
          </p>
          <p className="text-[10px] text-slate-300 mt-4 tracking-widest uppercase">
            WeMembers
          </p>
        </div>
      </div>
    );
  }

  // tent
  return (
    <div className="w-full max-w-[360px] rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden print:border-slate-400">
      <div className="px-5 pt-5 pb-2 text-center">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-amber-700/90 uppercase">
          WeMembers · {lang === "en" ? "Activity" : "活动"}
        </p>
        <div className="flex items-center justify-center gap-2 mt-3">
          {businessLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={businessLogo}
              alt=""
              className="w-12 h-12 object-contain rounded-xl border"
            />
          ) : null}
          <div className="text-left min-w-0">
            <h1 className="text-lg font-bold text-slate-900 leading-tight">
              {campaignName}
            </h1>
            {businessName && (
              <p className="text-[11px] text-slate-400">{businessName}</p>
            )}
          </div>
        </div>
        {isDist && (
          <p className="mt-2 text-[11px] font-semibold text-amber-800 bg-amber-50 inline-block px-2 py-0.5 rounded-full">
            {lang === "en" ? "Via" : "分发"} · {distLabel}
          </p>
        )}
      </div>
      <div className="px-5 py-3 flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrSrc}
          alt="QR"
          className="w-52 h-52 rounded-2xl border p-2 bg-white"
        />
      </div>
      <div className="px-5 pb-5 text-center">
        <p className="text-base font-bold" style={{ color: accent }}>
          {headline}
        </p>
        <p className="text-[11px] text-slate-500 mt-1">{sub}</p>
        <p className="text-[10px] text-slate-400 mt-2">
          {lang === "en" ? "Until" : "活动至"} {valid}
        </p>
        <p className="text-[9px] font-mono text-slate-400 break-all mt-2">
          {buyUrl}
        </p>
      </div>
    </div>
  );
}

async function drawCampaignCardPng(opts: {
  layout: LayoutId;
  campaignName: string;
  businessName: string;
  businessLogo: string | null;
  buyUrl: string;
  qrSrc: string;
  headline: string;
  sub: string;
  distLabel: string;
  isDist: boolean;
  accent: string;
  lang: "zh" | "en";
}) {
  const w = 1080;
  const h = opts.layout === "sticker" ? 1080 : 1480;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);

  if (opts.layout === "poster") {
    const g = ctx.createLinearGradient(0, 0, w, 400);
    g.addColorStop(0, opts.accent);
    g.addColorStop(1, "#1e293b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, 400);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "bold 52px system-ui,sans-serif";
    ctx.fillText(opts.campaignName.slice(0, 22), w / 2, 180);
    ctx.font = "28px system-ui,sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(opts.businessName.slice(0, 36), w / 2, 240);
    if (opts.isDist) {
      ctx.font = "bold 26px system-ui,sans-serif";
      ctx.fillText(
        `${opts.lang === "en" ? "Via" : "分发"} · ${opts.distLabel}`.slice(
          0,
          40
        ),
        w / 2,
        300
      );
    }
  } else {
    ctx.textAlign = "center";
    ctx.fillStyle = "#b45309";
    ctx.font = "bold 22px system-ui,sans-serif";
    ctx.fillText("WEMEMBERS · ACTIVITY", w / 2, 80);
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 48px system-ui,sans-serif";
    ctx.fillText(opts.campaignName.slice(0, 24), w / 2, 160);
    ctx.fillStyle = "#64748b";
    ctx.font = "26px system-ui,sans-serif";
    ctx.fillText(opts.businessName.slice(0, 36), w / 2, 210);
    if (opts.isDist) {
      ctx.fillStyle = "#b45309";
      ctx.font = "bold 28px system-ui,sans-serif";
      ctx.fillText(
        `${opts.lang === "en" ? "Via" : "分发"} · ${opts.distLabel}`.slice(
          0,
          36
        ),
        w / 2,
        260
      );
    }
  }

  try {
    const qr = await loadImage(opts.qrSrc);
    const qrSize = 560;
    const qx = (w - qrSize) / 2;
    const qy = opts.layout === "poster" ? 460 : opts.layout === "sticker" ? 300 : 340;
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(qx - 12, qy - 12, qrSize + 24, qrSize + 24);
    ctx.drawImage(qr, qx, qy, qrSize, qrSize);
  } catch {
    /* ignore */
  }

  const ty = opts.layout === "poster" ? 1120 : opts.layout === "sticker" ? 900 : 1000;
  ctx.textAlign = "center";
  ctx.fillStyle = opts.accent;
  ctx.font = "bold 40px system-ui,sans-serif";
  ctx.fillText(opts.headline.slice(0, 28), w / 2, ty);
  ctx.fillStyle = "#64748b";
  ctx.font = "26px system-ui,sans-serif";
  ctx.fillText(opts.sub.slice(0, 42), w / 2, ty + 48);

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${opts.campaignName.slice(0, 20)}-${opts.isDist ? "dist" : "store"}-${opts.layout}.png`;
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

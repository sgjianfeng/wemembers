"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  buildCampaignPosterCopy,
  fillShareTemplate,
  type CampaignPosterCopy,
} from "@/lib/campaign-poster-copy";
import {
  drawCampaignPosterPng,
  posterFilename,
  renderCampaignPosterDataUrl,
  triggerBlobDownload,
  zipCampaignPosterFiles,
  type CampaignPosterLayoutId,
} from "@/lib/campaign-poster-export";
import {
  THEME_SWATCHES,
  VISUAL_TEMPLATES,
  getVisualTemplate,
  isFestivalNdpCampaign,
  isNdpFestivalAccent,
  type ThemeColorId,
  type VisualTemplateId,
} from "@/lib/visual-templates";
import {
  SingaporeCrescentStars,
} from "@/components/campaign/SingaporeFlagBackdrop";
import { SG_NDP_RED } from "@/lib/visual-templates";

type LayoutId = CampaignPosterLayoutId;

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
  rulesSnapshot,
  voucherTiers,
  businessName,
  businessLogo,
  stores,
  tags = null,
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
  rulesSnapshot: string | null;
  voucherTiers: string | null;
  businessName: string | null;
  businessLogo: string | null;
  stores: { id: string; name: string }[];
  tags?: string | null;
}) {
  const isNdp = isFestivalNdpCampaign(type, campaignName, tags);
  const [layout, setLayout] = useState<LayoutId>("tent");
  const [templateId, setTemplateId] = useState<VisualTemplateId>(() => {
    if (isNdp) return "festival_ndp";
    if (type === "lucky_draw_v2" || type === "lucky_draw") return "store_bold";
    return "store_classic";
  });
  const [themeId, setThemeId] = useState<ThemeColorId | "campaign" | "custom">(
    () => {
      if (isNdp) return "ndp_red";
      if (color && /^#[0-9A-Fa-f]{6}$/.test(color)) return "campaign";
      return "orange";
    }
  );
  const [customSubline, setCustomSubline] = useState("");
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [sellerId, setSellerId] = useState("");
  const [phoneLookup, setPhoneLookup] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");
  const [err, setErr] = useState("");
  const [copiedShare, setCopiedShare] = useState<number | null>(null);

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || "";

  const buyUrl = useMemo(() => {
    if (isNdp) {
      const base = `${origin}/ndp/${encodeURIComponent(slug)}?from=table`;
      return sellerId
        ? `${base}&seller=${encodeURIComponent(sellerId)}`
        : base;
    }
    const base = `${origin}/voucher/${encodeURIComponent(slug)}`;
    return sellerId
      ? `${base}?seller=${encodeURIComponent(sellerId)}`
      : base;
  }, [origin, slug, sellerId, isNdp]);

  const qrSrc = useMemo(() => {
    const q = new URLSearchParams({
      slug,
      size: "640",
      format: "png",
    });
    if (sellerId) q.set("seller", sellerId);
    // 国庆/节日：确保接口走 NDP 落地与类型放行
    if (isNdp) q.set("ndp", "1");
    return `/api/campaign/qr?${q.toString()}`;
  }, [slug, sellerId, isNdp]);

  const copy: CampaignPosterCopy = useMemo(
    () =>
      buildCampaignPosterCopy({
        type,
        name: campaignName,
        endDate,
        rulesSnapshot,
        voucherTiers,
        description,
        lang,
        customSubline: customSubline || null,
        tags,
      }),
    [
      type,
      campaignName,
      endDate,
      rulesSnapshot,
      voucherTiers,
      description,
      lang,
      customSubline,
      tags,
    ]
  );

  const tplMeta = getVisualTemplate(templateId);
  const accent = useMemo(() => {
    if (themeId === "campaign" && color && /^#[0-9A-Fa-f]{6}$/.test(color)) {
      return color;
    }
    if (themeId === "custom") return color || tplMeta.defaultThemeHex;
    const sw = THEME_SWATCHES.find((s) => s.id === themeId);
    return sw?.hex || tplMeta.defaultThemeHex;
  }, [themeId, color, tplMeta.defaultThemeHex]);

  const surface = tplMeta.surface;

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

  const layouts: {
    id: LayoutId;
    zh: string;
    en: string;
    hintZh: string;
    hintEn: string;
  }[] = [
    {
      id: "tent",
      zh: "餐桌台卡",
      en: "Table tent",
      hintZh: "竖版 · 吧台/桌面",
      hintEn: "Portrait · counter",
    },
    {
      id: "poster",
      zh: "吧台海报",
      en: "Counter poster",
      hintZh: "大卖点 · 小展架",
      hintEn: "Big offer · small stand",
    },
    {
      id: "vhd",
      zh: "竖版招贴",
      en: "Portrait HD",
      hintZh: "1080×1920 · 屏显/电梯",
      hintEn: "1080×1920 · screens",
    },
    {
      id: "a4",
      zh: "A4 墙贴",
      en: "A4 wall",
      hintZh: "打印店 / 门贴",
      hintEn: "Print shop / door",
    },
    {
      id: "sticker",
      zh: "方形社交图",
      en: "Square social",
      hintZh: "1:1 · WA / IG",
      hintEn: "1:1 · WA / IG",
    },
  ];

  const exportOpts = useCallback(
    (sid: string, label: string) => {
      let url: string;
      if (isNdp) {
        const base = `${origin}/ndp/${encodeURIComponent(slug)}?from=table`;
        url = sid ? `${base}&seller=${encodeURIComponent(sid)}` : base;
      } else {
        const base = `${origin}/voucher/${encodeURIComponent(slug)}`;
        url = sid ? `${base}?seller=${encodeURIComponent(sid)}` : base;
      }
      const q = new URLSearchParams({
        slug,
        size: "640",
        format: "png",
      });
      if (sid) q.set("seller", sid);
      if (isNdp) q.set("ndp", "1");
      return {
        layout,
        campaignName,
        businessName: businessName || "Store",
        businessLogo,
        buyUrl: url,
        qrSrc: `/api/campaign/qr?${q.toString()}`,
        copy,
        distLabel: label,
        isDist: Boolean(sid),
        accent,
        surface,
        lang,
      };
    },
    [
      accent,
      businessLogo,
      businessName,
      campaignName,
      copy,
      isNdp,
      lang,
      layout,
      origin,
      slug,
      surface,
    ]
  );

  const downloadBranded = useCallback(async () => {
    setBusy(true);
    try {
      await drawCampaignPosterPng(exportOpts(sellerId, distLabel));
    } catch (e) {
      console.error(e);
      alert(lang === "en" ? "Export failed" : "导出失败");
    }
    setBusy(false);
  }, [distLabel, exportOpts, lang, sellerId]);

  /**
   * 打印/PDF：用 canvas 渲染品牌海报再打印（保证国庆红等背景色），
   * 避免 DOM 打印被浏览器洗成灰白。弹窗被拦时回退 window.print()。
   */
  const printBranded = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      const { dataUrl } = await renderCampaignPosterDataUrl(
        exportOpts(sellerId, distLabel)
      );
      const w = window.open("", "_blank", "noopener,noreferrer");
      if (!w) {
        // 弹窗被拦：至少触发页面打印
        window.print();
        return;
      }
      const title = campaignName.replace(/[<>&"]/g, "");
      w.document.open();
      w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>${title}</title>
<style>
  @page { margin: 8mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { display: flex; justify-content: center; align-items: flex-start; min-height: 100vh; }
  img { max-width: 100%; width: 180mm; height: auto; display: block; }
  @media print {
    body { background: #fff; }
    img { width: 100%; max-width: 190mm; }
  }
</style></head><body>
<img id="p" src="${dataUrl}" alt="${title}"/>
<script>
  const img = document.getElementById('p');
  function go() { setTimeout(function(){ window.focus(); window.print(); }, 120); }
  if (img.complete) go(); else img.onload = go;
</script>
</body></html>`);
      w.document.close();
    } catch (e) {
      console.error(e);
      setErr(lang === "en" ? "Print failed" : "打印失败，请改用下载 PNG");
      try {
        window.print();
      } catch {
        /* ignore */
      }
    }
    setBusy(false);
  }, [campaignName, distLabel, exportOpts, lang, sellerId]);

  const bulkDownloadDistributors = useCallback(async () => {
    const personal = distributors.filter((d) => d.userId);
    if (!personal.length) {
      alert(
        lang === "en"
          ? "No personal distributors yet. Add by phone or assign staff."
          : "暂无个人分发人。可用手机号添加，或先绑定店员。"
      );
      return;
    }
    setBulkBusy(true);
    try {
      const files: { filename: string; dataUrl: string }[] = [];
      for (let i = 0; i < personal.length; i++) {
        const d = personal[i];
        setBulkProgress(
          lang === "en"
            ? `Rendering ${i + 1}/${personal.length}…`
            : `生成 ${i + 1}/${personal.length}…`
        );
        const filename = posterFilename(
          campaignName,
          true,
          layout,
          d.label
        );
        const { dataUrl } = await renderCampaignPosterDataUrl(
          exportOpts(d.userId, d.label),
          filename
        );
        files.push({ filename, dataUrl });
      }
      setBulkProgress(lang === "en" ? "Packing ZIP…" : "打包 ZIP…");
      const blob = await zipCampaignPosterFiles(files);
      const zipBase = campaignName
        .replace(/[^\w\u4e00-\u9fff-]+/g, "-")
        .slice(0, 24);
      triggerBlobDownload(
        blob,
        `${zipBase || "campaign"}-distributors-${layout}.zip`
      );
      setBulkProgress(
        lang === "en"
          ? `Done · ZIP ${personal.length} PNGs`
          : `完成 · ZIP 含 ${personal.length} 张 PNG`
      );
    } catch (e) {
      console.error(e);
      alert(lang === "en" ? "Bulk export failed" : "批量导出失败");
    }
    setBulkBusy(false);
    setTimeout(() => setBulkProgress(""), 4000);
  }, [campaignName, distributors, exportOpts, lang, layout]);

  async function copyShare(idx: number) {
    const text = fillShareTemplate(copy.shareTemplates[idx] || "", buyUrl);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedShare(idx);
      setTimeout(() => setCopiedShare(null), 2000);
    } catch {
      alert(text);
    }
  }

  return (
    <div className="px-4 mt-4 space-y-4">
      {/* 与实体券对齐说明 */}
      <div className="print:hidden rounded-xl border border-border bg-muted/50 p-3 text-[11px] text-muted-foreground leading-relaxed">
        <p className="font-semibold text-foreground/80">
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
          href={`/business/physical?campaignId=${campaignId}&from=offers`}
          className="inline-block mt-2 text-primary font-medium"
        >
          {lang === "en" ? "Print physical tickets →" : "去印实体券 →"}
        </Link>
        <Link
          href="/business/offers"
          className="inline-block mt-1 ml-3 text-muted-foreground font-medium"
        >
          {lang === "en" ? "Activity perks" : "活动券"}
        </Link>
      </div>

      {/* Auto sell-point preview strip */}
      <div className="print:hidden rounded-xl border border-primary/20 bg-primary/5 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
          {lang === "en" ? "Auto sell points (from campaign)" : "自动卖点（来自活动配置）"}
        </p>
        <p className="text-base font-bold text-foreground mt-1">{copy.benefitLine}</p>
        <p className="text-sm font-semibold mt-0.5" style={{ color: accent }}>
          {copy.headline}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{copy.sub}</p>
        {copy.termsLine && (
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
            {copy.termsLine}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">{copy.untilLine}</p>
      </div>

      {/* Optional one-line override */}
      <div className="print:hidden space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          {lang === "en"
            ? "Custom subline (optional, max 80)"
            : "自定义副标题（可选，最多 80 字）"}
        </p>
        <Input
          value={customSubline}
          onChange={(e) => setCustomSubline(e.target.value.slice(0, 80))}
          placeholder={
            lang === "en"
              ? "Leave empty to use auto copy"
              : "留空则使用自动文案"
          }
        />
      </div>

      {/* Visual template + theme */}
      <div className="print:hidden space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          {lang === "en" ? "Visual template" : "视觉模版"}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {VISUAL_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplateId(t.id)}
              className={cn(
                "rounded-xl border p-2.5 text-left active:scale-[0.98] transition-transform",
                templateId === t.id
                  ? "border-primary bg-primary/10"
                  : "border-border"
              )}
            >
              <p className="text-xs font-semibold">
                {lang === "en" ? t.nameEn : t.nameZh}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {lang === "en" ? t.taglineEn : t.taglineZh}
              </p>
            </button>
          ))}
        </div>
        <p className="text-xs font-medium text-muted-foreground pt-1">
          {lang === "en" ? "Theme colour" : "主题色"}
        </p>
        <div className="flex flex-wrap gap-2">
          {color && /^#[0-9A-Fa-f]{6}$/.test(color) && (
            <button
              type="button"
              onClick={() => setThemeId("campaign")}
              className={cn(
                "h-8 px-2.5 rounded-full border text-[10px] font-semibold flex items-center gap-1.5",
                themeId === "campaign"
                  ? "border-foreground ring-2 ring-offset-1 ring-foreground/30"
                  : "border-border"
              )}
            >
              <span
                className="w-3.5 h-3.5 rounded-full"
                style={{ background: color }}
              />
              {lang === "en" ? "Campaign" : "活动色"}
            </button>
          )}
          {THEME_SWATCHES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setThemeId(s.id)}
              className={cn(
                "h-8 px-2.5 rounded-full border text-[10px] font-semibold flex items-center gap-1.5",
                themeId === s.id
                  ? "border-foreground ring-2 ring-offset-1 ring-foreground/30"
                  : "border-border"
              )}
            >
              <span
                className="w-3.5 h-3.5 rounded-full"
                style={{ background: s.hex }}
              />
              {lang === "en" ? s.labelEn : s.labelZh}
            </button>
          ))}
        </div>
      </div>

      {/* Distributor */}
      <div className="print:hidden space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
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
        <p className="text-[10px] text-muted-foreground font-mono break-all">
          {buyUrl}
        </p>
      </div>

      {/* Layout */}
      <div className="print:hidden">
        <p className="text-xs font-medium text-muted-foreground mb-2">
          {lang === "en" ? "Print layout" : "印刷版式"}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {layouts.map((L) => (
            <button
              key={L.id}
              type="button"
              onClick={() => setLayout(L.id)}
              className={cn(
                "rounded-xl border p-2.5 text-left active:scale-[0.98] transition-transform",
                layout === L.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              )}
            >
              <p className="text-xs font-semibold">
                {lang === "en" ? L.en : L.zh}
              </p>
              <p className="text-[10px] opacity-80 mt-0.5">
                {lang === "en" ? L.hintEn : L.hintZh}
              </p>
            </button>
          ))}
        </div>
        {layout === "a4" && (
          <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
            {lang === "en"
              ? "A4: use Print / Save PDF for print shops, or Download PNG (≈150dpi). Fills one A4 sheet."
              : "A4：打印店建议「打印/存 PDF」或下载 PNG（约 150dpi）。一页一张墙贴。"}
          </p>
        )}
        {layout === "vhd" && (
          <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
            {lang === "en"
              ? "Portrait HD 1080×1920: digital screens, elevator ads, vertical displays. Download branded PNG."
              : "竖版全高清 1080×1920：电梯屏、竖屏广告机、门店竖屏。请用「下载品牌 PNG」。"}
          </p>
        )}
      </div>

      <div className="print:hidden flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={printBranded}
          className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50 active:scale-[0.97] transition-transform"
        >
          {busy
            ? "…"
            : lang === "en"
              ? "Print / Save PDF"
              : "打印 / 存为 PDF"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={downloadBranded}
          className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-xs font-semibold text-background disabled:opacity-50 active:scale-[0.97] transition-transform"
        >
          {busy
            ? "…"
            : lang === "en"
              ? "Download PNG"
              : "下载品牌 PNG"}
        </button>
        <button
          type="button"
          disabled={bulkBusy}
          onClick={bulkDownloadDistributors}
          className="inline-flex h-9 items-center rounded-full border border-border px-4 text-xs font-semibold text-foreground disabled:opacity-50 active:scale-[0.97] transition-transform"
        >
          {bulkBusy
            ? bulkProgress || "…"
            : lang === "en"
              ? "ZIP · all distributors"
              : "ZIP · 全部分发人"}
        </button>
        <a
          href={buyUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center rounded-full border border-border px-4 text-xs font-semibold text-muted-foreground active:scale-[0.97] transition-transform"
        >
          {lang === "en" ? "Open activity page" : "打开活动页"}
        </a>
      </div>
      {bulkProgress && !bulkBusy && (
        <p className="print:hidden text-[11px] text-emerald-700 dark:text-emerald-400">
          {bulkProgress}
        </p>
      )}

      {/* Share copy templates */}
      <div className="print:hidden rounded-xl border border-border p-3 space-y-2">
        <p className="text-xs font-semibold text-foreground">
          {lang === "en" ? "Share copy templates" : "分享文案模板"}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {lang === "en"
            ? "Copy → paste into WhatsApp / WeChat. Link uses current distributor version."
            : "一键复制 → 粘贴到 WhatsApp / 微信。链接使用当前分发版本。"}
        </p>
        {copy.shareTemplates.map((tpl, i) => (
          <div
            key={i}
            className="flex gap-2 items-start rounded-lg bg-muted/40 p-2"
          >
            <p className="flex-1 text-[11px] text-foreground/90 leading-relaxed">
              {fillShareTemplate(tpl, buyUrl)}
            </p>
            <button
              type="button"
              onClick={() => copyShare(i)}
              className="shrink-0 text-[10px] font-semibold text-primary px-2 py-1 rounded-full border border-primary/30"
            >
              {copiedShare === i
                ? lang === "en"
                  ? "Copied"
                  : "已复制"
                : lang === "en"
                  ? "Copy"
                  : "复制"}
            </button>
          </div>
        ))}
      </div>

      {status !== "active" && (
        <p className="print:hidden text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded-lg p-2">
          {lang === "en"
            ? "Campaign is not active — customers may not complete purchase until active."
            : "活动非进行中：顾客可能无法完成购买，请先发布活动。"}
        </p>
      )}

      <div
        className={cn(
          "flex justify-center",
          layout === "a4" ? "print:block campaign-print-a4-wrap" : "print:block"
        )}
      >
        <CampaignCardSheet
          layout={layout}
          campaignName={campaignName}
          businessName={businessName}
          businessLogo={businessLogo}
          buyUrl={buyUrl}
          qrSrc={qrSrc}
          copy={copy}
          distLabel={distLabel}
          isDist={Boolean(sellerId)}
          accent={accent}
          surface={surface}
          lang={lang}
          festival={isNdp || isNdpFestivalAccent(accent)}
        />
      </div>

      {stores.length > 0 && (
        <p className="print:hidden text-[11px] text-muted-foreground text-center">
          {lang === "en"
            ? `Your stores: ${stores.map((s) => s.name).join(", ")}`
            : `你的门店：${stores.map((s) => s.name).join("、")}`}
        </p>
      )}

      <p className="print:hidden text-[11px] text-muted-foreground text-center leading-relaxed pb-4 px-1">
        {lang === "en"
          ? "Print tip: colour preferred; keep QR unobstructed, ≥ 4cm wide."
          : "打印建议：尽量彩色；二维码无遮挡，边长建议 ≥ 4cm。"}
        {isNdp && (
          <>
            {" "}
            {lang === "en"
              ? "National Flag style (red/white + crescent/stars) is for respectful National Day period promo; do not invert or distort."
              : "国旗红白+星月为国庆期庄重宣传用（7–9 月商用意象通常允许）；请勿倒置/扭曲/遮挡星月核心。"}
          </>
        )}
      </p>
    </div>
  );
}

function PosterQr({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center bg-white border border-dashed border-red-300 text-center p-3",
          className
        )}
      >
        <p className="text-xs font-semibold text-red-600">QR 加载失败</p>
        <p className="text-[10px] text-muted-foreground mt-1 break-all px-2">
          请刷新页面或检查活动公开链接
        </p>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="QR"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

function CampaignCardSheet({
  layout,
  campaignName,
  businessName,
  businessLogo,
  buyUrl,
  qrSrc,
  copy,
  distLabel,
  isDist,
  accent,
  surface,
  lang,
  festival = false,
}: {
  layout: LayoutId;
  campaignName: string;
  businessName: string | null;
  businessLogo: string | null;
  buyUrl: string;
  qrSrc: string;
  copy: CampaignPosterCopy;
  distLabel: string;
  isDist: boolean;
  accent: string;
  surface: "light" | "dark";
  lang: "zh" | "en";
  festival?: boolean;
}) {
  const isDark = surface === "dark" && !festival;
  const headerBg = `linear-gradient(145deg, ${accent} 0%, #1e293b 100%)`;

  if (layout === "sticker") {
    return (
      <div
        data-campaign-print-card
        className={cn(
          "w-full max-w-[320px] aspect-square rounded-3xl border-2 overflow-hidden shadow-sm flex flex-col relative",
          festival
            ? "border-red-800/30"
            : isDark
              ? "border-slate-700"
              : "border-border print:border-slate-400"
        )}
        style={{
          background: festival
            ? accent || SG_NDP_RED
            : isDark
              ? "#1E1B2E"
              : undefined,
        }}
      >
        {festival && (
          <div
            className="pointer-events-none absolute right-2 top-2 z-0 h-12 w-12 opacity-80"
            aria-hidden
          >
            <SingaporeCrescentStars red={accent || SG_NDP_RED} size={48} />
          </div>
        )}
        <div
          className={cn(
            "px-4 pt-4 pb-3 relative z-[1] overflow-hidden",
            festival ? "text-white flex-[1.05]" : "text-white text-center"
          )}
          style={{
            background: festival ? "transparent" : headerBg,
          }}
        >
          {festival ? (
            <>
              <p className="text-[10px] font-semibold text-white/95 pr-12">
                {lang === "en"
                  ? "Table · spend & get"
                  : "桌边扫码 · 结账满额即送"}
              </p>
              <div className="flex items-center gap-2 mt-2 pr-10">
                {businessLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={businessLogo}
                    alt=""
                    className="w-10 h-10 object-cover rounded-xl bg-white"
                  />
                ) : (
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/20 text-lg">
                    🎁
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-white/90">
                    SG61 · {lang === "en" ? "National Day" : "国庆满赠"}
                  </p>
                  <p className="text-sm font-bold truncate">
                    {businessName || campaignName}
                  </p>
                  <p className="text-[10px] text-white/85 truncate">
                    {campaignName}
                  </p>
                </div>
              </div>
              <div className="mt-2 rounded-xl bg-white/15 border border-white/25 px-2.5 py-2">
                <p className="text-base font-extrabold tabular-nums leading-none">
                  {copy.benefitLine.replace(/ · SG\d+/i, "")}
                  <span className="ml-1.5 text-xs font-bold text-white/90">
                    SG61
                  </span>
                </p>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center gap-2">
              {businessLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={businessLogo}
                  alt=""
                  className="w-9 h-9 object-contain rounded-lg bg-card p-0.5"
                />
              ) : (
                <span className="text-xl">🎰</span>
              )}
              <div className="min-w-0 text-left">
                <p className="text-sm font-bold truncate">{campaignName}</p>
                <p className="text-[10px] text-white/70 truncate">
                  {businessName}
                </p>
              </div>
            </div>
          )}
          {isDist && (
            <p className="mt-1.5 text-[10px] font-semibold text-amber-200">
              {lang === "en" ? "Via" : "分发"} · {distLabel}
            </p>
          )}
        </div>
        <div
          className={cn(
            "flex-1 flex flex-col items-center justify-between p-4 relative z-[1]",
            festival ? "bg-white text-slate-900" : isDark ? "text-slate-100" : "bg-card"
          )}
        >
          {!festival && (
            <p
              className="text-sm font-bold text-center leading-snug"
              style={{ color: accent }}
            >
              {copy.benefitLine}
            </p>
          )}
          <PosterQr
            src={qrSrc}
            className="w-36 h-36 rounded-xl border bg-white p-1 shadow-sm"
          />
          <div className="text-center w-full">
            <p className="text-sm font-bold">{copy.headline}</p>
            <p
              className={cn(
                "text-[10px] mt-0.5 line-clamp-2",
                festival ? "text-slate-600" : "text-muted-foreground"
              )}
            >
              {copy.sub}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (layout === "poster" || layout === "a4" || layout === "vhd") {
    const a4 = layout === "a4";
    const vhd = layout === "vhd";
    return (
      <div
        data-campaign-poster={layout}
        data-campaign-print-card
        className={cn(
          "w-full rounded-2xl overflow-hidden border shadow-sm print:border-slate-400 print:shadow-none relative bg-card",
          festival ? "border-red-800/30" : "border-border",
          a4
            ? "max-w-[420px] campaign-a4-sheet print:rounded-none"
            : vhd
              ? // 预览不锁死 9:16 高度，避免条款/截止被裁切；导出 PNG 仍是 1080×1920
                "max-w-[340px]"
              : "max-w-[400px]"
        )}
      >
        <div
          className={cn(
            "relative z-[1] text-white overflow-hidden",
            a4 || vhd ? "px-5 pt-6 pb-4" : "px-5 pt-6 pb-4"
          )}
          style={{
            background: festival ? accent || SG_NDP_RED : headerBg,
          }}
        >
          {festival && (
            <div
              className="pointer-events-none absolute right-2.5 top-2.5 h-11 w-11 opacity-80"
              aria-hidden
            >
              <SingaporeCrescentStars red={accent || SG_NDP_RED} size={44} />
            </div>
          )}
          {festival ? (
            <>
              <p className="text-[10px] font-semibold tracking-wide text-white/95 pr-12">
                {lang === "en"
                  ? "Table scan · spend & get"
                  : "桌边扫码 · 结账满额即送"}
              </p>
              <div className="flex items-start gap-2.5 mt-3 pr-10">
                {businessLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={businessLogo}
                    alt=""
                    className={cn(
                      "object-cover rounded-xl bg-white shrink-0",
                      a4 || vhd ? "w-12 h-12" : "w-12 h-12"
                    )}
                  />
                ) : (
                  <div
                    className={cn(
                      "rounded-xl bg-white/20 flex items-center justify-center text-xl shrink-0",
                      "w-12 h-12"
                    )}
                  >
                    🎁
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/90">
                    SG61 · {lang === "en" ? "National Day" : "国庆满赠"}
                  </p>
                  <h1
                    className={cn(
                      "font-bold mt-0.5 leading-snug break-words",
                      // 不用 truncate：中英品牌名过长时换行，避免「Meow BBQ …」
                      a4 || vhd ? "text-base" : "text-lg"
                    )}
                  >
                    {businessName || campaignName}
                  </h1>
                  <p className="text-[11px] text-white/85 mt-0.5 leading-snug line-clamp-2">
                    {campaignName}
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-2xl bg-white/15 border border-white/25 px-3.5 py-3">
                <p className="text-[11px] text-white/90">{campaignName}</p>
                <p
                  className={cn(
                    "font-extrabold tabular-nums mt-0.5",
                    a4 || vhd ? "text-2xl" : "text-xl"
                  )}
                >
                  {copy.benefitLine.replace(/ · SG\d+/i, "")}
                  <span className="ml-2 text-sm font-bold text-white/90">
                    SG61
                  </span>
                </p>
                <p className="text-[11px] text-white/90 mt-1 leading-snug">
                  {copy.sub}
                </p>
              </div>
            </>
          ) : (
            <>
              {businessLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={businessLogo}
                  alt=""
                  className={cn(
                    "object-contain rounded-2xl bg-card mx-auto p-1",
                    a4 ? "w-16 h-16" : "w-14 h-14"
                  )}
                />
              ) : (
                <div
                  className={cn(
                    "rounded-2xl bg-white/20 mx-auto flex items-center justify-center text-3xl",
                    a4 ? "w-16 h-16" : "w-14 h-14"
                  )}
                >
                  🎰
                </div>
              )}
              <h1 className={cn("font-bold mt-3 text-center", a4 ? "text-2xl" : "text-xl")}>
                {campaignName}
              </h1>
              {businessName && (
                <p className="text-white/70 text-sm mt-1 text-center">
                  {businessName}
                </p>
              )}
            </>
          )}
          {isDist && (
            <p className="mt-2 inline-block px-3 py-0.5 rounded-full bg-white/20 text-xs font-semibold">
              {lang === "en" ? "Distributed by" : "分发"} · {distLabel}
            </p>
          )}
        </div>
        <div
          className={cn(
            "text-center relative z-[1] bg-card",
            a4 || vhd ? "px-5 py-4" : "px-6 py-5"
          )}
        >
          {!festival && (
            <p
              className={cn("font-bold leading-snug", a4 || vhd ? "text-xl" : "text-lg")}
              style={{ color: accent }}
            >
              {copy.benefitLine}
            </p>
          )}
          {festival && copy.hookLine && (
            <p
              className={cn(
                "font-extrabold text-slate-900 leading-snug px-1",
                vhd ? "text-base" : a4 ? "text-xl" : "text-lg"
              )}
            >
              {copy.hookLine}
            </p>
          )}
          <p
            className={cn(
              "font-bold",
              festival
                ? "text-rose-700 mt-2"
                : "text-foreground mt-2",
              a4 || vhd ? "text-sm" : "text-sm"
            )}
          >
            {copy.headline}
          </p>
          {festival && copy.hookPills && copy.hookPills.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-1.5 mt-2.5">
              {copy.hookPills.slice(0, 3).map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-semibold text-rose-800"
                >
                  {p}
                </span>
              ))}
            </div>
          ) : (
            <p
              className={cn(
                "text-xs mt-1",
                festival ? "text-slate-600" : "text-muted-foreground"
              )}
            >
              {copy.sub}
            </p>
          )}
          <PosterQr
            src={qrSrc}
            className={cn(
              "mx-auto mt-3 rounded-2xl border border-rose-100 p-2 bg-white shadow-sm",
              vhd
                ? "w-36 h-36"
                : a4
                  ? "w-36 h-36"
                  : festival
                    ? "w-40 h-40"
                    : "w-52 h-52"
            )}
          />
          <p
            className={cn(
              "text-[11px] mt-2.5 leading-snug px-1",
              festival ? "text-slate-600" : "text-muted-foreground"
            )}
          >
            {festival ? copy.sub : copy.untilLine}
          </p>
          {festival && copy.termsLine && (
            <p className="text-[10px] text-slate-500 mt-1 leading-snug px-1 font-medium">
              {copy.termsLine}
            </p>
          )}
          {festival && (
            <p className="text-[11px] text-slate-500 mt-1">{copy.untilLine}</p>
          )}
          <p
            className={cn(
              "text-[9px] font-mono break-all mt-2",
              festival ? "text-slate-400" : "text-muted-foreground"
            )}
          >
            {buyUrl}
          </p>
          <p
            className={cn(
              "text-[10px] mt-4 tracking-widest uppercase",
              festival ? "text-slate-400" : "text-muted-foreground"
            )}
          >
            WeMembers
          </p>
        </div>
      </div>
    );
  }

  // tent — 国庆：落地页同款（整块红 + 品牌 + 满赠卡 + 右上星月）
  return (
    <div
      data-campaign-print-card
      className={cn(
        "w-full max-w-[360px] rounded-2xl border shadow-sm overflow-hidden print:border-slate-400 relative",
        festival
          ? "border-red-800/30 bg-card"
          : isDark
            ? "border-slate-700"
            : "border-border bg-card"
      )}
      style={
        isDark && !festival
          ? { background: "#1E1B2E", color: "#F8FAFC" }
          : undefined
      }
    >
      <div
        className={cn(
          "px-5 pt-4 pb-4 relative z-[1] overflow-hidden",
          festival ? "text-white" : "text-center"
        )}
        style={
          festival
            ? { backgroundColor: accent || SG_NDP_RED }
            : undefined
        }
      >
        {festival && (
          <div
            className="pointer-events-none absolute right-2.5 top-2.5 h-14 w-14 opacity-80"
            aria-hidden
          >
            <SingaporeCrescentStars red={accent || SG_NDP_RED} size={56} />
          </div>
        )}
        {!festival && (
          <p
            className={cn(
              "text-[10px] font-semibold tracking-[0.2em] uppercase",
              isDark
                ? "text-amber-300/90"
                : "text-amber-700 dark:text-amber-400/90"
            )}
          >
            {`WeMembers · ${lang === "en" ? "Activity" : "活动"}`}
          </p>
        )}
        {festival ? (
          <>
            <p className="text-[11px] font-semibold text-white/95 pr-14">
              {lang === "en"
                ? "Table scan · spend & get"
                : "桌边扫码 · 结账满额即送"}
            </p>
            <div className="flex items-center gap-3 mt-3 pr-12">
              {businessLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={businessLogo}
                  alt=""
                  className="w-12 h-12 object-cover rounded-xl bg-white shrink-0"
                />
              ) : null}
              <div className="text-left min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/90">
                  SG61 · {lang === "en" ? "National Day" : "国庆满赠"}
                </p>
                <h1 className="text-lg font-bold leading-snug truncate">
                  {businessName || campaignName}
                </h1>
                <p className="text-[12px] text-white/85 truncate">
                  {campaignName}
                </p>
              </div>
            </div>
            <div className="mt-3 rounded-2xl bg-white/15 border border-white/25 px-3.5 py-3 text-left">
              <p className="text-[11px] text-white/90">{campaignName}</p>
              <p className="text-xl font-extrabold tabular-nums mt-0.5">
                {copy.benefitLine.replace(/ · SG\d+/i, "")}
                <span className="ml-2 text-sm font-bold text-white/90">
                  SG61
                </span>
              </p>
              <p className="text-[11px] text-white/90 mt-1 leading-snug">
                {copy.sub}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 mt-3">
              {businessLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={businessLogo}
                  alt=""
                  className="w-12 h-12 object-contain rounded-xl border bg-white"
                />
              ) : null}
              <div className="text-left min-w-0">
                <h1 className="text-lg font-bold leading-tight">
                  {campaignName}
                </h1>
                {businessName && (
                  <p
                    className={cn(
                      "text-[11px]",
                      isDark
                        ? "text-slate-400"
                        : "text-muted-foreground"
                    )}
                  >
                    {businessName}
                  </p>
                )}
              </div>
            </div>
            {isDist && (
              <p className="mt-2 text-[11px] font-semibold inline-block px-2 py-0.5 rounded-full text-amber-800 bg-amber-50 dark:bg-amber-950/35 dark:text-amber-200">
                {lang === "en" ? "Via" : "分发"} · {distLabel}
              </p>
            )}
            <p
              className="mt-3 text-base font-bold leading-snug rounded-full px-3 py-1.5 inline-block"
              style={{ color: isDark ? "#FDE68A" : accent }}
            >
              {copy.benefitLine}
            </p>
          </>
        )}
      </div>
      <div className="px-5 pt-3 pb-2 text-center relative z-[1] bg-card">
        {festival && copy.hookLine && (
          <p className="text-sm font-extrabold text-slate-900 leading-snug">
            {copy.hookLine}
          </p>
        )}
        <p
          className={cn(
            "text-base font-bold",
            festival ? "text-rose-700 mt-1.5" : ""
          )}
          style={festival ? undefined : { color: accent }}
        >
          {copy.headline}
        </p>
        {festival && copy.hookPills && copy.hookPills.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 mt-2">
            {copy.hookPills.slice(0, 3).map((p) => (
              <span
                key={p}
                className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[10px] font-semibold text-rose-800"
              >
                {p}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="px-5 py-2 flex justify-center relative z-[1] bg-card">
        <PosterQr
          src={qrSrc}
          className={cn(
            "rounded-2xl border border-red-100 p-2 bg-white shadow-md",
            festival ? "w-44 h-44" : "w-52 h-52"
          )}
        />
      </div>
      <div className="px-5 pb-5 text-center relative z-[1] bg-card">
        <p
          className={cn(
            "text-[11px] mt-0.5 leading-snug px-0.5",
            festival
              ? "text-slate-600"
              : isDark
                ? "text-slate-400"
                : "text-muted-foreground"
          )}
        >
          {copy.sub}
        </p>
        {festival && copy.termsLine && (
          <p className="text-[10px] text-slate-500 mt-1.5 leading-snug px-1 font-medium">
            {copy.termsLine}
          </p>
        )}
        <p
          className={cn(
            "text-[10px] mt-1.5",
            festival
              ? "text-slate-500"
              : isDark
                ? "text-slate-400"
                : "text-muted-foreground"
          )}
        >
          {copy.untilLine}
        </p>
        <p
          className={cn(
            "text-[9px] font-mono break-all mt-2",
            festival
              ? "text-slate-400"
              : isDark
                ? "text-slate-500"
                : "text-muted-foreground"
          )}
        >
          {buyUrl}
        </p>
      </div>
    </div>
  );
}

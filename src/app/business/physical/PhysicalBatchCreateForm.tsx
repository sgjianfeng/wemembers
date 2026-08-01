"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import {
  THEME_SWATCHES,
  listVisualTemplatesForType,
} from "@/lib/visual-templates";
import { TicketVisualCard } from "@/components/physical/TicketVisualCard";
import { cn } from "@/lib/utils";
import { Printer } from "lucide-react";

export type PrintableProduct = {
  id: string;
  name: string;
  type: string;
  productKind?: string;
  status: string;
  description?: string | null;
  enabledTiers: number[];
  packKind?: string | null;
  /** short line for card subtitle */
  summaryZh?: string;
  summaryEn?: string;
};

export type PrintableCampaign = {
  id: string;
  name: string;
  type: string;
  status: string;
  productKind?: string;
  products: PrintableProduct[];
};

function paperTypeFromProduct(
  product: PrintableProduct | null | undefined
): "voucher" | "draw" {
  if (!product) return "voucher";
  if (
    product.type === "lucky_draw_v2" ||
    product.type === "lucky_draw" ||
    product.packKind === "exclusive_ballot"
  ) {
    return "draw";
  }
  return "voucher";
}

function productSummary(
  p: PrintableProduct,
  lang: "zh" | "en"
): string {
  if (lang === "en" && p.summaryEn) return p.summaryEn;
  if (lang === "zh" && p.summaryZh) return p.summaryZh;
  const tiers =
    p.enabledTiers.length > 0
      ? p.enabledTiers.map((t) => `S$${t}`).join(" / ")
      : "";
  if (paperTypeFromProduct(p) === "draw") {
    return lang === "en"
      ? `Exclusive draw${tiers ? ` · ${tiers}` : ""}`
      : `独享抽奖${tiers ? ` · 档 ${p.enabledTiers.join("/")}` : ""}`;
  }
  return lang === "en"
    ? `Self-use voucher${tiers ? ` · ${tiers}` : ""}`
    : `自用代金${tiers ? ` · 档 ${p.enabledTiers.join("/")}` : ""}`;
}

export function PhysicalBatchCreateForm({
  stores,
  campaigns = [],
  lang,
  businessName,
  businessLogo,
  initialCampaignId,
  defaultOpen = false,
}: {
  stores: { id: string; name: string }[];
  campaigns?: PrintableCampaign[];
  lang: "zh" | "en";
  businessName?: string | null;
  businessLogo?: string | null;
  /** 从活动券深链预选活动 */
  initialCampaignId?: string | null;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const prefCampaign =
    (initialCampaignId &&
      campaigns.some((c) => c.id === initialCampaignId) &&
      initialCampaignId) ||
    campaigns[0]?.id ||
    "";
  const [open, setOpen] = useState(defaultOpen || Boolean(initialCampaignId));
  const [storeId, setStoreId] = useState(stores[0]?.id || "");
  const [campaignId, setCampaignId] = useState(prefCampaign);
  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === campaignId) || null,
    [campaigns, campaignId]
  );
  const products = selectedCampaign?.products || [];
  const [productId, setProductId] = useState(products[0]?.id || "");
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId) || null,
    [products, productId]
  );
  const paperType = paperTypeFromProduct(selectedProduct);
  const tiers = useMemo(() => {
    if (selectedProduct?.enabledTiers?.length) {
      return selectedProduct.enabledTiers;
    }
    return paperType === "draw" ? [50, 100] : [10, 20, 50, 100, 200];
  }, [selectedProduct, paperType]);

  const [valueSgd, setValueSgd] = useState(String(tiers[0] ?? 10));
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState("20");
  const [visualTemplateId, setVisualTemplateId] = useState("store_classic");
  const [themeHex, setThemeHex] = useState("#E85D04");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Keep product in sync when campaign changes
  useEffect(() => {
    const list = selectedCampaign?.products || [];
    if (!list.length) {
      setProductId("");
      return;
    }
    if (!list.some((p) => p.id === productId)) {
      setProductId(list[0].id);
    }
  }, [selectedCampaign, productId]);

  // When product / tiers change: face value + template defaults
  useEffect(() => {
    if (!selectedProduct) return;
    const nextTiers =
      selectedProduct.enabledTiers?.length > 0
        ? selectedProduct.enabledTiers
        : paperTypeFromProduct(selectedProduct) === "draw"
          ? [50, 100]
          : [10, 20, 50, 100, 200];
    setValueSgd((prev) => {
      const n = Number(prev);
      if (nextTiers.includes(n)) return prev;
      return String(nextTiers[0] ?? 10);
    });
    const t = paperTypeFromProduct(selectedProduct);
    const rec = listVisualTemplatesForType(t).find((x) => x.recommended);
    if (rec) {
      setVisualTemplateId(rec.id);
      setThemeHex(rec.defaultThemeHex);
    }
  }, [selectedProduct]);

  const templates = useMemo(
    () => listVisualTemplatesForType(paperType),
    [paperType]
  );

  const storeName = stores.find((s) => s.id === storeId)?.name || "Store";

  async function create() {
    setLoading(true);
    setError("");
    if (!campaignId) {
      setError(
        lang === "en"
          ? "Select an activity first"
          : "请先选择活动"
      );
      setLoading(false);
      return;
    }
    if (!productId || !selectedProduct) {
      setError(
        lang === "en"
          ? "Select a product (SKU)"
          : "请选择线上券产品"
      );
      setLoading(false);
      return;
    }
    const valueCents = Math.round(parseFloat(valueSgd || "0") * 100);
    if (!valueCents || valueCents < 100) {
      setError(
        lang === "en" ? "Pick a face value" : "请选择面值档"
      );
      setLoading(false);
      return;
    }
    const autoTitle =
      title.trim() ||
      `${selectedProduct.name} S$${valueSgd}${
        paperType === "draw"
          ? lang === "en"
            ? " draw"
            : " 抽奖券"
          : lang === "en"
            ? " voucher"
            : " 自用券"
      }`;
    const res = await fetch("/api/business/physical/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId,
        type: paperType,
        title: autoTitle,
        valueCents,
        quantity: parseInt(quantity, 10) || 0,
        visualTemplateId,
        themeColor: themeHex,
        campaignId,
        // only real VoucherProduct ids (skip synthetic campaign: fallback)
        ...(productId && !productId.startsWith("campaign:")
          ? { productId }
          : {}),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || (lang === "en" ? "Failed" : "创建失败"));
      return;
    }
    setOpen(false);
    setTitle("");
    router.push(`/business/physical/${data.data.id}`);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full group relative overflow-hidden",
          "rounded-2xl border border-dashed border-primary/35",
          "bg-gradient-to-br from-primary/[0.06] via-card to-card",
          "px-4 py-4 text-left",
          "hover:border-primary/55 hover:from-primary/[0.1]",
          "active:scale-[0.99] transition-all shadow-sm"
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            <Printer size={20} strokeWidth={1.8} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {lang === "en" ? "+ New print batch" : "+ 新建印刷批次"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              {lang === "en"
                ? "Activity → product → paper. Type follows the SKU."
                : "活动 → 产品 → 纸质。类型随产品自动对应。"}
            </p>
          </div>
        </div>
      </button>
    );
  }

  const previewTitle =
    title.trim() ||
    (selectedProduct
      ? `${selectedProduct.name} S$${valueSgd}`
      : paperType === "draw"
        ? lang === "en"
          ? "Lucky draw ticket"
          : "抽奖券"
        : lang === "en"
          ? "Store voucher"
          : "本店代金券");

  return (
    <Card className="overflow-hidden border-border/80 shadow-md shadow-primary/[0.04]">
      <CardContent className="p-0">
        <div className="px-4 pt-4 pb-3 border-b border-border/70 bg-gradient-to-b from-primary/[0.04] to-transparent">
          <p className="text-sm font-semibold text-foreground">
            {lang === "en" ? "New batch" : "新建批次"}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            {lang === "en"
              ? "Activity → product → paper. Front footer: max 2 short lines; longer rules can print on the back."
              : "活动 → 产品 → 纸质。条款正面小字两行；过长可印背面。"}
          </p>
        </div>

        <div className="p-4 space-y-4">
          {/* Store */}
          <div>
            <label className="block text-[13px] font-medium text-foreground mb-1.5">
              {lang === "en"
                ? "Print / stock store"
                : "印刷/出库门店（集团仍可核）"}
            </label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Activity */}
          <div>
            <label className="block text-[13px] font-medium text-foreground mb-1.5">
              {lang === "en"
                ? "Activity (required · on paper)"
                : "活动（必选 · 票面显示）"}
            </label>
            {campaigns.length === 0 ? (
              <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/40 rounded-xl p-3 leading-relaxed">
                {lang === "en"
                  ? "No self-use activities. Create products / activities first."
                  : "暂无自用活动。请先在「券产品 / 活动」创建并上架。"}
              </p>
            ) : (
              <div className="space-y-2">
                {campaigns.map((c) => {
                  const active = campaignId === c.id;
                  const first = c.products[0];
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCampaignId(c.id)}
                      className={cn(
                        "w-full text-left rounded-2xl border px-3.5 py-3 transition-all active:scale-[0.99]",
                        active
                          ? "border-primary bg-primary/[0.07] shadow-sm ring-1 ring-primary/20"
                          : "border-border/80 bg-card hover:border-primary/30 hover:bg-muted/30"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          {c.name}
                        </p>
                        <span
                          className={cn(
                            "text-[10px] font-medium shrink-0 rounded-full px-2 py-0.5",
                            c.status === "active"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {c.status}
                        </span>
                      </div>
                      {first && (
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                          {productSummary(first, lang)}
                          {c.products.length > 1
                            ? lang === "en"
                              ? ` · +${c.products.length - 1} products`
                              : ` · 另 ${c.products.length - 1} 个产品`
                            : ""}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Product — type is derived, no manual paper-type picker */}
          <div>
            <label className="block text-[13px] font-medium text-foreground mb-1.5">
              {lang === "en"
                ? "Online product (required · SKU)"
                : "线上券产品（必选 · 对齐 SKU）"}
            </label>
            {products.length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-xl border border-dashed border-border bg-muted/30 p-3">
                {lang === "en"
                  ? "This activity has no linked products."
                  : "该活动尚未勾选券产品。"}
              </p>
            ) : (
              <div className="space-y-2">
                {products.map((p) => {
                  const active = productId === p.id;
                  const kind = paperTypeFromProduct(p);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProductId(p.id)}
                      className={cn(
                        "w-full text-left rounded-2xl border px-3.5 py-3 transition-all active:scale-[0.99]",
                        active
                          ? "border-primary bg-primary/[0.07] shadow-sm ring-1 ring-primary/20"
                          : "border-border/80 bg-card hover:border-primary/30"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          {p.name}
                        </p>
                        <span
                          className={cn(
                            "text-[10px] font-semibold shrink-0 rounded-full px-2 py-0.5",
                            kind === "draw"
                              ? "bg-brand/10 text-brand"
                              : "bg-primary/10 text-primary"
                          )}
                        >
                          {kind === "draw"
                            ? lang === "en"
                              ? "Draw paper"
                              : "抽奖消费券"
                            : lang === "en"
                              ? "Voucher"
                              : "自用券"}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                        {productSummary(p, lang)}
                        {p.packKind ? ` · ${p.packKind}` : ""}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
              {lang === "en"
                ? "Paper type follows the product — no extra type step. Ballot (box-only) is under Tools → Ballot print."
                : "纸质类型由产品决定，无需再选手动类型。入箱票请到「更多 → 工具 → 入箱票印刷」。"}
            </p>
          </div>

          {/* Face tiers from product */}
          <div>
            <label className="block text-[13px] font-medium text-foreground mb-1.5">
              {lang === "en" ? "Face tier (from product)" : "面值档（来自产品）"}
            </label>
            <div className="flex flex-wrap gap-2">
              {tiers.map((t) => {
                const active = Number(valueSgd) === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setValueSgd(String(t))}
                    className={cn(
                      "h-9 min-w-[3.25rem] px-3 rounded-full text-sm font-semibold border transition-all active:scale-[0.97] nums",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-card text-foreground hover:border-primary/40"
                    )}
                  >
                    S${t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Visual template */}
          <div>
            <label className="block text-[13px] font-medium text-foreground mb-1.5">
              {lang === "en" ? "Visual template" : "视觉模版"}
            </label>
            <div className="grid grid-cols-1 gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setVisualTemplateId(t.id);
                    setThemeHex(t.defaultThemeHex);
                  }}
                  className={cn(
                    "text-left rounded-2xl border p-3.5 transition-all active:scale-[0.99]",
                    visualTemplateId === t.id
                      ? "border-primary bg-primary/[0.06] ring-1 ring-primary/15"
                      : "border-border/80 hover:border-muted-foreground/25"
                  )}
                >
                  <p className="text-sm font-semibold text-foreground">
                    {lang === "en" ? t.nameEn : t.nameZh}
                    {t.recommended && (
                      <span className="ml-1.5 text-[10px] font-medium text-primary">
                        {lang === "en" ? "Recommended" : "推荐"}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {lang === "en" ? t.taglineEn : t.taglineZh}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Theme */}
          <div>
            <label className="block text-[13px] font-medium text-foreground mb-1.5">
              {lang === "en" ? "Theme color" : "主题色（有限色板）"}
            </label>
            <div className="flex flex-wrap gap-2.5">
              {THEME_SWATCHES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  title={lang === "en" ? s.labelEn : s.labelZh}
                  onClick={() => setThemeHex(s.hex)}
                  className={cn(
                    "w-9 h-9 rounded-full border-2 transition-transform active:scale-95 shadow-sm",
                    themeHex.toLowerCase() === s.hex.toLowerCase()
                      ? "border-foreground scale-110"
                      : "border-white/80 ring-1 ring-black/5"
                  )}
                  style={{ backgroundColor: s.hex }}
                />
              ))}
            </div>
          </div>

          <Input
            label={lang === "en" ? "Title on paper (optional)" : "印刷标题（可选）"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              selectedProduct
                ? `${selectedProduct.name} S$${valueSgd}`
                : lang === "en"
                  ? "Auto from product if empty"
                  : "留空则用产品名 + 面值"
            }
            className="rounded-xl"
          />

          <Input
            label={lang === "en" ? "Quantity (max 500)" : "数量（最多 500）"}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputMode="numeric"
            className="rounded-xl"
          />

          {/* Preview */}
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {lang === "en" ? "Live preview" : "实时预览"}
            </p>
            <TicketVisualCard
              templateId={visualTemplateId}
              themeColor={themeHex}
              type={paperType}
              title={previewTitle}
              valueCents={Math.round(parseFloat(valueSgd || "0") * 100) || 1000}
              storeName={storeName}
              businessName={businessName}
              businessLogo={businessLogo}
              validLabel="—"
              code="PT-PREVIEW"
              lang={lang}
              mode="print"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive bg-destructive/5 border border-destructive/15 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button className="flex-1 shadow-sm" onClick={create} loading={loading}>
              {lang === "en" ? "Generate codes" : "生成券码"}
            </Button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 h-10 text-sm font-medium text-muted-foreground bg-muted/80 hover:bg-muted rounded-full active:scale-[0.97] transition-all"
            >
              {lang === "en" ? "Cancel" : "取消"}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

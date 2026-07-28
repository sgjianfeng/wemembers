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
import { Dice5 } from "lucide-react";

export type BallotCampaign = {
  id: string;
  name: string;
  type: string;
  status: string;
  productKind?: string;
  /** face tiers from linked exclusive product, default 50/100 */
  enabledTiers?: number[];
};

/**
 * 入箱票专用新建批次：功能仓独立入口，不混在实体印刷纸质类型里。
 */
export function PhysicalBallotCreateForm({
  stores,
  campaigns = [],
  lang,
  businessName,
  businessLogo,
}: {
  stores: { id: string; name: string }[];
  campaigns?: BallotCampaign[];
  lang: "zh" | "en";
  businessName?: string | null;
  businessLogo?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [storeId, setStoreId] = useState(stores[0]?.id || "");
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id || "");
  const selected = useMemo(
    () => campaigns.find((c) => c.id === campaignId) || null,
    [campaigns, campaignId]
  );
  const tiers = useMemo(() => {
    if (selected?.enabledTiers?.length) return selected.enabledTiers;
    return [50, 100];
  }, [selected]);
  const [valueSgd, setValueSgd] = useState(String(tiers[0] ?? 100));
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState("50");
  const [visualTemplateId, setVisualTemplateId] = useState("store_bold");
  const [themeHex, setThemeHex] = useState("#FF6B35");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setValueSgd((prev) => {
      const n = Number(prev);
      if (tiers.includes(n)) return prev;
      return String(tiers[0] ?? 100);
    });
  }, [tiers]);

  const templates = useMemo(() => listVisualTemplatesForType("draw"), []);
  const storeName = stores.find((s) => s.id === storeId)?.name || "Store";

  async function create() {
    setLoading(true);
    setError("");
    if (!campaignId) {
      setError(
        lang === "en"
          ? "Link an exclusive draw campaign"
          : "入箱票须关联独享抽奖活动"
      );
      setLoading(false);
      return;
    }
    const valueCents = Math.round(parseFloat(valueSgd || "0") * 100);
    const autoTitle =
      title.trim() ||
      (lang === "en"
        ? `Ballot S$${valueSgd} (box only)`
        : `入箱票 S$${valueSgd}`);
    const res = await fetch("/api/business/physical/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId,
        type: "ballot",
        title: autoTitle,
        valueCents,
        quantity: parseInt(quantity, 10) || 0,
        visualTemplateId,
        themeColor: themeHex,
        campaignId,
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
          "w-full rounded-2xl border border-dashed border-brand/40",
          "bg-gradient-to-br from-brand/[0.08] via-card to-card",
          "px-4 py-4 text-left",
          "hover:border-brand/60 active:scale-[0.99] transition-all shadow-sm"
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand shrink-0">
            <Dice5 size={20} strokeWidth={1.8} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {lang === "en" ? "+ New ballot batch" : "+ 新建入箱票批次"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              {lang === "en"
                ? "Box ritual only · not spendable · link exclusive 15%"
                : "只投抽奖箱 · 不抵消费 · 关联独享 15% 活动"}
            </p>
          </div>
        </div>
      </button>
    );
  }

  const previewTitle =
    title.trim() ||
    (lang === "en" ? "Ballot (box only)" : "入箱抽奖票");

  return (
    <Card className="overflow-hidden border-border/80 shadow-md shadow-brand/[0.05]">
      <CardContent className="p-0">
        <div className="px-4 pt-4 pb-3 border-b border-border/70 bg-gradient-to-b from-brand/[0.06] to-transparent">
          <p className="text-sm font-semibold text-foreground">
            {lang === "en" ? "New ballot batch" : "新建入箱票批次"}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            {lang === "en"
              ? "Print → hand to customer → drop in box. Grand pool = face × 10%. Not a spend voucher."
              : "打印 → 交给顾客 → 投入箱中。大奖贡献=面值×10%。不抵消费。"}
          </p>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-foreground mb-1.5">
              {lang === "en"
                ? "Print / stock store"
                : "印刷/出库门店"}
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

          <div>
            <label className="block text-[13px] font-medium text-foreground mb-1.5">
              {lang === "en"
                ? "Exclusive draw activity (required)"
                : "独享抽奖活动（必选）"}
            </label>
            {campaigns.length === 0 ? (
              <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 rounded-xl p-3 leading-relaxed">
                {lang === "en"
                  ? "No exclusive draw campaign. Create exclusive ballot product first."
                  : "暂无独享抽奖活动。请先创建「投箱大奖·独享 15%」产品/活动。"}
              </p>
            ) : (
              <div className="space-y-2">
                {campaigns.map((c) => {
                  const active = campaignId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCampaignId(c.id)}
                      className={cn(
                        "w-full text-left rounded-2xl border px-3.5 py-3 transition-all active:scale-[0.99]",
                        active
                          ? "border-brand bg-brand/[0.08] shadow-sm ring-1 ring-brand/20"
                          : "border-border/80 bg-card hover:border-brand/30"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          {c.name}
                        </p>
                        <span className="text-[10px] font-medium text-brand bg-brand/10 rounded-full px-2 py-0.5">
                          {c.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {lang === "en"
                          ? "Exclusive · box ballot linked"
                          : "独享 · 可打入箱票"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[13px] font-medium text-foreground mb-1.5">
              {lang === "en" ? "Tier face (S$)" : "档位面值"}
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
                        ? "border-brand bg-brand text-brand-foreground shadow-sm"
                        : "border-border bg-card text-foreground hover:border-brand/40"
                    )}
                  >
                    S${t}
                  </button>
                );
              })}
            </div>
          </div>

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
                      ? "border-brand bg-brand/[0.06] ring-1 ring-brand/15"
                      : "border-border/80 hover:border-muted-foreground/25"
                  )}
                >
                  <p className="text-sm font-semibold text-foreground">
                    {lang === "en" ? t.nameEn : t.nameZh}
                    {t.recommended && (
                      <span className="ml-1.5 text-[10px] font-medium text-brand">
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

          <div>
            <label className="block text-[13px] font-medium text-foreground mb-1.5">
              {lang === "en" ? "Theme color" : "主题色"}
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
              lang === "en" ? "e.g. Box ballot S$100" : "如：入箱票 S$100"
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

          <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {lang === "en" ? "Live preview" : "实时预览"}
            </p>
            <TicketVisualCard
              templateId={visualTemplateId}
              themeColor={themeHex}
              type="ballot"
              title={previewTitle}
              valueCents={Math.round(parseFloat(valueSgd || "0") * 100) || 10000}
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
              {lang === "en" ? "Generate ballots" : "生成入箱票"}
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

"use client";

import { useMemo, useState } from "react";
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

export function PhysicalBatchCreateForm({
  stores,
  campaigns = [],
  lang,
  businessName,
  businessLogo,
}: {
  stores: { id: string; name: string }[];
  campaigns?: {
    id: string;
    name: string;
    type: string;
    status: string;
    productKind?: string;
  }[];
  lang: "zh" | "en";
  businessName?: string | null;
  businessLogo?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [storeId, setStoreId] = useState(stores[0]?.id || "");
  const [type, setType] = useState<"voucher" | "draw" | "ballot">("voucher");
  const drawCampaigns = useMemo(
    () =>
      campaigns.filter(
        (c) =>
          (c.type === "lucky_draw_v2" || c.type === "lucky_draw") &&
          (c.productKind === "self_use" || !c.productKind)
      ),
    [campaigns]
  );
  const [campaignId, setCampaignId] = useState(drawCampaigns[0]?.id || "");
  const [title, setTitle] = useState("");
  const [valueSgd, setValueSgd] = useState("10");
  const [quantity, setQuantity] = useState("20");
  const [visualTemplateId, setVisualTemplateId] = useState("store_classic");
  const [themeHex, setThemeHex] = useState("#1A6EFF");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const templates = useMemo(
    () => listVisualTemplatesForType(type),
    [type]
  );

  const storeName = stores.find((s) => s.id === storeId)?.name || "Store";

  function onTypeChange(next: "voucher" | "draw" | "ballot") {
    setType(next);
    if (next === "draw" || next === "ballot") {
      setValueSgd(next === "ballot" ? "100" : "100");
      if (drawCampaigns[0]) setCampaignId(drawCampaigns[0].id);
      setThemeHex("#FF6B35");
    } else {
      setValueSgd("10");
    }
    const rec = listVisualTemplatesForType(
      next === "ballot" ? "draw" : next
    ).find((t) => t.recommended);
    if (rec) {
      setVisualTemplateId(rec.id);
      if (next !== "ballot") setThemeHex(rec.defaultThemeHex);
    }
  }

  async function create() {
    setLoading(true);
    setError("");
    if ((type === "draw" || type === "ballot") && !campaignId) {
      setError(
        lang === "en"
          ? "Link an exclusive draw campaign"
          : type === "ballot"
            ? "入箱票须关联独享抽奖活动"
            : "请选择关联活动：绑定后按线上抽奖券进奖池"
      );
      setLoading(false);
      return;
    }
    const valueCents = Math.round(parseFloat(valueSgd || "0") * 100);
    const res = await fetch("/api/business/physical/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId,
        type,
        title: title.trim(),
        valueCents,
        quantity: parseInt(quantity, 10) || 0,
        visualTemplateId,
        themeColor: themeHex,
        campaignId:
          type === "draw" || type === "ballot" ? campaignId : null,
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
        className="w-full p-3 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary hover:text-primary active:scale-[0.98] transition-transform"
      >
        {lang === "en" ? "+ New print batch" : "+ 新建印刷批次"}
      </button>
    );
  }

  const previewTitle =
    title.trim() ||
    (type === "ballot"
      ? lang === "en"
        ? "Ballot (box only)"
        : "入箱抽奖票"
      : type === "draw"
        ? lang === "en"
          ? "Lucky draw ticket"
          : "抽奖券"
        : lang === "en"
          ? "Store voucher"
          : "本店代金券");

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">
          {lang === "en" ? "New batch" : "新建批次"}
        </p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {lang === "en"
            ? "Pick a system template (not a design tool). Logo comes from Settings."
            : "选择系统精修模版（非设计工具）。Logo 来自企业设置。"}
        </p>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            {lang === "en"
              ? "Print / stock store"
              : "印刷/出库门店（集团仍可核）"}
          </label>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            {lang === "en" ? "Type" : "类型"}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                {
                  id: "voucher" as const,
                  label: lang === "en" ? "Voucher" : "自用券",
                },
                {
                  id: "draw" as const,
                  label: lang === "en" ? "Draw" : "抽奖消费券",
                },
                {
                  id: "ballot" as const,
                  label: lang === "en" ? "Ballot" : "入箱票",
                },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTypeChange(t.id)}
                className={cn(
                  "h-10 rounded-full text-[10px] font-semibold border active:scale-[0.97] transition-transform px-1",
                  type === t.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
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
                  "text-left rounded-xl border p-3 transition-colors active:scale-[0.98] transition-transform",
                  visualTemplateId === t.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {lang === "en" ? t.nameEn : t.nameZh}
                    {t.recommended && (
                      <span className="ml-1.5 text-[10px] font-medium text-primary">
                        {lang === "en" ? "Recommended" : "推荐"}
                      </span>
                    )}
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {lang === "en" ? t.taglineEn : t.taglineZh}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            {lang === "en" ? "Theme color" : "主题色（有限色板）"}
          </label>
          <div className="flex flex-wrap gap-2">
            {THEME_SWATCHES.map((s) => (
              <button
                key={s.id}
                type="button"
                title={lang === "en" ? s.labelEn : s.labelZh}
                onClick={() => setThemeHex(s.hex)}
                className={cn(
                  "w-8 h-8 rounded-full border-2 transition-transform active:scale-95",
                  themeHex.toLowerCase() === s.hex.toLowerCase()
                    ? "border-foreground scale-110"
                    : "border-transparent"
                )}
                style={{ backgroundColor: s.hex }}
              />
            ))}
          </div>
        </div>

        <Input
          label={lang === "en" ? "Title on paper" : "印刷标题"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            type === "ballot"
              ? lang === "en"
                ? "e.g. Box ballot S$100"
                : "如：入箱票 S$100"
              : type === "draw"
                ? lang === "en"
                  ? "e.g. Meow BBQ lucky draw"
                  : "如：猫抓烤肉抽奖券"
                : lang === "en"
                  ? "e.g. S$10 off"
                  : "如：S$10 烤肉代金券"
          }
        />
        {(type === "voucher" || type === "draw" || type === "ballot") && (
          <Input
            label={
              type === "ballot"
                ? lang === "en"
                  ? "Tier face (S$) 50 or 100"
                  : "档位面值（新币）50 或 100"
                : type === "draw"
                  ? lang === "en"
                    ? "Face value (S$) e.g. 50/100/200"
                    : "面值（新币）如 50/100/200"
                  : lang === "en"
                    ? "Face value (S$)"
                    : "面值（新币）"
            }
            value={valueSgd}
            onChange={(e) => setValueSgd(e.target.value)}
            inputMode="decimal"
          />
        )}
        {type === "ballot" && (
          <p className="text-[11px] text-muted-foreground leading-relaxed rounded-lg bg-muted/50 p-2">
            {lang === "en"
              ? "Ballot is for the physical box only (not spendable). Grand pool contribution = 10% of face. Link exclusive 15% campaign."
              : "入箱票只投抽奖箱、不抵消费。大奖贡献=面值×10%。须关联独享 15% 活动。顾客扫码付 50/100 后发给纸票投箱。"}
          </p>
        )}
        {(type === "draw" || type === "ballot") && (
          <div>
            <label className="block text-sm font-medium mb-1.5">
              {lang === "en"
                ? "Exclusive draw campaign (required)"
                : "独享抽奖活动（必选）"}
            </label>
            {drawCampaigns.length === 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded-lg p-2">
                {lang === "en" ? (
                  <>
                    No exclusive draw campaign. Create a self-use lucky-draw
                    campaign first.
                  </>
                ) : (
                  <>
                    暂无独享抽奖活动。请先到「活动」创建先收款·抽奖（独享），或运行默认开店包脚本。
                  </>
                )}
              </p>
            ) : (
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm"
              >
                {drawCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · 独享 ({c.status})
                  </option>
                ))}
              </select>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">
              {type === "ballot"
                ? lang === "en"
                  ? "Print → hand to customer → drop in box. Online PayNow still funds pools."
                  : "打印 → 交给顾客 → 投入箱中。线上 PayNow 仍负责进池与小奖。"
                : lang === "en"
                  ? "Cash sell deducts 15% from business top-up (3%+2%+10% grand)."
                  : "现金售出时从企业账户扣 15%（小奖3%+服务费2%+大奖10%）。"}
            </p>
          </div>
        )}
        <Input
          label={lang === "en" ? "Quantity (max 500)" : "数量（最多 500）"}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          inputMode="numeric"
        />

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            {lang === "en" ? "Live preview" : "实时预览"}
          </p>
          <TicketVisualCard
            templateId={visualTemplateId}
            themeColor={themeHex}
            type={type}
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

        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={create} loading={loading}>
            {lang === "en" ? "Generate codes" : "生成券码"}
          </Button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex-1 h-10 text-sm text-muted-foreground bg-muted rounded-full active:scale-[0.97] transition-transform"
          >
            {lang === "en" ? "Cancel" : "取消"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

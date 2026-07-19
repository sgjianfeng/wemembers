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
  campaigns?: { id: string; name: string; type: string; status: string }[];
  lang: "zh" | "en";
  businessName?: string | null;
  businessLogo?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [storeId, setStoreId] = useState(stores[0]?.id || "");
  const [type, setType] = useState<"voucher" | "draw">("voucher");
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id || "");
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

  function onTypeChange(next: "voucher" | "draw") {
    setType(next);
    const rec = listVisualTemplatesForType(next).find((t) => t.recommended);
    if (rec) {
      setVisualTemplateId(rec.id);
      setThemeHex(rec.defaultThemeHex);
    }
  }

  async function create() {
    setLoading(true);
    setError("");
    if (type === "draw" && !campaignId) {
      setError(
        lang === "en"
          ? "Link a campaign so bind = online draw ticket"
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
        valueCents: type === "voucher" ? valueCents : 0,
        quantity: parseInt(quantity, 10) || 0,
        visualTemplateId,
        themeColor: themeHex,
        campaignId: type === "draw" ? campaignId : null,
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
        className="w-full p-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-[#1A6EFF] hover:text-[#1A6EFF]"
      >
        {lang === "en" ? "+ New print batch" : "+ 新建印刷批次"}
      </button>
    );
  }

  const previewTitle =
    title.trim() ||
    (type === "draw"
      ? lang === "en"
        ? "Lucky draw ticket"
        : "抽奖券"
      : lang === "en"
        ? "Store voucher"
        : "本店代金券");

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-900">
          {lang === "en" ? "New batch" : "新建批次"}
        </p>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {lang === "en"
            ? "Pick a system template (not a design tool). Logo comes from Settings."
            : "选择系统精修模版（非设计工具）。Logo 来自企业设置。"}
        </p>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            {lang === "en" ? "Store (required)" : "门店（必选 · 仅本店可用）"}
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
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: "voucher" as const, label: lang === "en" ? "Cash voucher" : "代金券" },
                { id: "draw" as const, label: lang === "en" ? "Draw ticket" : "抽奖券" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTypeChange(t.id)}
                className={cn(
                  "h-10 rounded-full text-xs font-semibold border",
                  type === t.id
                    ? "border-[#1A6EFF] bg-blue-50 text-[#1A6EFF]"
                    : "border-slate-200 text-slate-600"
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
                  "text-left rounded-xl border p-3 transition-colors",
                  visualTemplateId === t.id
                    ? "border-[#1A6EFF] bg-blue-50/60"
                    : "border-slate-100 hover:border-slate-200"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {lang === "en" ? t.nameEn : t.nameZh}
                    {t.recommended && (
                      <span className="ml-1.5 text-[10px] font-medium text-[#1A6EFF]">
                        {lang === "en" ? "Recommended" : "推荐"}
                      </span>
                    )}
                  </p>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
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
                  "w-8 h-8 rounded-full border-2 transition-transform",
                  themeHex.toLowerCase() === s.hex.toLowerCase()
                    ? "border-slate-900 scale-110"
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
            type === "draw"
              ? lang === "en"
                ? "e.g. Meow BBQ lucky draw"
                : "如：猫抓烤肉抽奖券"
              : lang === "en"
                ? "e.g. S$10 off"
                : "如：S$10 烤肉代金券"
          }
        />
        {type === "voucher" && (
          <Input
            label={lang === "en" ? "Face value (S$)" : "面值（新币）"}
            value={valueSgd}
            onChange={(e) => setValueSgd(e.target.value)}
            inputMode="decimal"
          />
        )}
        {type === "draw" && (
          <div>
            <label className="block text-sm font-medium mb-1.5">
              {lang === "en"
                ? "Linked campaign (required)"
                : "关联线上活动（必选 · 绑定后进大奖池）"}
            </label>
            {campaigns.length === 0 ? (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
                {lang === "en" ? (
                  <>
                    No active campaign. Create one under Campaigns first, then
                    print draw tickets.
                  </>
                ) : (
                  <>
                    暂无可用活动。请先到「活动」创建抽奖/促销活动，再印实体抽奖券。
                  </>
                )}
              </p>
            ) : (
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm"
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.status})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <Input
          label={lang === "en" ? "Quantity (max 500)" : "数量（最多 500）"}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          inputMode="numeric"
        />

        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">
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

        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={create} loading={loading}>
            {lang === "en" ? "Generate codes" : "生成券码"}
          </Button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex-1 h-10 text-sm text-slate-500 bg-slate-100 rounded-full"
          >
            {lang === "en" ? "Cancel" : "取消"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

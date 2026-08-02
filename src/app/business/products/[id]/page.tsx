"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useLang } from "@/components/i18n/LanguageProvider";

/** Common face amounts (SGD) merchants can toggle（含大奖定制档 150） */
const PRESET_TIERS = [2, 5, 10, 20, 50, 100, 150, 200, 500] as const;

type ProductDetail = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  productKind: string;
  status: string;
  slug: string | null;
  buyPath: string | null;
  enabledTiers: number[];
  packKind: string | null;
  discountPercent: number;
  exclusiveFeeTotalPercent: number | null;
};

export default function ProductDetailPage() {
  const { lang } = useLang();
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || "");

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tiers, setTiers] = useState<number[]>([]);
  const [customTier, setCustomTier] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/business/products/${id}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || (lang === "en" ? "Load failed" : "加载失败"));
        setProduct(null);
        return;
      }
      const p = j.data as ProductDetail;
      setProduct(p);
      setName(p.name || "");
      setDescription(p.description || "");
      setTiers([...(p.enabledTiers || [])].sort((a, b) => a - b));
    } finally {
      setLoading(false);
    }
  }, [id, lang]);

  useEffect(() => {
    load();
  }, [load]);

  const presetSet = useMemo(() => new Set<number>(PRESET_TIERS), []);
  const extraTiers = tiers.filter((t) => !presetSet.has(t));

  function toggleTier(amount: number) {
    setTiers((prev) => {
      if (prev.includes(amount)) {
        if (prev.length <= 1) return prev; // keep at least one
        return prev.filter((x) => x !== amount).sort((a, b) => a - b);
      }
      return [...prev, amount].sort((a, b) => a - b);
    });
    setOk("");
  }

  function addCustom() {
    const n = Math.round(Number(customTier));
    if (!Number.isFinite(n) || n < 2) {
      setError(
        lang === "en" ? "Face value must be ≥ S$2" : "面额至少 S$2"
      );
      return;
    }
    if (n > 100_000) {
      setError(lang === "en" ? "Face value too large" : "面额过大");
      return;
    }
    setError("");
    setTiers((prev) =>
      prev.includes(n) ? prev : [...prev, n].sort((a, b) => a - b)
    );
    setCustomTier("");
    setOk("");
  }

  async function save() {
    if (!id) return;
    if (tiers.length === 0) {
      setError(
        lang === "en"
          ? "Select at least one face value"
          : "请至少选择一个面额"
      );
      return;
    }
    setSaving(true);
    setError("");
    setOk("");
    try {
      const res = await fetch(`/api/business/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          enabledTiers: tiers,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || (lang === "en" ? "Save failed" : "保存失败"));
        return;
      }
      setOk(lang === "en" ? "Saved" : "已保存");
      router.push("/business/products");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: string) {
    if (!id) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/business/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "fail");
        return;
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        …
      </div>
    );
  }

  if (!product) {
    return (
      <div className="px-4 py-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          {error || (lang === "en" ? "Not found" : "产品不存在")}
        </p>
        <Link href="/business/products" className="text-sm text-primary">
          ← {lang === "en" ? "Back" : "返回列表"}
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-10 min-h-screen">
      <div className="px-4 py-3 border-b border-border sticky top-0 bg-background/95 z-10 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/business/products")}
            className="text-xs text-primary font-medium"
          >
            ← {lang === "en" ? "Products" : "券产品"}
          </button>
        </div>
        <h1 className="text-lg font-semibold text-foreground mt-1 truncate">
          {product.name}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {product.type === "lucky_draw_v2"
            ? lang === "en"
              ? "Draw product · face values customers can buy"
              : "抽奖产品 · 设置顾客可选面额"
            : lang === "en"
              ? "Voucher product · face values customers can buy"
              : "代金产品 · 设置顾客可选面额"}
        </p>
      </div>

      <div className="px-4 mt-4 space-y-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <Input
              label={lang === "en" ? "Product name" : "产品名称"}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setOk("");
              }}
            />
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {lang === "en" ? "Description (optional)" : "说明（可选）"}
              </label>
              <textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setOk("");
                }}
                rows={2}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground resize-none"
                placeholder={
                  lang === "en"
                    ? "Shown to staff; keep short"
                    : "给店员看的简短说明"
                }
              />
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-full bg-muted px-2 py-0.5">
                {product.status === "active"
                  ? lang === "en"
                    ? "On shelf"
                    : "已上架"
                  : product.status === "draft"
                    ? lang === "en"
                      ? "Draft"
                      : "草稿"
                    : lang === "en"
                      ? "Archived"
                      : "已下架"}
              </span>
              {product.discountPercent > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5">
                  {lang === "en" ? "Discount" : "折扣"} {product.discountPercent}%
                </span>
              )}
              {product.exclusiveFeeTotalPercent != null &&
                product.exclusiveFeeTotalPercent > 0 && (
                  <span className="rounded-full bg-muted px-2 py-0.5">
                    exclusive {product.exclusiveFeeTotalPercent}%
                  </span>
                )}
            </div>
            {product.buyPath && product.status === "active" && (
              <p className="text-[11px] text-primary break-all">
                {product.buyPath}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {lang === "en" ? "Face values (SGD)" : "可选面额（新币）"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {lang === "en"
                  ? "Customers pick one amount on the buy page. At least one required (min S$2)."
                  : "顾客购买页会按这里勾选的档位选金额。至少保留一档，最低 S$2。"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {PRESET_TIERS.map((amount) => {
                const on = tiers.includes(amount);
                return (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => toggleTier(amount)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      on
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    S${amount}
                  </button>
                );
              })}
              {extraTiers.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => toggleTier(amount)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-primary text-primary-foreground"
                >
                  S${amount} ×
                </button>
              ))}
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label={lang === "en" ? "Custom amount" : "自定义面额"}
                  type="number"
                  min={2}
                  step={1}
                  value={customTier}
                  onChange={(e) => setCustomTier(e.target.value)}
                  placeholder="e.g. 30"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 shrink-0"
                onClick={addCustom}
              >
                {lang === "en" ? "Add" : "添加"}
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {lang === "en" ? "Selected: " : "已选："}
              {tiers.length
                ? tiers.map((t) => `S$${t}`).join(" · ")
                : lang === "en"
                  ? "none"
                  : "无"}
            </p>
          </CardContent>
        </Card>

        {error && <p className="text-xs text-red-500">{error}</p>}
        {ok && <p className="text-xs text-emerald-600">{ok}</p>}

        <Button
          className="w-full"
          loading={saving}
          disabled={!name.trim() || tiers.length === 0}
          onClick={save}
        >
          {lang === "en" ? "Save changes" : "保存修改"}
        </Button>

        <div className="flex gap-2">
          {product.status !== "active" ? (
            <Button
              className="flex-1"
              variant="outline"
              loading={saving}
              onClick={() => setStatus("active")}
            >
              {lang === "en" ? "Activate" : "上架"}
            </Button>
          ) : (
            <Button
              className="flex-1"
              variant="outline"
              loading={saving}
              onClick={() => setStatus("archived")}
            >
              {lang === "en" ? "Archive" : "下架"}
            </Button>
          )}
          <Link
            href="/business/campaigns"
            className="flex-1 inline-flex items-center justify-center rounded-full border border-border text-xs font-medium text-foreground h-10"
          >
            {lang === "en" ? "Activities" : "管理活动"}
          </Link>
        </div>
      </div>
    </div>
  );
}

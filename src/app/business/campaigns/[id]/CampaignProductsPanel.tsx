"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useLang } from "@/components/i18n/LanguageProvider";

type Product = {
  id: string;
  name: string;
  type: string;
  status: string;
  slug: string | null;
};

export function CampaignProductsPanel({ campaignId }: { campaignId: string }) {
  const { lang } = useLang();
  const [all, setAll] = useState<Product[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, ln] = await Promise.all([
        fetch("/api/business/products"),
        fetch(`/api/business/campaigns/${campaignId}/products`),
      ]);
      if (pr.ok) {
        const j = await pr.json();
        // 活动只挂已上架产品；草稿/下架不出现在勾选列表
        setAll(
          ((j.data || []) as Product[]).filter((p) => p.status === "active")
        );
      }
      if (ln.ok) {
        const j = await ln.json();
        setSelected(
          (j.data || []).map((x: { productId: string }) => x.productId)
        );
      }
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`/api/business/campaigns/${campaignId}/products`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: selected }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg(j.error || "fail");
        return;
      }
      setMsg(lang === "en" ? "Saved" : "已保存");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">
        {lang === "en" ? "Voucher products in this activity" : "本活动包含的券产品"}
      </h3>
      <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">
        {lang === "en"
          ? "Pick catalog products. Stores that join this activity can sell them."
          : "勾选已上架的券产品。门店参与本活动后即可售卖。"}
      </p>
      {loading ? (
        <p className="text-xs text-muted-foreground">…</p>
      ) : all.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {lang === "en" ? (
            <>
              No products.{" "}
              <a href="/business/products" className="text-primary">
                Create products
              </a>
            </>
          ) : (
            <>
              还没有券产品。
              <a href="/business/products" className="text-primary">
                去创建
              </a>
            </>
          )}
        </p>
      ) : (
        <ul className="space-y-2">
          {all.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={() => toggle(p.id)}
                className="rounded border-border"
              />
              <span className="min-w-0 flex-1">
                <span className="text-sm font-medium text-foreground block truncate">
                  {p.name}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {p.status} · {p.slug || p.id.slice(0, 8)}
                </span>
              </span>
            </label>
          ))}
        </ul>
      )}
      <Button className="w-full mt-3" loading={saving} onClick={save}>
        {lang === "en" ? "Save products" : "保存产品列表"}
      </Button>
      {msg && (
        <p className="text-xs text-center mt-2 text-muted-foreground">{msg}</p>
      )}
    </div>
  );
}

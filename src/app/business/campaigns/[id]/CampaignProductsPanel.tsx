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

/**
 * 活动设置 · 关联「可售」券产品（勾选上架线）
 * 与赠送/权益券列表同属「本活动包含的券」，此处只做产品线勾选
 */
export function CampaignProductsPanel({ campaignId }: { campaignId: string }) {
  const { lang } = useLang();
  const [all, setAll] = useState<Product[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, ln] = await Promise.all([
        fetch("/api/business/products"),
        fetch(`/api/business/campaigns/${campaignId}/products`),
      ]);
      if (pr.ok) {
        const j = await pr.json();
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
      // 刷新页面以同步上方统一列表
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <p className="text-xs font-semibold text-foreground">
            {lang === "en"
              ? "Link sellable products"
              : "关联可售产品线"}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {lang === "en"
              ? `${selected.length} selected · pick catalog products stores can sell`
              : `已选 ${selected.length} 条 · 勾选上架产品，门店参与后可售`}
          </p>
        </div>
        <span className="text-xs text-primary font-medium shrink-0">
          {open
            ? lang === "en"
              ? "Collapse"
              : "收起"
            : lang === "en"
              ? "Edit"
              : "编辑"}
        </span>
      </button>

      {open && (
        <div className="mt-3 pt-3 border-t border-border/60">
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
                  还没有可售产品。
                  <a href="/business/products" className="text-primary">
                    去券产品
                  </a>
                </>
              )}
            </p>
          ) : (
            <ul className="space-y-2">
              {all.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl bg-card px-3 py-2 cursor-pointer border border-border/50"
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
                      {p.slug || p.id.slice(0, 8)}
                    </span>
                  </span>
                </label>
              ))}
            </ul>
          )}
          <Button className="w-full mt-3" loading={saving} onClick={save}>
            {lang === "en" ? "Save product links" : "保存可售关联"}
          </Button>
          {msg && (
            <p className="text-xs text-center mt-2 text-muted-foreground">{msg}</p>
          )}
        </div>
      )}
    </div>
  );
}

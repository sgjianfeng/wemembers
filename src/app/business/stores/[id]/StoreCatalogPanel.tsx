"use client";

import { useCallback, useEffect, useState } from "react";
import { useLang } from "@/components/i18n/LanguageProvider";
import Link from "next/link";

type Product = {
  id: string;
  name: string;
  type: string;
  status: string;
  productKind: string;
  templateId: string | null;
  slug: string | null;
  discountPercent: number;
  exclusiveFeeTotalPercent: number | null;
  enabledTiers: number[];
  enabled: boolean;
};

export function StoreCatalogPanel({ storeId }: { storeId: string }) {
  const { lang } = useLang();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/business/stores/${storeId}/catalog`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "load failed");
        return;
      }
      const j = await res.json();
      setProducts(j.data?.products || []);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(campaignId: string, enabled: boolean) {
    setSaving(campaignId);
    setError("");
    try {
      const res = await fetch(`/api/business/stores/${storeId}/catalog`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, enabled }),
      });
      if (res.ok) {
        setProducts((prev) =>
          prev.map((p) => (p.id === campaignId ? { ...p, enabled } : p))
        );
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error || (lang === "en" ? "Failed" : "更新失败"));
      }
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">
        {lang === "en" ? "Products for this store" : "本店可售产品"}
      </h3>
      <p className="text-[11px] text-slate-400 mt-0.5 mb-3">
        {lang === "en"
          ? "Enable company vouchers / exclusive draws for customers at this store"
          : "启用公司创建的代金券/独享抽奖后，本店顾客才可购买"}
      </p>

      {loading ? (
        <p className="text-xs text-slate-400 py-2">
          {lang === "en" ? "Loading…" : "加载中…"}
        </p>
      ) : products.length === 0 ? (
        <p className="text-xs text-slate-400 py-2">
          {lang === "en" ? (
            <>
              No products yet.{" "}
              <Link href="/business/campaigns/new" className="text-[#1A6EFF]">
                Create from template
              </Link>
            </>
          ) : (
            <>
              暂无产品。
              <Link href="/business/campaigns/new" className="text-[#1A6EFF]">
                从模版创建
              </Link>
            </>
          )}
        </p>
      ) : (
        <ul className="space-y-2">
          {products.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {p.name}
                  </p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white text-slate-500 border border-slate-100">
                    {p.productKind === "self_use"
                      ? lang === "en"
                        ? "Self-use"
                        : "自用"
                      : lang === "en"
                        ? "Dist"
                        : "分发"}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {p.status}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {p.enabledTiers?.length
                    ? p.enabledTiers.map((a) => `S$${a}`).join(" / ")
                    : "—"}
                  {p.discountPercent > 0
                    ? ` · ${100 - p.discountPercent}% pay`
                    : ""}
                  {p.exclusiveFeeTotalPercent
                    ? ` · exclusive ${p.exclusiveFeeTotalPercent}%`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={saving === p.id}
                onClick={() => toggle(p.id, !p.enabled)}
                className={`shrink-0 w-12 h-6 rounded-full transition-colors ${
                  p.enabled ? "bg-[#1A6EFF]" : "bg-slate-200"
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    p.enabled ? "translate-x-6" : "translate-x-0.5"
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  );
}

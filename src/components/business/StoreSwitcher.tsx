"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandAvatar } from "@/components/ui/BrandAvatar";
import { cn, resolveStoreLogo } from "@/lib/utils";

export type StoreOption = {
  id: string;
  name: string;
  slug: string;
  address?: string | null;
  /** 门店专属 logo（暂无字段时留空） */
  logoUrl?: string | null;
};

interface Props {
  stores: StoreOption[];
  currentId: string | null;
  locked?: boolean; // staff
  lang?: "zh" | "en";
  /** 企业品牌 logo，门店无专属图时回退 */
  businessLogo?: string | null;
}

export function StoreSwitcher({
  stores,
  currentId,
  locked = false,
  lang = "zh",
  businessLogo = null,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const current = stores.find((s) => s.id === currentId) || stores[0];

  // 首次进入：把默认门店写入 cookie，保证核销与统计一致
  useEffect(() => {
    if (locked || !current) return;
    if (currentId === current.id) return;
    fetch("/api/business/stores/current", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: current.id }),
    }).then(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stores.length === 0) {
    return (
      <a
        href="/business/stores"
        className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800"
      >
        🏪 {lang === "en" ? "Add a store" : "请先添加门店"}
      </a>
    );
  }

  if (locked || stores.length === 1) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-100 px-2.5 py-1 max-w-[160px]">
        <BrandAvatar
          src={resolveStoreLogo(current?.logoUrl, businessLogo)}
          name={current?.name}
          size={18}
          rounded="lg"
        />
        <span className="text-[11px] font-medium text-slate-700 truncate">
          {current?.name || "—"}
        </span>
      </div>
    );
  }

  async function select(id: string) {
    if (id === currentId || loading) return;
    setLoading(true);
    setOpen(false);
    try {
      const res = await fetch("/api/business/stores/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: id }),
      });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className={cn(
          "flex items-center gap-1 rounded-full bg-slate-50 border border-slate-100 px-2.5 py-1 max-w-[180px]",
          "text-[11px] font-medium text-slate-700 hover:bg-slate-100 transition-colors",
          loading && "opacity-60"
        )}
      >
        <BrandAvatar
          src={resolveStoreLogo(current?.logoUrl, businessLogo)}
          name={current?.name}
          size={18}
          rounded="lg"
        />
        <span className="truncate">{current?.name || "—"}</span>
        <span className="text-slate-400 shrink-0">▾</span>
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="close"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl border border-slate-100 bg-white shadow-lg py-1 max-h-64 overflow-auto">
            <p className="px-3 py-1.5 text-[10px] text-slate-400 font-medium">
              {lang === "en" ? "Working store" : "当前工作门店"}
            </p>
            {stores.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => select(s.id)}
                className={cn(
                  "w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2",
                  s.id === current?.id && "bg-blue-50 text-[#1A6EFF] font-semibold"
                )}
              >
                <BrandAvatar
                  src={resolveStoreLogo(s.logoUrl, businessLogo)}
                  name={s.name}
                  size={28}
                  rounded="lg"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{s.name}</span>
                  {s.address && (
                    <span className="block text-[10px] text-slate-400 truncate mt-0.5">
                      {s.address}
                    </span>
                  )}
                </span>
              </button>
            ))}
            <a
              href="/business/stores"
              className="block px-3 py-2 text-xs text-[#1A6EFF] border-t border-slate-50"
            >
              {lang === "en" ? "Manage stores →" : "管理门店 →"}
            </a>
          </div>
        </>
      )}
    </div>
  );
}

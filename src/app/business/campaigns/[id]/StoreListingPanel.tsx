"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLang } from "@/components/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

type Listing = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  enabled: boolean;
};

export function StoreListingPanel({
  campaignId,
  productKind,
  autoOpen,
}: {
  campaignId: string;
  productKind?: string | null;
  autoOpen?: boolean;
}) {
  const { lang } = useLang();
  const [open, setOpen] = useState(!!autoOpen);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/business/campaigns/${campaignId}/stores`);
      if (res.ok) {
        const j = await res.json();
        setListings(j.data?.listings || []);
      }
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function toggle(storeId: string, enabled: boolean) {
    setSaving(storeId);
    setMsg("");
    try {
      const res = await fetch(`/api/business/campaigns/${campaignId}/stores`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, enabled }),
      });
      if (res.ok) {
        setListings((prev) =>
          prev.map((l) => (l.id === storeId ? { ...l, enabled } : l))
        );
      } else {
        const j = await res.json().catch(() => ({}));
        setMsg(j.error || (lang === "en" ? "Failed" : "更新失败"));
      }
    } finally {
      setSaving(null);
    }
  }

  async function enableAll() {
    setSaving("all");
    setMsg("");
    try {
      const res = await fetch(`/api/business/campaigns/${campaignId}/stores`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeIds: listings.map((l) => l.id) }),
      });
      if (res.ok) {
        setListings((prev) => prev.map((l) => ({ ...l, enabled: true })));
      }
    } finally {
      setSaving(null);
    }
  }

  async function disableAll() {
    setSaving("all");
    setMsg("");
    try {
      const res = await fetch(`/api/business/campaigns/${campaignId}/stores`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeIds: [] }),
      });
      if (res.ok) {
        setListings((prev) => prev.map((l) => ({ ...l, enabled: false })));
      }
    } finally {
      setSaving(null);
    }
  }

  const isSelf = productKind === "self_use";

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <p className="text-sm font-semibold text-foreground">
            {lang === "en" ? "Store listing" : "门店选用"}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {isSelf
              ? lang === "en"
                ? "Stores must enable this product before customers can buy"
                : "自用/独享：门店启用后顾客才能在本店购买"
              : lang === "en"
                ? "Which stores sell / redeem this product"
                : "哪些门店可售 / 核销此产品"}
          </p>
        </div>
        <ChevronDown
          size={16}
          className={cn("text-primary transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border">
          {loading ? (
            <p className="text-xs text-muted-foreground py-3">
              {lang === "en" ? "Loading…" : "加载中…"}
            </p>
          ) : listings.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">
              {lang === "en"
                ? "No stores yet. Create a store first."
                : "还没有门店，请先创建门店。"}
            </p>
          ) : (
            <>
              <div className="flex gap-2 py-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 text-xs flex-1"
                  loading={saving === "all"}
                  onClick={enableAll}
                >
                  {lang === "en" ? "Enable all" : "全部启用"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 text-xs flex-1"
                  loading={saving === "all"}
                  onClick={disableAll}
                >
                  {lang === "en" ? "Disable all" : "全部关闭"}
                </Button>
              </div>
              <ul className="space-y-2">
                {listings.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {l.name}
                      </p>
                      {l.address && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {l.address}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={saving === l.id}
                      onClick={() => toggle(l.id, !l.enabled)}
                      className={cn(
                        "shrink-0 w-12 h-6 rounded-full transition-colors",
                        l.enabled ? "bg-primary" : "bg-muted"
                      )}
                      aria-label={l.enabled ? "Disable" : "Enable"}
                    >
                      <div
                        className={cn(
                          "w-5 h-5 bg-white rounded-full shadow transition-transform",
                          l.enabled ? "translate-x-6" : "translate-x-0.5"
                        )}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {msg && (
            <p className="text-xs text-red-500 mt-2">{msg}</p>
          )}
        </div>
      )}
    </div>
  );
}

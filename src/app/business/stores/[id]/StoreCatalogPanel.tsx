"use client";

import { useCallback, useEffect, useState } from "react";
import { useLang } from "@/components/i18n/LanguageProvider";
import Link from "next/link";

type LinkedProduct = {
  id: string;
  name: string;
  status: string;
  slug: string | null;
  type: string;
};

type ActivityRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  productKind: string;
  tone?: string;
  slug: string | null;
  discountPercent: number;
  exclusiveFeeTotalPercent: number | null;
  enabledTiers: number[];
  enabled: boolean;
  products: LinkedProduct[];
};

function toneLabel(tone: string | undefined, type: string, zh: boolean): string {
  if (tone === "ndp" || type === "holiday") return zh ? "满赠" : "Spend&get";
  if (tone === "draw" || type === "lucky_draw_v2" || type === "lucky_draw")
    return zh ? "大奖" : "Draw";
  return zh ? "长期/代金" : "Voucher";
}

export function StoreCatalogPanel({ storeId }: { storeId: string }) {
  const { lang } = useLang();
  const zh = lang !== "en";
  const [activities, setActivities] = useState<ActivityRow[]>([]);
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
      const list =
        (j.data?.activities as ActivityRow[] | undefined) ||
        (j.data?.products as ActivityRow[] | undefined) ||
        [];
      setActivities(
        list.map((a) => ({
          ...a,
          products: Array.isArray(a.products) ? a.products : [],
        }))
      );
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
        setActivities((prev) =>
          prev.map((a) => (a.id === campaignId ? { ...a, enabled } : a))
        );
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error || (zh ? "更新失败" : "Failed"));
      }
    } finally {
      setSaving(null);
    }
  }

  const joined = activities.filter((a) => a.enabled).length;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            {zh ? "活动参与" : "Activity join"}
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            {zh
              ? "开关本店是否参加公司活动；顾客可买的产品由活动挂载决定"
              : "Toggle which company activities this store joins; sellable products come from linked activity catalog"}
          </p>
        </div>
        {!loading && activities.length > 0 && (
          <span className="shrink-0 text-[10px] font-medium text-muted-foreground tabular-nums">
            {zh ? `已参加 ${joined}/${activities.length}` : `${joined}/${activities.length} on`}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground py-2">
          {zh ? "加载中…" : "Loading…"}
        </p>
      ) : activities.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          {zh ? (
            <>
              暂无进行中的活动。
              <Link href="/business/campaigns" className="text-primary font-medium">
                去活动管理
              </Link>
            </>
          ) : (
            <>
              No active activities.{" "}
              <Link href="/business/campaigns" className="text-primary font-medium">
                Activities
              </Link>
            </>
          )}
        </p>
      ) : (
        <ul className="space-y-2 mt-2">
          {activities.map((a) => {
            const productNames = a.products
              .filter((p) => p.status === "active" || p.status === "draft")
              .map((p) => p.name);
            const tiers =
              a.enabledTiers?.length > 0
                ? a.enabledTiers.map((n) => `S$${n}`).join(" / ")
                : null;
            return (
              <li
                key={a.id}
                className={`rounded-xl px-3 py-2.5 border transition-colors ${
                  a.enabled
                    ? "bg-primary/5 border-primary/20"
                    : "bg-muted/40 border-transparent"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Link
                        href={`/business/campaigns/${a.id}`}
                        className="text-sm font-semibold text-foreground truncate hover:text-primary"
                      >
                        {a.name}
                      </Link>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-card text-muted-foreground border border-border">
                        {toneLabel(a.tone, a.type, zh)}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          a.status === "active"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {a.status === "active"
                          ? zh
                            ? "进行中"
                            : "Active"
                          : a.status}
                      </span>
                      {a.enabled && (
                        <span className="text-[10px] font-medium text-primary">
                          {zh ? "本店已参加" : "Joined"}
                        </span>
                      )}
                    </div>
                    {/* 挂载产品 = 本店可售呈现 */}
                    <p className="text-[11px] text-foreground/80 mt-1 leading-snug">
                      {productNames.length > 0 ? (
                        <>
                          <span className="text-muted-foreground">
                            {zh ? "挂载产品：" : "Products: "}
                          </span>
                          {productNames.join(" · ")}
                        </>
                      ) : a.type === "holiday" || a.tone === "ndp" ? (
                        <span className="text-muted-foreground">
                          {zh
                            ? "满赠权益（无货架购券产品）"
                            : "Gift perk (no shelf product)"}
                        </span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-400">
                          {zh
                            ? "未挂产品 — 在活动管理中勾选"
                            : "No products — link in Activities"}
                        </span>
                      )}
                    </p>
                    {(tiers ||
                      a.discountPercent > 0 ||
                      a.exclusiveFeeTotalPercent) && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {tiers || "—"}
                        {a.discountPercent > 0
                          ? ` · ${zh ? "付" : "pay"} ${100 - a.discountPercent}%`
                          : ""}
                        {a.exclusiveFeeTotalPercent
                          ? ` · exclusive ${a.exclusiveFeeTotalPercent}%`
                          : ""}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={saving === a.id}
                    onClick={() => toggle(a.id, !a.enabled)}
                    aria-label={
                      a.enabled
                        ? zh
                          ? "取消本店参加"
                          : "Leave activity"
                        : zh
                          ? "本店参加活动"
                          : "Join activity"
                    }
                    className={`shrink-0 w-12 h-6 rounded-full transition-colors ${
                      a.enabled ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-card rounded-full shadow transition-transform ${
                        a.enabled ? "translate-x-6" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
        {zh ? (
          <>
            活动与挂券在
            <Link href="/business/campaigns" className="text-primary font-medium">
              活动管理
            </Link>
            ；本店日常操作在
            <Link
              href={`/business/offers?storeId=${encodeURIComponent(storeId)}`}
              className="text-primary font-medium"
            >
              活动券
            </Link>
            。
          </>
        ) : (
          <>
            Configure activities under{" "}
            <Link href="/business/campaigns" className="text-primary font-medium">
              Activities
            </Link>
            ; day-to-day on{" "}
            <Link
              href={`/business/offers?storeId=${encodeURIComponent(storeId)}`}
              className="text-primary font-medium"
            >
              Offers
            </Link>
            .
          </>
        )}
      </p>
    </div>
  );
}

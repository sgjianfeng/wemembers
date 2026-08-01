"use client";

import { useMemo, useState } from "react";
import { ActivityEntitlementCard } from "@/components/activity/ActivityEntitlementCard";
import type { ActivityBundle } from "@/lib/activity-entitlements";
import {
  OffersPrintSection,
  type PrintableActivity,
} from "./OffersPrintSection";

type Filter =
  | "all"
  | "long_term"
  | "grand_countdown"
  | "ndp"
  | "print"
  | "active"
  | "ended";

function bundleCategory(
  b: ActivityBundle
): "long_term" | "grand_countdown" | "ndp" | "other" {
  if (b.tone === "ndp") return "ndp";
  if (b.tone === "draw") return "grand_countdown";
  // 非国庆、非大奖的活动一律归长期券
  if (b.tone === "voucher" || b.type === "voucher_sale" || b.tone === "default")
    return "long_term";
  return "long_term";
}

export function OffersClient({
  lang,
  bundles,
  printables = [],
  showPrint = true,
}: {
  lang: "zh" | "en";
  bundles: ActivityBundle[];
  printables?: PrintableActivity[];
  /** 企业可设计打印；店员仅看活动权益 */
  showPrint?: boolean;
}) {
  const zh = lang === "zh";
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    return bundles.filter((b) => {
      if (filter === "print") return false; // 打印 tab 用专区
      if (filter === "all") return true;
      if (filter === "active") return b.status === "active" || b.status === "draft";
      if (filter === "ended") return b.status === "ended";
      if (filter === "ndp") return bundleCategory(b) === "ndp";
      if (filter === "long_term") return bundleCategory(b) === "long_term";
      if (filter === "grand_countdown")
        return bundleCategory(b) === "grand_countdown";
      return true;
    });
  }, [bundles, filter]);

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: zh ? "全部" : "All" },
    { key: "long_term", label: zh ? "长期券" : "Long-term" },
    { key: "grand_countdown", label: zh ? "大奖倒计时" : "Countdown" },
    { key: "ndp", label: zh ? "国庆满赠" : "National Day" },
    ...(showPrint
      ? ([{ key: "print" as const, label: zh ? "打印设计" : "Print" }] as const)
      : []),
    { key: "active", label: zh ? "进行中" : "Active" },
    { key: "ended", label: zh ? "已结束" : "Ended" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFilter(c.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${
              filter === c.key
                ? "bg-[#1A6EFF] text-white"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {filter === "print" && showPrint ? (
        <OffersPrintSection lang={lang} activities={printables} />
      ) : (
        <>
          {showPrint && filter === "all" && printables.length > 0 && (
            <div className="rounded-2xl border border-dashed border-violet-500/40 bg-violet-500/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    {zh ? "打印设计 · 活动广告 / 实体券" : "Print · ads & paper"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                    {zh
                      ? "台卡海报与 PT- 实体券 · 点筛选「打印设计」或展开活动操作"
                      : "Posters & PT- tickets · open Print filter or activity actions"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFilter("print")}
                  className="shrink-0 text-[11px] font-semibold text-violet-700 dark:text-violet-300 px-2.5 py-1.5 rounded-full bg-violet-500/15"
                >
                  {zh ? "去设计" : "Design"}
                </button>
              </div>
            </div>
          )}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {zh ? "该分类下暂无活动" : "Nothing in this filter"}
            </p>
          )}
          {filtered.map((b) => (
            <ActivityEntitlementCard
              key={b.key}
              bundle={b}
              lang={lang}
              mode="business"
              defaultOpen={b.tone === "ndp" || b.status === "active"}
            />
          ))}
        </>
      )}
    </div>
  );
}

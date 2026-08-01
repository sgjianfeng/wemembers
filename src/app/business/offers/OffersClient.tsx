"use client";

import { useMemo, useState } from "react";
import { ActivityEntitlementCard } from "@/components/activity/ActivityEntitlementCard";
import type { ActivityBundle } from "@/lib/activity-entitlements";

type Filter = "all" | "active" | "ndp" | "ended";

export function OffersClient({
  lang,
  bundles,
}: {
  lang: "zh" | "en";
  bundles: ActivityBundle[];
}) {
  const zh = lang === "zh";
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    return bundles.filter((b) => {
      if (filter === "all") return true;
      if (filter === "active") return b.status === "active" || b.status === "draft";
      if (filter === "ended") return b.status === "ended";
      if (filter === "ndp") return b.tone === "ndp";
      return true;
    });
  }, [bundles, filter]);

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: zh ? "全部" : "All" },
    { key: "active", label: zh ? "进行中" : "Active" },
    { key: "ndp", label: zh ? "国庆" : "NDP" },
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
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export type CampaignListItem = {
  id: string;
  name: string;
  type: string;
  status: string;
  productKind: string;
  color: string | null;
  startDate: string;
  endDate: string;
  totalClaims: number;
  totalRedemptions: number;
  productNames: string[];
};

type Filter = "all" | "active" | "draft" | "ended";

const typeLabels: Record<string, { zh: string; en: string; icon: string }> = {
  promotion: { zh: "促销", en: "Promotion", icon: "🏷️" },
  seasonal: { zh: "季节", en: "Seasonal", icon: "🌸" },
  holiday: { zh: "节日", en: "Holiday", icon: "🎉" },
  event: { zh: "活动", en: "Event", icon: "📅" },
  launch: { zh: "新品", en: "Launch", icon: "🚀" },
  lucky_draw: { zh: "抽奖", en: "Lucky draw", icon: "🎰" },
  lucky_draw_v2: { zh: "抽奖券", en: "Draw voucher", icon: "🎰" },
  voucher_sale: { zh: "代金券", en: "Voucher", icon: "🏷️" },
};

const statusBadge: Record<
  string,
  { variant: "green" | "orange" | "slate"; zh: string; en: string }
> = {
  draft: { variant: "slate", zh: "草稿", en: "Draft" },
  active: { variant: "green", zh: "进行中", en: "Active" },
  ended: { variant: "orange", zh: "已结束", en: "Ended" },
};

function statusRank(s: string): number {
  if (s === "active") return 0;
  if (s === "draft") return 1;
  if (s === "ended") return 2;
  return 3;
}

export function CampaignsClient({
  lang,
  items,
}: {
  lang: "zh" | "en";
  items: CampaignListItem[];
}) {
  const zh = lang === "zh";
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c = { all: items.length, active: 0, draft: 0, ended: 0 };
    for (const x of items) {
      if (x.status === "active") c.active++;
      else if (x.status === "draft") c.draft++;
      else if (x.status === "ended") c.ended++;
    }
    return c;
  }, [items]);

  const sorted = useMemo(() => {
    const list =
      filter === "all" ? items : items.filter((x) => x.status === filter);
    return [...list].sort((a, b) => {
      const ra = statusRank(a.status);
      const rb = statusRank(b.status);
      if (ra !== rb) return ra - rb;
      // 同状态：结束日近的 / 更新感强的排前（用 endDate 近优先）
      return new Date(b.endDate).getTime() - new Date(a.endDate).getTime();
    });
  }, [items, filter]);

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: zh ? "全部" : "All", count: counts.all },
    { key: "active", label: zh ? "进行中" : "Active", count: counts.active },
    { key: "draft", label: zh ? "草稿" : "Draft", count: counts.draft },
    { key: "ended", label: zh ? "已结束" : "Ended", count: counts.ended },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFilter(c.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === c.key
                ? "bg-[#1A6EFF] text-white"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {c.label}
            {c.count > 0 ? (
              <span
                className={`ml-1 tabular-nums ${
                  filter === c.key ? "text-white/80" : "text-muted-foreground/80"
                }`}
              >
                {c.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          {zh ? "该状态下暂无活动" : "Nothing in this filter"}
        </p>
      ) : (
        sorted.map((c) => {
          const ti = typeLabels[c.type] || typeLabels.promotion;
          const sb = statusBadge[c.status] || statusBadge.draft;
          const now = Date.now();
          const daysLeft = Math.ceil(
            (new Date(c.endDate).getTime() - now) / 86400000
          );
          const productCount = c.productNames.length;
          const dateLocale = zh ? "zh-CN" : "en-US";

          return (
            <Link key={c.id} href={`/business/campaigns/${c.id}`}>
              <Card
                className="hover:border-primary/30 transition-colors border-l-4 mb-3"
                style={{ borderLeftColor: c.color || "#1A6EFF" }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg">{ti.icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {c.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ti[lang]}
                          {" · "}
                          <span
                            className={
                              c.productKind === "self_use"
                                ? "text-muted-foreground font-medium"
                                : "text-amber-700 dark:text-amber-400 font-medium"
                            }
                          >
                            {c.type === "lucky_draw_v2" ||
                            c.type === "lucky_draw"
                              ? c.productKind === "self_use"
                                ? zh
                                  ? "独享券"
                                  : "Exclusive draw"
                                : zh
                                  ? "共赢券"
                                  : "Co-win draw"
                              : c.productKind === "self_use"
                                ? zh
                                  ? "自用券"
                                  : "Self-use"
                                : zh
                                  ? "分发券"
                                  : "Distribution"}
                          </span>
                        </p>
                      </div>
                    </div>
                    <Badge variant={sb.variant}>{sb[lang]}</Badge>
                  </div>

                  <p className="text-[11px] text-foreground/80 mb-2 line-clamp-2">
                    {productCount > 0 ? (
                      <>
                        <span className="text-muted-foreground">
                          {zh ? "含产品：" : "Products: "}
                        </span>
                        {c.productNames.join(" · ")}
                      </>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400">
                        {zh
                          ? "未挂券产品 — 点进勾选「券产品」"
                          : "No products linked — open to pick catalog products"}
                      </span>
                    )}
                  </p>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-muted/50 rounded-lg py-2">
                      <p className="text-lg font-bold text-foreground">
                        {productCount}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {zh ? "券产品" : "Products"}
                      </p>
                    </div>
                    <div className="bg-muted/50 rounded-lg py-2">
                      <p className="text-lg font-bold text-foreground">
                        {c.totalClaims}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {zh ? "领取" : "Claimed"}
                      </p>
                    </div>
                    <div className="bg-muted/50 rounded-lg py-2">
                      <p className="text-lg font-bold text-foreground">
                        {c.totalRedemptions}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {zh ? "核销" : "Redeemed"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                    <span>
                      {new Date(c.startDate).toLocaleDateString(dateLocale)} ~{" "}
                      {new Date(c.endDate).toLocaleDateString(dateLocale)}
                    </span>
                    {c.status === "active" && daysLeft > 0 && (
                      <span className="text-amber-500">
                        {zh ? `还剩 ${daysLeft} 天` : `${daysLeft}d left`}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })
      )}
    </div>
  );
}

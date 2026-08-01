"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ActivityEntitlementCard } from "@/components/activity/ActivityEntitlementCard";
import type { ActivityBundle } from "@/lib/activity-entitlements";

/**
 * 首页：我的活动权益 + 热门活动广告（同一「活动 → 权益」心智）
 */
export function HomeActivityEntitlements({
  lang,
  mine,
  discover,
}: {
  lang: "zh" | "en";
  mine: ActivityBundle[];
  discover: ActivityBundle[];
}) {
  const zh = lang === "zh";
  // 发现里去掉已在「我的」里的 campaign
  const mineIds = new Set(mine.map((m) => m.campaignId).filter(Boolean));
  const ads = discover.filter((d) => !d.campaignId || !mineIds.has(d.campaignId));

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between px-0.5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {zh ? "我的活动权益" : "My activity perks"}
            </h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {zh
                ? "按活动查看 · 展开见赠送券 / 抽奖 / 余额"
                : "By activity · expand gift · draw · balance"}
            </p>
          </div>
          <Link
            href="/wallet"
            className="text-xs font-medium text-primary inline-flex items-center gap-0.5"
          >
            {zh ? "券包" : "Wallet"}
            <ChevronRight size={14} className="opacity-70" />
          </Link>
        </div>

        {mine.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              {zh ? "还没有活动权益" : "No perks yet"}
            </p>
            <p className="text-[11px] text-muted-foreground/80 mt-1 leading-relaxed">
              {zh
                ? "扫店内国庆码或购券后，权益会出现在这里"
                : "Scan in-store NDP code or buy a voucher"}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {mine.map((b) => (
              <ActivityEntitlementCard
                key={b.key}
                bundle={b}
                lang={lang}
                mode="customer"
                defaultOpen={b.tone === "ndp" || b.entitlements.length <= 3}
              />
            ))}
          </div>
        )}
      </section>

      {ads.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-0.5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {zh ? "热门活动" : "Popular activities"}
              </h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {zh
                  ? "广告位 · 与券包同一套「活动」结构"
                  : "Promo cards · same activity model as wallet"}
              </p>
            </div>
            <Link
              href="/discover/draws"
              className="text-xs font-medium text-primary inline-flex items-center gap-0.5"
            >
              {zh ? "全部" : "All"}
              <ChevronRight size={14} className="opacity-70" />
            </Link>
          </div>
          <div className="space-y-2.5">
            {ads.slice(0, 8).map((b) => (
              <ActivityEntitlementCard
                key={b.key}
                bundle={b}
                lang={lang}
                mode={b.entitlements.length > 0 ? "customer" : "ad"}
                defaultOpen={
                  b.tone === "ndp" ||
                  b.entitlements.length > 0 && b.entitlements.length <= 4
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { Printer, Image as ImageIcon, Ticket } from "lucide-react";
import type { ActivityTone } from "@/lib/activity-entitlements";
import { cn } from "@/lib/utils";

export type PrintableActivity = {
  id: string;
  name: string;
  slug: string | null;
  status: string | null;
  tone: ActivityTone;
  productCount: number;
  couponCount: number;
};

/**
 * 活动券 · 打印设计中枢
 * 活动广告（台卡/海报）≠ 实体券 PT-（一码一份）
 */
export function OffersPrintSection({
  lang,
  activities,
}: {
  lang: "zh" | "en";
  activities: PrintableActivity[];
}) {
  const zh = lang === "zh";
  const active = activities.filter(
    (a) => a.status === "active" || a.status === "draft"
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Printer className="w-4 h-4 text-foreground/70" />
        <h2 className="text-sm font-semibold text-foreground">
          {zh ? "打印设计" : "Print design"}
        </h2>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed -mt-1">
        {zh
          ? "两种物料：活动广告（多人扫同一码）· 实体券（一码一份权益）。按活动设计与导出。"
          : "Two materials: activity ads (shared QR) · physical tickets (one code = one perk). Design per activity."}
      </p>

      <div className="grid grid-cols-1 gap-2">
        {/* 类型说明卡 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="flex items-center gap-1.5 text-violet-600 dark:text-violet-400">
              <ImageIcon className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold">
                {zh ? "活动广告" : "Activity ad"}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
              {zh
                ? "台卡 · 海报 · 社交图 · 分发版带 seller"
                : "Tent · poster · social · distributor seller="}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <Ticket className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold">
                {zh ? "实体券" : "Physical"}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
              {zh
                ? "PT- 码 · 印刷批次 · 一码一份权益"
                : "PT- codes · print batches · one-shot entitlement"}
            </p>
          </div>
        </div>

        {active.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4 rounded-xl border border-dashed border-border">
            {zh
              ? "暂无进行中活动，开启活动后再设计打印物料"
              : "No active activities yet"}
          </p>
        ) : (
          <ul className="space-y-2">
            {active.map((a) => (
              <li
                key={a.id}
                className={cn(
                  "rounded-2xl border border-border bg-card p-3 border-l-4",
                  a.tone === "ndp"
                    ? "border-l-rose-500"
                    : a.tone === "draw"
                      ? "border-l-violet-500"
                      : a.tone === "voucher"
                        ? "border-l-sky-500"
                        : "border-l-border"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {a.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {zh
                        ? `${a.couponCount} 赠券 · ${a.productCount} 可售`
                        : `${a.couponCount} gifts · ${a.productCount} sellable`}
                      {a.status ? ` · ${a.status}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {a.slug ? (
                    <Link
                      href={`/business/campaigns/${a.id}/print?from=offers`}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-full bg-violet-600 text-white"
                    >
                      <ImageIcon className="w-3 h-3" />
                      {zh ? "活动广告" : "Ad / poster"}
                    </Link>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-full bg-muted text-muted-foreground"
                      title={
                        zh
                          ? "活动尚无公开链接，无法生成广告码"
                          : "No public slug yet"
                      }
                    >
                      <ImageIcon className="w-3 h-3" />
                      {zh ? "广告（缺 slug）" : "Ad (no slug)"}
                    </span>
                  )}
                  <Link
                    href={`/business/physical?campaignId=${a.id}&from=offers`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-full bg-amber-600 text-white"
                  >
                    <Ticket className="w-3 h-3" />
                    {zh ? "实体券" : "Physical"}
                  </Link>
                  <Link
                    href={`/business/campaigns/${a.id}`}
                    className="inline-flex items-center text-[11px] font-medium px-2.5 py-1.5 rounded-full border border-border text-foreground"
                  >
                    {zh ? "活动设置" : "Settings"}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2 pt-0.5">
          <Link
            href="/business/physical?from=offers"
            className="text-[11px] font-medium text-primary"
          >
            {zh ? "全部实体印刷批次 →" : "All physical batches →"}
          </Link>
        </div>
      </div>
    </div>
  );
}

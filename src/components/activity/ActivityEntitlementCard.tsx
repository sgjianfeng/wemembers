"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import {
  type ActivityBundle,
  type EntitlementItem,
  entitlementBarClass,
  kindLabel,
  toneBarClass,
} from "@/lib/activity-entitlements";
import { cn } from "@/lib/utils";

type Mode = "customer" | "business" | "ad";

export function ActivityEntitlementCard({
  bundle,
  lang = "zh",
  mode = "customer",
  defaultOpen,
}: {
  bundle: ActivityBundle;
  lang?: "zh" | "en";
  mode?: Mode;
  defaultOpen?: boolean;
}) {
  const zh = lang !== "en";
  const multi = bundle.entitlements.length > 1 || mode === "business";
  const [open, setOpen] = useState(
    defaultOpen ?? (multi || bundle.entitlements.length > 0)
  );

  const isAd = mode === "ad" || (bundle.entitlements.length === 0 && bundle.href);

  if (isAd && mode !== "business") {
    return <ActivityAdCard bundle={bundle} lang={lang} />;
  }

  return (
    <Card
      className={cn(
        "overflow-hidden border-l-4 shadow-sm",
        toneBarClass(bundle.tone)
      )}
    >
      <button
        type="button"
        className="w-full text-left p-3 flex items-start justify-between gap-2"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          {bundle.businessName && (
            <p className="text-[11px] text-muted-foreground truncate">
              {bundle.businessName}
            </p>
          )}
          <p className="text-base font-semibold text-foreground mt-0.5 truncate">
            {bundle.title}
          </p>
          {bundle.blurb && (
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              {zh ? bundle.blurb : bundle.blurbEn || bundle.blurb}
            </p>
          )}
          <p className="text-[11px] font-medium text-foreground/80 mt-1.5">
            {zh ? bundle.summary : bundle.summaryEn || bundle.summary}
            {bundle.status && mode === "business" && (
              <span className="ml-2 text-muted-foreground">· {bundle.status}</span>
            )}
          </p>
        </div>
        {open ? (
          <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
        ) : (
          <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-dashed border-border pt-2">
          {bundle.stats && bundle.stats.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-1">
              {bundle.stats.map((s) => (
                <span
                  key={s.label}
                  className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
                >
                  {s.label} <strong className="text-foreground">{s.value}</strong>
                </span>
              ))}
            </div>
          )}

          {bundle.entitlements.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">
              {zh ? "暂无持有权益 · 可先参与活动" : "No entitlements yet"}
            </p>
          )}

          {bundle.entitlements.map((e) => (
            <EntitlementRow key={e.id} item={e} lang={lang} />
          ))}

          {bundle.ops && bundle.ops.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {bundle.ops.map((op) => (
                <Link
                  key={op.href + op.label}
                  href={op.href}
                  className={cn(
                    "text-xs font-semibold px-3 py-1.5 rounded-full border",
                    op.primary
                      ? "bg-[#1A6EFF] text-white border-transparent"
                      : "bg-card text-foreground border-border"
                  )}
                >
                  {zh ? op.label : op.labelEn || op.label}
                </Link>
              ))}
            </div>
          )}

          {bundle.href && mode === "customer" && (
            <Link
              href={bundle.href}
              className="block text-center text-xs font-semibold text-primary pt-1"
            >
              {zh ? "活动详情 →" : "Activity details →"}
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}

function EntitlementRow({
  item,
  lang,
}: {
  item: EntitlementItem;
  lang: "zh" | "en";
}) {
  const zh = lang !== "en";
  const inner = (
    <div
      className={cn(
        "rounded-xl border border-border bg-card border-l-4 p-3",
        entitlementBarClass(item.tone)
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {kindLabel(item.kind, zh ? "zh" : "en")}
          </p>
          <p className="text-sm font-semibold text-foreground mt-0.5">
            {item.title}
          </p>
          {item.secondaryLabel && (
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              {item.secondaryLabel}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-bold tabular-nums text-foreground">
            {item.primaryLabel}
          </p>
          {item.status && item.status !== "available" && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {item.status}
            </p>
          )}
        </div>
      </div>
      {item.ops && item.ops.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {item.ops.map((op) => (
            <Link
              key={op.href}
              href={op.href}
              className="text-[11px] font-medium text-primary"
            >
              {zh ? op.label : op.labelEn || op.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  if (item.href && (!item.ops || item.ops.length === 0)) {
    return (
      <Link href={item.href} className="block active:scale-[0.99] transition-transform">
        {inner}
      </Link>
    );
  }
  return inner;
}

/** 首页广告 / 发现位：同一视觉壳，主 CTA 参与 */
export function ActivityAdCard({
  bundle,
  lang = "zh",
}: {
  bundle: ActivityBundle;
  lang?: "zh" | "en";
}) {
  const zh = lang !== "en";
  const href = bundle.href || "#";

  return (
    <Link href={href} className="block active:scale-[0.99] transition-transform">
      <Card
        className={cn(
          "overflow-hidden border-l-4 shadow-sm",
          toneBarClass(bundle.tone),
          bundle.tone === "ndp" && "bg-gradient-to-br from-rose-50/80 to-card"
        )}
      >
        <CardContent className="p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {bundle.businessName && (
                <p className="text-[11px] text-muted-foreground truncate">
                  {bundle.businessName}
                </p>
              )}
              <p className="text-base font-bold text-foreground mt-0.5 leading-snug">
                {bundle.title}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                {zh ? bundle.blurb : bundle.blurbEn || bundle.blurb}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full",
                bundle.tone === "ndp"
                  ? "bg-rose-600 text-white"
                  : bundle.tone === "draw"
                    ? "bg-violet-600 text-white"
                    : "bg-primary text-primary-foreground"
              )}
            >
              {bundle.tone === "ndp"
                ? zh
                  ? "国庆"
                  : "NDP"
                : bundle.joined
                  ? zh
                    ? "已参与"
                    : "Joined"
                  : zh
                    ? "参与"
                    : "Join"}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {zh ? bundle.summary : bundle.summaryEn || bundle.summary}
            </span>
            <span className="text-xs font-semibold text-primary inline-flex items-center gap-0.5">
              {zh ? "查看活动" : "View"}
              <ChevronRight size={14} />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

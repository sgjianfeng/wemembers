import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  offerBlurb,
  offerCta,
  type JoinableActivity,
} from "@/lib/discover-activities";
import { categoryLabel } from "@/lib/default-activities";
import { withActivityBuyContext } from "@/lib/activity-buy-context";
import {
  ChevronRight,
  Gift,
  MapPin,
  PartyPopper,
  Ticket,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  lang: "zh" | "en";
  activities: JoinableActivity[];
  /** 门店货架路径 /shop/brand/store */
  storePath: string;
  storeName: string;
  brandName: string;
  /** 品牌页不绑具体店时 true */
  brandScope?: boolean;
};

const CATEGORY_ORDER = ["ndp", "grand_countdown", "long_term", "other"] as const;

function sortByCategory(list: JoinableActivity[]): JoinableActivity[] {
  const rank = (c: JoinableActivity["category"]) => {
    const i = CATEGORY_ORDER.indexOf(c as (typeof CATEGORY_ORDER)[number]);
    return i < 0 ? 99 : i;
  };
  return [...list].sort((a, b) => {
    const d = rank(a.category) - rank(b.category);
    if (d !== 0) return d;
    return b.heat - a.heat;
  });
}

function categoryTone(cat: JoinableActivity["category"]) {
  if (cat === "ndp") return "ndp" as const;
  if (cat === "grand_countdown") return "draw" as const;
  return "calm" as const;
}

/**
 * 门店/品牌货架：活动 → 其下权益/可购券（统一进 /voucher 带语境）
 */
export function ShopActivityShelf({
  lang,
  activities,
  storePath,
  storeName,
  brandName,
  brandScope = false,
}: Props) {
  const zh = lang === "zh";
  const ordered = sortByCategory(activities);

  if (ordered.length === 0) return null;

  return (
    <div className="space-y-4">
      {ordered.map((a) => {
        const tone = categoryTone(a.category);
        const isNdp = a.category === "ndp" || a.type === "holiday";
        const isDraw = a.displayMode === "draw" && !isNdp;
        const catLabel =
          a.category !== "other"
            ? categoryLabel(a.category, lang)
            : null;
        const products = (a.products || []).filter((p) => p.status === "active");

        const buyCtx = {
          from: (brandScope ? "shop" : "store") as "shop" | "store",
          activityId: a.id,
          activitySlug: a.slug,
          activityName: a.name,
          storePath,
          storeName,
          brandName,
        };

        return (
          <article
            key={a.id}
            id={`activity-${a.id}`}
            className={cn(
              "rounded-2xl border overflow-hidden bg-card shadow-sm scroll-mt-16",
              tone === "ndp" && "border-rose-200 dark:border-rose-800/50",
              tone === "draw" && "border-amber-200 dark:border-amber-800/50",
              tone === "calm" && "border-border"
            )}
          >
            {/* 活动头 */}
            <div
              className={cn(
                "px-3.5 py-3",
                tone === "ndp" && "bg-rose-600 text-white",
                tone === "draw" &&
                  "bg-amber-600 bg-gradient-to-br from-amber-600 to-orange-700 text-white",
                tone === "calm" && "bg-muted/40"
              )}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                    tone === "calm"
                      ? "bg-primary/10 text-primary"
                      : "bg-white/20 text-white"
                  )}
                >
                  {isNdp ? (
                    <PartyPopper size={18} />
                  ) : isDraw ? (
                    <Trophy size={18} />
                  ) : (
                    <Ticket size={18} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {catLabel && (
                      <Badge
                        variant={
                          isDraw ? "orange" : isNdp ? "red" : "slate"
                        }
                        size="sm"
                        className={
                          tone !== "calm"
                            ? "!bg-white/20 !text-white !border-white/25"
                            : undefined
                        }
                      >
                        {catLabel}
                      </Badge>
                    )}
                  </div>
                  <h3
                    className={cn(
                      "mt-1 text-[15px] font-bold leading-snug truncate",
                      tone === "calm" ? "text-foreground" : "text-white"
                    )}
                  >
                    {a.name}
                  </h3>
                  <p
                    className={cn(
                      "text-[11px] mt-0.5 line-clamp-2",
                      tone === "calm" ? "text-muted-foreground" : "text-white/90"
                    )}
                  >
                    {offerBlurb(a, lang)}
                  </p>
                  {!brandScope && (
                    <p
                      className={cn(
                        "flex items-center gap-1 text-[11px] mt-1.5",
                        tone === "calm"
                          ? "text-muted-foreground"
                          : "text-white/80"
                      )}
                    >
                      <MapPin size={12} className="shrink-0" />
                      <span className="truncate">{storeName}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 活动下权益 / 可购券 */}
            <div className="px-3 pb-3 pt-2 border-t border-border/60">
              <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 px-0.5">
                {zh ? "可购权益" : "Available offers"}
              </p>

              {products.length > 0 ? (
                <ul className="space-y-1.5">
                  {products.map((p) => {
                    const href = withActivityBuyContext(
                      p.buyPath || (p.slug ? `/voucher/${p.slug}` : null),
                      buyCtx
                    );
                    const isProdDraw =
                      p.type === "lucky_draw_v2" || p.type === "lucky_draw";
                    const row = (
                      <span className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-2.5 py-2.5 w-full">
                        <span
                          className={cn(
                            "grid h-8 w-8 place-items-center rounded-lg shrink-0",
                            isProdDraw
                              ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                              : isNdp
                                ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
                                : "bg-primary/10 text-primary"
                          )}
                        >
                          {isProdDraw ? (
                            <Trophy size={14} />
                          ) : isNdp ? (
                            <Gift size={14} />
                          ) : (
                            <Ticket size={14} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block text-[13px] font-semibold text-foreground truncate">
                            {p.name}
                          </span>
                          <span className="block text-[10px] text-muted-foreground truncate">
                            {isProdDraw
                              ? zh
                                ? "抽奖 · 购券进池"
                                : "Draw · buy to join"
                              : zh
                                ? "代金 · 到店花"
                                : "Credit · spend in store"}
                          </span>
                        </span>
                        <span className="text-[11px] font-semibold text-primary shrink-0 inline-flex items-center gap-0.5">
                          {offerCta(a, lang)}
                          <ChevronRight size={14} />
                        </span>
                      </span>
                    );
                    return (
                      <li key={p.id}>
                        {href ? (
                          <Link
                            href={href}
                            className="block active:scale-[0.99] transition-transform"
                          >
                            {row}
                          </Link>
                        ) : (
                          row
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : isNdp ? (
                <Link
                  href={
                    a.href.startsWith("/ndp")
                      ? a.href
                      : `/ndp/${a.slug || a.id}?from=table`
                  }
                  className="flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2.5 dark:border-rose-900/40 dark:bg-rose-950/30"
                >
                  <span className="text-[12px] text-rose-950 dark:text-rose-100 min-w-0">
                    {zh
                      ? "满赠权益 · 扫码/前台参加"
                      : "Spend-get perks · join activity"}
                  </span>
                  <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 inline-flex items-center gap-0.5 shrink-0">
                    {zh ? "打开活动" : "Open"}
                    <ChevronRight size={14} />
                  </span>
                </Link>
              ) : (
                <Link
                  href={
                    withActivityBuyContext(a.href, buyCtx) ||
                    a.href ||
                    storePath
                  }
                  className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5"
                >
                  <span className="text-[12px] text-foreground/70">
                    {zh ? "进入活动查看可买的券" : "Open activity for offers"}
                  </span>
                  <span className="text-[11px] font-semibold text-primary inline-flex items-center gap-0.5">
                    {offerCta(a, lang)}
                    <ChevronRight size={14} />
                  </span>
                </Link>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

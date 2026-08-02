import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import {
  offerBlurb,
  type JoinableActivity,
} from "@/lib/discover-activities";
import { categoryLabel } from "@/lib/default-activities";
import { withActivityBuyContext } from "@/lib/activity-buy-context";
import {
  ChevronRight,
  Gift,
  PartyPopper,
  Ticket,
  Trophy,
  Receipt,
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
  /** 结账参加大奖用 */
  storeId?: string | null;
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

function productSubline(
  p: { type: string; name: string },
  isDraw: boolean,
  zh: boolean
): string {
  if (isDraw || p.type === "lucky_draw_v2" || p.type === "lucky_draw") {
    return zh ? "购券进奖池 · 可冲大奖" : "Buy · enter prize pool";
  }
  if (/9折|折扣|discount|10%|90/i.test(p.name)) {
    return zh ? "付 90% 得面值 · 到店花" : "Pay 90% · spend in store";
  }
  if (/门槛|threshold/i.test(p.name)) {
    return zh ? "原价 · 有最低消费 · 到店花" : "Face · min spend · in store";
  }
  return zh ? "原价代金 · 到店核销" : "Face credit · redeem in store";
}

/**
 * 门店/品牌货架：活动 → 其下权益（满赠）或可购产品（代金/大奖）
 */
export function ShopActivityShelf({
  lang,
  activities,
  storePath,
  storeName,
  brandName,
  brandScope = false,
  storeId = null,
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
          a.category !== "other" ? categoryLabel(a.category, lang) : null;
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

        const ndpOpenHref = (() => {
          const base =
            a.slug != null
              ? `/ndp/${encodeURIComponent(a.slug)}`
              : a.href.startsWith("/ndp")
                ? a.href.split("?")[0]
                : `/ndp/${encodeURIComponent(a.id)}`;
          const q = new URLSearchParams();
          q.set("from", "table");
          if (storePath?.startsWith("/shop/")) q.set("store", storePath);
          if (storeName) q.set("storeName", storeName);
          if (brandName) q.set("brand", brandName);
          return `${base}?${q.toString()}`;
        })();

        const joinHref =
          storeId && !brandScope
            ? `/join?storeId=${encodeURIComponent(storeId)}`
            : null;

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
                      tone === "calm"
                        ? "text-muted-foreground"
                        : "text-white/90"
                    )}
                  >
                    {offerBlurb(a, lang)}
                  </p>
                  {/* 仅品牌页显示店名（门店页已在本店，不重复） */}
                  {brandScope && a.stores?.length === 1 && (
                    <p
                      className={cn(
                        "text-[11px] mt-1.5 truncate",
                        tone === "calm"
                          ? "text-muted-foreground"
                          : "text-white/80"
                      )}
                    >
                      {a.stores[0].name}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 下半：满赠权益 vs 可购产品 */}
            <div className="px-3 pb-3 pt-2 border-t border-border/60 space-y-1.5">
              {isNdp ? (
                <>
                  <p className="text-[10px] font-semibold text-muted-foreground px-0.5">
                    {zh ? "活动权益 · 如何参加" : "How to join"}
                  </p>
                  <Link
                    href={ndpOpenHref}
                    className="flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2.5 dark:border-rose-900/40 dark:bg-rose-950/30 active:scale-[0.99] transition-transform"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="grid h-8 w-8 place-items-center rounded-lg shrink-0 bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300">
                        <Gift size={14} />
                      </span>
                      <span className="min-w-0 text-left">
                        <span className="block text-[13px] font-semibold text-rose-950 dark:text-rose-50 truncate">
                          {zh ? "满赠权益 S$61" : "Gift perk S$61"}
                        </span>
                        <span className="block text-[10px] text-rose-800/80 dark:text-rose-200/80 truncate">
                          {zh
                            ? "满消费门槛 · 前台/桌码领取 · 非货架购券"
                            : "Min spend · claim at counter · not a shelf buy"}
                        </span>
                      </span>
                    </span>
                    <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 inline-flex items-center gap-0.5 shrink-0">
                      {zh ? "打开活动" : "Open"}
                      <ChevronRight size={14} />
                    </span>
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-[10px] font-semibold text-muted-foreground px-0.5">
                    {zh ? "可购产品" : "Products for sale"}
                  </p>
                  {products.length > 0 ? (
                    <ul className="space-y-1.5">
                      {products.map((p) => {
                        const href = withActivityBuyContext(
                          p.buyPath || (p.slug ? `/voucher/${p.slug}` : null),
                          buyCtx
                        );
                        const isProdDraw =
                          p.type === "lucky_draw_v2" ||
                          p.type === "lucky_draw" ||
                          isDraw;
                        const row = (
                          <span className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-2.5 py-2.5 w-full">
                            <span
                              className={cn(
                                "grid h-8 w-8 place-items-center rounded-lg shrink-0",
                                isProdDraw
                                  ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                                  : "bg-primary/10 text-primary"
                              )}
                            >
                              {isProdDraw ? (
                                <Trophy size={14} />
                              ) : (
                                <Ticket size={14} />
                              )}
                            </span>
                            <span className="min-w-0 flex-1 text-left">
                              <span className="block text-[13px] font-semibold text-foreground truncate">
                                {p.name}
                              </span>
                              <span className="block text-[10px] text-muted-foreground truncate">
                                {productSubline(p, isProdDraw, zh)}
                              </span>
                            </span>
                            <span className="text-[11px] font-semibold text-primary shrink-0 inline-flex items-center gap-0.5">
                              {zh ? "去购券" : "Buy"}
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
                  ) : (
                    <p className="text-[11px] text-muted-foreground px-0.5 py-2">
                      {zh
                        ? "暂无可购产品（商家尚未挂载）"
                        : "No products linked yet"}
                    </p>
                  )}

                  {/* 大奖：结账参加放进活动卡内次要入口 */}
                  {isDraw && joinHref && (
                    <Link
                      href={joinHref}
                      className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-amber-300/80 bg-amber-50/50 px-3 py-2 dark:border-amber-800/50 dark:bg-amber-950/20 active:scale-[0.99] transition-transform"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Receipt
                          size={14}
                          className="text-amber-700 dark:text-amber-400 shrink-0"
                        />
                        <span className="text-[11px] text-amber-950 dark:text-amber-100">
                          {zh
                            ? "结账时按账单参加大奖"
                            : "Join draw with this bill"}
                        </span>
                      </span>
                      <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 inline-flex items-center gap-0.5 shrink-0">
                        {zh ? "填写账单" : "Enter bill"}
                        <ChevronRight size={14} />
                      </span>
                    </Link>
                  )}
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

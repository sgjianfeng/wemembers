"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  Trophy,
  Ticket,
  MapPin,
  Flame,
  ChevronRight,
  Gift,
  PartyPopper,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  customerOfferTitle,
  offerBlurb,
  offerCta,
  offerKindLabel,
  type JoinableActivity,
} from "@/lib/discover-activities";

type Props = {
  isZh: boolean;
  isLoggedIn?: boolean;
};

/**
 * 首页热门活动流：搜索 + 活动卡（活动信息 + 活动内热门券/产品）
 */
export function LandingActivityFeed({ isZh, isLoggedIn = false }: Props) {
  const lang = isZh ? "zh" : "en";
  const [activities, setActivities] = useState<JoinableActivity[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/campaign/active-activities");
        const j = await res.json().catch(() => ({}));
        if (!cancelled) {
          setActivities((j.data || []) as JoinableActivity[]);
        }
      } catch {
        if (!cancelled) setActivities([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return activities;
    return activities.filter((a) => {
      const hay = [
        a.name,
        a.businessName,
        a.description || "",
        ...a.products.map((p) => p.name),
        ...a.stores.map((s) => s.name),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [activities, q]);

  return (
    <section className="px-4 pb-6">
      <div className="max-w-sm mx-auto space-y-3">
        {/* 搜索 */}
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              isZh
                ? "搜索活动、门店、券…"
                : "Search activities, stores, vouchers…"
            }
            className={cn(
              "w-full h-11 pl-9 pr-3 rounded-2xl border border-border bg-card",
              "text-sm text-foreground placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
            enterKeyHint="search"
          />
        </div>

        <div className="flex items-end justify-between px-0.5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Flame size={12} />
              {isZh ? "热门活动" : "Hot activities"}
            </p>
            <h2 className="text-base font-extrabold text-foreground mt-0.5">
              {isZh ? "按活动看 · 展开选券" : "By activity · pick a voucher"}
            </h2>
          </div>
          <Link
            href={
              isLoggedIn
                ? "/discover/draws"
                : "/auth/login?tab=customer&redirect=/discover/draws"
            }
            className="text-[11px] font-semibold text-primary shrink-0"
          >
            {isZh ? "全部 →" : "All →"}
          </Link>
        </div>

        {!loaded ? (
          <p className="text-xs text-muted-foreground py-8 text-center">…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {q.trim()
                ? isZh
                  ? "没有匹配的活动"
                  : "No matching activities"
                : isZh
                  ? "暂无热门活动"
                  : "No hot activities yet"}
            </p>
            {q.trim() && (
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-primary"
                onClick={() => setQ("")}
              >
                {isZh ? "清除搜索" : "Clear search"}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((a) => (
              <ActivityCard key={a.id} a={a} lang={lang} isZh={isZh} />
            ))}
          </div>
        )}

        <div className="pt-2 text-center">
          {isLoggedIn ? (
            <Link
              href="/home"
              className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full font-bold text-sm shadow-md active:scale-[0.98] transition-transform"
            >
              {isZh ? "进入我的首页" : "Go to my home"}
            </Link>
          ) : (
            <Link
              href="/auth/register?role=customer"
              className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full font-bold text-sm shadow-md active:scale-[0.98] transition-transform"
            >
              {isZh ? "免费注册 · 参加活动" : "Sign up · join activities"}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function ActivityCard({
  a,
  lang,
  isZh,
}: {
  a: JoinableActivity;
  lang: "zh" | "en";
  isZh: boolean;
}) {
  const isNdp =
    a.type === "holiday" || /国庆|ndp|national/i.test(a.name || "");
  const isDraw = a.displayMode === "draw" && !isNdp;
  const title = customerOfferTitle(a.name, {
    kindTag: a.kindTag,
    packKind: a.packKind,
    lang,
  });
  const products = a.products.filter((p) => p.status === "active").slice(0, 4);
  const storeNames = a.stores
    .slice(0, 2)
    .map((s) => s.name)
    .join(" · ");

  return (
    <article
      className={cn(
        "rounded-2xl border bg-card shadow-sm overflow-hidden",
        isNdp
          ? "border-rose-200 dark:border-rose-800/50"
          : isDraw
            ? "border-amber-200/80 dark:border-amber-800/50"
            : "border-border"
      )}
    >
      {/* 活动头 */}
      <Link
        href={a.href}
        className={cn(
          "block p-3.5 active:opacity-95 transition-opacity",
          isNdp && "bg-gradient-to-br from-rose-600 to-red-700 text-white",
          isDraw && !isNdp && "bg-gradient-to-br from-amber-600 to-orange-700 text-white"
        )}
      >
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
              isNdp || isDraw
                ? "bg-white/15 text-white"
                : "bg-primary/10 text-primary"
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
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[9px] font-bold",
                  isNdp || isDraw
                    ? "bg-white/20 text-white"
                    : "bg-primary/10 text-primary"
                )}
              >
                {isNdp
                  ? isZh
                    ? "国庆满赠"
                    : "National Day"
                  : offerKindLabel(a.kindTag, lang)}
              </span>
              {a.hot && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 text-[9px] font-bold",
                    isNdp || isDraw
                      ? "text-amber-200"
                      : "text-amber-600 dark:text-amber-400"
                  )}
                >
                  <Flame size={10} />
                  {isZh ? "热" : "HOT"}
                </span>
              )}
            </div>
            <h3
              className={cn(
                "mt-1 text-[15px] font-bold leading-snug truncate",
                isNdp || isDraw ? "text-white" : "text-foreground"
              )}
            >
              {title}
            </h3>
            <p
              className={cn(
                "text-[11px] truncate mt-0.5",
                isNdp || isDraw ? "text-white/85" : "text-muted-foreground"
              )}
            >
              {a.businessName}
              {isDraw && a.grandPoolSgd !== "0"
                ? ` · ${isZh ? "奖池" : "Pool"} S$${a.grandPoolSgd}`
                : ""}
            </p>
          </div>
          <ChevronRight
            size={18}
            className={cn(
              "shrink-0 mt-1",
              isNdp || isDraw ? "text-white/70" : "text-muted-foreground"
            )}
          />
        </div>
        <p
          className={cn(
            "mt-2 text-[12px] leading-snug",
            isNdp || isDraw ? "text-white/90" : "text-foreground/80"
          )}
        >
          {offerBlurb(a, lang)}
        </p>
        {(storeNames || a.storeCount > 0) && (
          <p
            className={cn(
              "mt-1.5 flex items-center gap-1 text-[11px]",
              isNdp || isDraw ? "text-white/75" : "text-muted-foreground"
            )}
          >
            <MapPin size={12} className="shrink-0" />
            <span className="truncate">
              {storeNames ||
                (isZh ? `${a.storeCount} 家门店` : `${a.storeCount} stores`)}
            </span>
          </p>
        )}
      </Link>

      {/* 活动内热门券 / 产品 */}
      <div className="px-3 pb-3 pt-2 border-t border-border/60 bg-card">
        <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 px-0.5">
          {isZh ? "活动中的券" : "Vouchers in this activity"}
        </p>
        {products.length > 0 ? (
          <ul className="space-y-1.5">
            {products.map((p) => {
              const href =
                p.buyPath ||
                (p.slug ? `/voucher/${p.slug}` : a.href);
              const isProdDraw =
                p.type === "lucky_draw_v2" || p.type === "lucky_draw";
              return (
                <li key={p.id}>
                  <Link
                    href={href}
                    className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-2.5 py-2 active:scale-[0.99] transition-transform"
                  >
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
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-foreground truncate">
                        {p.name}
                      </span>
                      <span className="block text-[10px] text-muted-foreground truncate">
                        {isProdDraw
                          ? isZh
                            ? "抽奖 · 可购"
                            : "Draw · buy"
                          : isZh
                            ? "代金 · 可购"
                            : "Credit · buy"}
                      </span>
                    </span>
                    <span className="text-[11px] font-semibold text-primary shrink-0">
                      {isZh ? "去看看" : "View"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Link
            href={a.href}
            className="flex items-center justify-between rounded-xl border border-dashed border-border px-3 py-2.5"
          >
            <span className="text-[12px] text-muted-foreground">
              {isNdp
                ? isZh
                  ? "满赠权益 · 扫码参加活动"
                  : "Spend-get perks · join activity"
                : isZh
                  ? "进入活动查看可买的券"
                  : "Open activity for vouchers"}
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
}

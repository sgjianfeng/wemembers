"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Trophy,
  Ticket,
  Clock,
  ChevronRight,
  MapPin,
  Flame,
  Store,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useLang } from "@/components/i18n/LanguageProvider";
import type { JoinableActivity } from "@/lib/discover-activities";

const HERO_LIMIT = 2;

function kindLabel(
  tag: JoinableActivity["kindTag"],
  lang: "zh" | "en"
): string {
  const map: Record<JoinableActivity["kindTag"], { zh: string; en: string }> = {
    exclusive_draw: { zh: "独享抽奖", en: "Exclusive draw" },
    co_win_draw: { zh: "共赢抽奖", en: "Co-win draw" },
    self_use: { zh: "自用券", en: "Self-use" },
    distribution: { zh: "分发券", en: "Network" },
    draw: { zh: "抽奖", en: "Draw" },
  };
  return map[tag][lang];
}

function storeLine(a: JoinableActivity, lang: "zh" | "en"): string {
  if (a.storeCount === 0) {
    return lang === "en" ? "Stores TBA" : "门店待定";
  }
  if (a.storesAll && a.storeCount > 0) {
    const names = a.stores
      .slice(0, 2)
      .map((s) => s.name)
      .join(" · ");
    if (a.storeCount <= 2) {
      return names || (lang === "en" ? "All stores" : "全部门店");
    }
    return names
      ? `${names} ${lang === "en" ? `+${a.storeCount - 2}` : `等${a.storeCount}家`}`
      : lang === "en"
        ? `${a.storeCount} stores`
        : `${a.storeCount} 家门店`;
  }
  const names = a.stores
    .slice(0, 2)
    .map((s) => s.name)
    .join(" · ");
  if (a.storeCount <= 2) return names;
  return `${names} ${lang === "en" ? `+${a.storeCount - 2}` : `等${a.storeCount}家`}`;
}

function productLine(a: JoinableActivity, lang: "zh" | "en"): string | null {
  if (a.products.length === 0) return null;
  const names = a.products.slice(0, 2).map((p) => p.name);
  if (a.products.length <= 2) {
    return (lang === "en" ? "Includes: " : "含：") + names.join(" · ");
  }
  return (
    (lang === "en" ? "Includes: " : "含：") +
    names.join(" · ") +
    (lang === "en"
      ? ` +${a.products.length - 2}`
      : ` 等${a.products.length}个`)
  );
}

export function HomeActivitiesSection({
  myActivities,
  hotActivities,
}: {
  myActivities: JoinableActivity[];
  hotActivities: JoinableActivity[];
}) {
  const { t, lang } = useLang();
  const L = lang === "en" ? "en" : "zh";
  const [now, setNow] = useState(Date.now());

  const primary = myActivities;
  const discover = hotActivities.filter(
    (d) => !myActivities.some((m) => m.id === d.id)
  );

  useEffect(() => {
    if (primary.length === 0 && discover.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [primary.length, discover.length]);

  const discoverOnly = primary.length === 0 && discover.length > 0;
  const feed = primary.length > 0 ? primary : discover;
  const heroes = feed.slice(0, HERO_LIMIT);
  const overflow = feed.slice(HERO_LIMIT);
  const extraDiscover = primary.length > 0 ? discover.slice(0, 4) : overflow;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-sm font-semibold text-foreground">
          {discoverOnly
            ? L === "en"
              ? "Hot activities"
              : "热门活动"
            : L === "en"
              ? "Activities"
              : "可参与活动"}
        </h2>
        <Link
          href="/discover/draws"
          className="text-xs font-medium text-primary inline-flex items-center gap-0.5"
        >
          {t("home.vouchers.viewAll")}
          <ChevronRight size={14} className="opacity-70" />
        </Link>
      </div>

      {primary.length === 0 && discover.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card">
          <EmptyState
            icon="trophy"
            tone="festive"
            title={L === "en" ? "No activities yet" : "暂无可参与活动"}
            description={
              L === "en"
                ? "Browse when merchants open activities with products and stores."
                : "商家上架活动并开放门店后，会出现在这里。"
            }
            action={
              <Link
                href="/discover/draws"
                className="inline-flex items-center gap-1 rounded-full bg-festive px-5 py-2 text-xs font-semibold text-white shadow-sm active:scale-[0.97] transition-transform"
              >
                {L === "en" ? "Browse activities" : "浏览活动"}
                <ChevronRight size={14} />
              </Link>
            }
          />
        </div>
      ) : (
        <div className="rounded-3xl bg-muted/45 border border-border/60 p-2.5 space-y-2.5">
          {heroes.map((d) => (
            <ActivityHero key={d.id} a={d} now={now} lang={L} />
          ))}

          {(extraDiscover.length > 0 ||
            (primary.length === 0 && overflow.length > 0)) && (
            <div className="pt-0.5 space-y-1.5">
              {primary.length > 0 && discover.length > 0 && (
                <p className="text-[11px] font-medium text-muted-foreground px-1 pt-1">
                  {L === "en" ? "Hot near you" : "热门活动"}
                </p>
              )}
              {(primary.length > 0 ? extraDiscover : overflow).map((d) => (
                <ActivityRow key={d.id} a={d} lang={L} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ActivityHero({
  a,
  now,
  lang,
}: {
  a: JoinableActivity;
  now: number;
  lang: "zh" | "en";
}) {
  const remaining = new Date(a.endDate).getTime() - now;
  const days = Math.max(0, Math.floor(remaining / 86400000));
  const hours = Math.max(0, Math.floor((remaining % 86400000) / 3600000));
  const minutes = Math.max(0, Math.floor((remaining % 3600000) / 60000));
  const isDraw =
    a.kindTag === "exclusive_draw" ||
    a.kindTag === "co_win_draw" ||
    a.kindTag === "draw";
  const dead = a.grandPoolSgd === "0" && a.smallPoolSgd === "0";
  const prizePreview = a.prizes.slice(0, 2);
  const prods = productLine(a, lang);

  return (
    <Link href={a.href} className="block active:scale-[0.99] transition-transform">
      <div className="relative overflow-hidden rounded-2xl bg-festive text-white shadow-[0_8px_24px_-12px_rgba(196,52,31,0.45)] ring-1 ring-black/5">
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background:
              "radial-gradient(100px 90px at 92% 0%, rgba(255,214,120,0.35), transparent 72%)",
          }}
        />
        <div className="relative p-3.5">
          <div className="flex items-start gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/10">
              {isDraw ? <Trophy size={17} /> : <Ticket size={17} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="truncate text-[14px] font-bold leading-snug">
                  {a.name}
                </h3>
                {a.hot && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold">
                    <Flame size={10} />
                    {lang === "en" ? "HOT" : "热"}
                  </span>
                )}
              </div>
              <p className="truncate text-[11px] text-white/70 mt-0.5">
                {a.businessName}
                <span className="mx-1 opacity-50">·</span>
                <span className="text-white/80">{kindLabel(a.kindTag, lang)}</span>
              </p>
            </div>
            {a.joined && a.myCount > 0 && (
              <span className="shrink-0 rounded-full bg-white/18 px-2 py-0.5 text-[10px] font-semibold tabular-nums">
                ×{a.myCount}
              </span>
            )}
          </div>

          <p className="mt-2 flex items-center gap-1 text-[11px] text-white/80">
            <MapPin size={12} className="shrink-0 opacity-90" />
            <span className="truncate">{storeLine(a, lang)}</span>
          </p>
          {prods && (
            <p className="mt-1 text-[10px] text-white/65 truncate">{prods}</p>
          )}

          {!dead && isDraw && (
            <>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-white/65">
                    {lang === "en" ? "Grand pool" : "大奖池"}
                  </p>
                  <p className="mt-0.5 text-[28px] font-black leading-none nums tracking-tight">
                    <span className="text-sm font-bold text-white/80 mr-0.5">
                      S$
                    </span>
                    {a.grandPoolSgd}
                  </p>
                </div>
                {a.participantCount > 0 && (
                  <p className="text-[10px] text-white/70 text-right pb-0.5">
                    {lang === "en"
                      ? `${a.participantCount} joined`
                      : `${a.participantCount} 人参与`}
                  </p>
                )}
              </div>
              {prizePreview.length > 0 && (
                <div className="mt-2.5 space-y-1">
                  {prizePreview.map((p) => (
                    <div key={p.key} className="flex items-center gap-1.5">
                      <span className="w-3.5 shrink-0 text-center text-[11px]">
                        {p.icon}
                      </span>
                      <span className="w-12 shrink-0 truncate text-[10px] text-white/85">
                        {p.name}
                      </span>
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
                        <div
                          className="h-full rounded-full bg-gold"
                          style={{
                            width: `${Math.max(4, Math.min(100, p.progress))}%`,
                          }}
                        />
                      </div>
                      <span className="w-7 shrink-0 text-right text-[10px] font-semibold text-white/85 nums">
                        {p.progress}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="mt-3 flex items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1 text-[11px] text-white/80">
              <Clock size={12} className="shrink-0 opacity-90" />
              <span className="truncate nums">
                {days}d {String(hours).padStart(2, "0")}h{" "}
                {String(minutes).padStart(2, "0")}m
              </span>
            </span>
            <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full border border-white/55 bg-white/12 px-3 py-1.5 text-[12px] font-bold text-white backdrop-blur-sm">
              {a.joined
                ? lang === "en"
                  ? "View"
                  : "查看"
                : lang === "en"
                  ? "Join"
                  : "参与"}
              <ChevronRight size={14} className="opacity-90" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function ActivityRow({
  a,
  lang,
}: {
  a: JoinableActivity;
  lang: "zh" | "en";
}) {
  return (
    <Link href={a.href} className="block active:scale-[0.99] transition-transform">
      <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card/90 px-3 py-2.5 shadow-sm">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold/12 text-[color:var(--gold-strong)]">
          {a.hot ? <Flame size={16} /> : <Store size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium text-foreground">
              {a.name}
            </p>
            {a.hot && (
              <span className="shrink-0 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                {lang === "en" ? "HOT" : "热"}
              </span>
            )}
          </div>
          <p className="truncate text-[10px] text-muted-foreground">
            {a.businessName}
            {" · "}
            {storeLine(a, lang)}
            {a.grandPoolSgd !== "0" ? ` · S$${a.grandPoolSgd}` : ""}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-primary">
          {a.joined
            ? lang === "en"
              ? "View"
              : "查看"
            : lang === "en"
              ? "Join"
              : "参与"}
          <ChevronRight size={14} className="opacity-60" />
        </span>
      </div>
    </Link>
  );
}

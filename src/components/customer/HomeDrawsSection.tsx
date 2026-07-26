"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, Ticket, Clock, ChevronRight, Flame, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useLang } from "@/components/i18n/LanguageProvider";

export interface HomePrizeProgress {
  key: string;
  name: string;
  icon: string;
  progress: number; // 0-100
}

export interface HomeDrawItem {
  id: string;
  name: string;
  businessName: string;
  href: string;
  kind: "lucky_draw" | "lucky_draw_v2" | "voucher_sale";
  endDate: string;
  smallPoolSgd: string;
  grandPoolSgd: string;
  myCount: number;
  /** Best grand-prize ETA in days, if known */
  grandDaysPredicted: number | null;
  grandProgress: number | null;
  /** Per-prize pool progress, ladder order (smallest target first) */
  prizes: HomePrizeProgress[];
  joined: boolean;
}

export function HomeDrawsSection({
  myDraws,
  openDraws,
}: {
  myDraws: HomeDrawItem[];
  openDraws: HomeDrawItem[];
}) {
  const { t } = useLang();
  const [now, setNow] = useState(Date.now());

  const primary = myDraws.length > 0 ? myDraws : [];
  const discover = openDraws.filter((d) => !myDraws.some((m) => m.id === d.id));

  useEffect(() => {
    if (primary.length === 0 && discover.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [primary.length, discover.length]);

  const discoverOnly = primary.length === 0 && discover.length > 0;

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-sm font-semibold text-foreground">
          {t(discoverOnly ? "home.section.activeDraws" : "home.section.draws")}
        </h2>
        <Link
          href="/discover/draws"
          className="text-xs font-medium text-primary"
        >
          {t("home.vouchers.viewAll")}
        </Link>
      </div>

      {primary.length === 0 && discover.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card">
          <EmptyState
            icon="trophy"
            tone="festive"
            title={t("home.draws.empty")}
            description={t("home.draws.emptyHint")}
            action={
              <Link
                href="/discover/draws"
                className="inline-flex items-center gap-1 rounded-full bg-festive px-5 py-2 text-xs font-semibold text-white shadow-sm active:scale-[0.97] transition-transform"
              >
                {t("home.draws.browse")}
                <ChevronRight size={14} />
              </Link>
            }
          />
        </div>
      ) : (
        <>
          {(primary.length > 0 ? primary : discover.slice(0, 3)).map((d) => (
            <DrawHero
              key={d.id}
              d={d}
              now={now}
              joined={d.joined || primary.some((p) => p.id === d.id)}
            />
          ))}
          {primary.length > 0 && discover.length > 0 && (
            <div className="pt-1 space-y-2">
              <p className="text-xs font-medium text-muted-foreground px-0.5">
                {t("home.section.discoverDraws")}
              </p>
              {discover.slice(0, 2).map((d) => (
                <DrawRow key={d.id} d={d} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Festive (B) hero card — the prize pool is the focal point. */
function DrawHero({
  d,
  now,
  joined,
}: {
  d: HomeDrawItem;
  now: number;
  joined: boolean;
}) {
  const { t } = useLang();
  const remaining = new Date(d.endDate).getTime() - now;
  const days = Math.max(0, Math.floor(remaining / 86400000));
  const hours = Math.max(0, Math.floor((remaining % 86400000) / 3600000));
  const minutes = Math.max(0, Math.floor((remaining % 3600000) / 60000));
  const isV2 = d.kind !== "lucky_draw";
  const dead = d.grandPoolSgd === "0" && d.smallPoolSgd === "0";

  return (
    <Link href={d.href} className="block active:scale-[0.99] transition-transform">
      <div className="relative overflow-hidden rounded-2xl bg-festive text-white shadow-[0_14px_30px_-14px_rgba(196,52,31,0.6)]">
        {/* warm top-right glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120px 120px at 88% 6%, rgba(255,214,120,0.5), transparent 70%)",
          }}
        />
        <div className="relative p-4">
          {/* header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15">
                {isV2 ? <Ticket size={18} /> : <Trophy size={18} />}
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-[15px] font-bold leading-tight">
                  {d.name}
                </h3>
                <p className="truncate text-[11px] text-white/75">
                  {d.businessName}
                </p>
              </div>
            </div>
            {joined && d.myCount > 0 ? (
              <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-semibold">
                {t("home.draws.myVouchers", { count: String(d.myCount) })}
              </span>
            ) : (
              !dead && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-black/15 px-2.5 py-1 text-[10px] font-semibold">
                  <Flame size={11} />
                  {t("home.draws.hot")}
                </span>
              )
            )}
          </div>

          {dead ? (
            /* Invite state — no dead 0% bars for a fresh pool */
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/10 p-3">
              <Sparkles size={20} className="shrink-0 text-[color:var(--gold)]" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">
                  {t("home.draws.beFirstTitle")}
                </p>
                <p className="text-[11px] leading-snug text-white/80">
                  {t("home.draws.beFirstHint")}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* hero: grand pool */}
              <div className="mt-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">
                  {t("home.draws.poolLabel")}
                </p>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-[32px] font-black leading-none nums">
                    <span className="text-lg font-bold text-white/85">S$</span>
                    {d.grandPoolSgd}
                  </span>
                  <span className="text-[11px] font-medium text-white/75">
                    {t("home.draws.winRate")} ·{" "}
                    {t("home.draws.smallPool", { amount: d.smallPoolSgd })}
                  </span>
                </div>
              </div>

              {/* prize progress ladder */}
              {d.prizes.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  {d.prizes.map((p) => (
                    <div key={p.key} className="flex items-center gap-2">
                      <span className="w-4 shrink-0 text-center text-xs leading-none">
                        {p.icon}
                      </span>
                      <span className="w-14 shrink-0 truncate text-[10px] font-medium text-white/90">
                        {p.name}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
                        <div
                          className="h-full rounded-full bg-gold"
                          style={{ width: `${Math.max(4, Math.min(100, p.progress))}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-[10px] font-semibold text-white/90 nums">
                        {p.progress}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : d.grandProgress != null ? (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/25">
                  <div
                    className="h-full rounded-full bg-gold"
                    style={{ width: `${Math.max(4, Math.min(100, d.grandProgress))}%` }}
                  />
                </div>
              ) : null}
            </>
          )}

          {/* footer: countdown + CTA */}
          <div className="mt-3 flex items-center justify-between text-[11px] text-white/85">
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {t("home.draws.untilEnd")}{" "}
              <span className="font-semibold text-white nums">
                {days}d {String(hours).padStart(2, "0")}h{" "}
                {String(minutes).padStart(2, "0")}m
              </span>
            </span>
          </div>

          <div className="mt-3 flex items-center justify-center gap-1 rounded-xl bg-white py-2.5 text-[13px] font-bold text-[color:var(--festive-to)] active:scale-[0.98] transition-transform">
            {joined ? t("home.draws.view") : t("home.draws.enter")}
          </div>
        </div>
      </div>
    </Link>
  );
}

/** Calm (A) secondary row for discover draws — restraint below the hero. */
function DrawRow({ d }: { d: HomeDrawItem }) {
  const { t } = useLang();
  return (
    <Link href={d.href} className="block active:scale-[0.99] transition-transform">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 hover:border-gold/50">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold/15 text-[color:var(--gold-strong)]">
          <Trophy size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{d.name}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {d.businessName}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-[color:var(--festive-to)]">
          {t("home.draws.enter")}
        </span>
      </div>
    </Link>
  );
}

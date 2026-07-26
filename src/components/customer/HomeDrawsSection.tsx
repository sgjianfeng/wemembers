"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Trophy,
  Ticket,
  Clock,
  ChevronRight,
  Sparkles,
} from "lucide-react";
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

/** 亮色首页：最多 2 张 fest ive 大卡，其余冷静列表，避免橙墙 */
const HERO_LIMIT = 2;

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

  // 主列表：优先已参与；否则用发现列表
  const feed = primary.length > 0 ? primary : discover;
  const heroes = feed.slice(0, HERO_LIMIT);
  const overflow = feed.slice(HERO_LIMIT);
  // 已有主列表时，额外发现活动用冷静行
  const extraDiscover =
    primary.length > 0 ? discover.slice(0, 3) : overflow;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-sm font-semibold text-foreground">
          {t(discoverOnly ? "home.section.activeDraws" : "home.section.draws")}
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
        /* 浅灰托盘：托住橙卡，亮色层次 */
        <div className="rounded-3xl bg-muted/45 border border-border/60 p-2.5 space-y-2.5">
          {heroes.map((d) => (
            <DrawHero
              key={d.id}
              d={d}
              now={now}
              joined={d.joined || primary.some((p) => p.id === d.id)}
            />
          ))}

          {(extraDiscover.length > 0 || (primary.length === 0 && overflow.length > 0)) && (
            <div className="pt-0.5 space-y-1.5">
              {primary.length > 0 && discover.length > 0 && (
                <p className="text-[11px] font-medium text-muted-foreground px-1 pt-1">
                  {t("home.section.discoverDraws")}
                </p>
              )}
              {(primary.length > 0 ? extraDiscover : overflow).map((d) => (
                <DrawRow key={d.id} d={d} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Festive hero — 信息减层、CTA 改为描边白底 */
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
  // 奖进度最多 2 条，避免卡内墙
  const prizePreview = d.prizes.slice(0, 2);

  return (
    <Link href={d.href} className="block active:scale-[0.99] transition-transform">
      <div className="relative overflow-hidden rounded-2xl bg-festive text-white shadow-[0_8px_24px_-12px_rgba(196,52,31,0.45)] ring-1 ring-black/5">
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background:
              "radial-gradient(100px 90px at 92% 0%, rgba(255,214,120,0.35), transparent 72%)",
          }}
        />
        <div className="relative p-3.5">
          {/* header */}
          <div className="flex items-start gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/10">
              {isV2 ? <Ticket size={17} /> : <Trophy size={17} />}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[14px] font-bold leading-snug">
                {d.name}
              </h3>
              <p className="truncate text-[11px] text-white/70 mt-0.5">
                {d.businessName}
              </p>
            </div>
            {joined && d.myCount > 0 && (
              <span className="shrink-0 rounded-full bg-white/18 px-2 py-0.5 text-[10px] font-semibold tabular-nums">
                ×{d.myCount}
              </span>
            )}
          </div>

          {dead ? (
            /* 一行启动提示，不再大半透明条 */
            <p className="mt-3 flex items-center gap-1.5 text-[12px] text-white/90 leading-snug">
              <Sparkles
                size={14}
                className="shrink-0 text-[color:var(--gold)]"
              />
              <span>
                <span className="font-semibold">{t("home.draws.beFirstTitle")}</span>
                <span className="text-white/75">
                  {" · "}
                  {t("home.draws.beFirstHint")}
                </span>
              </span>
            </p>
          ) : (
            <>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-white/65">
                    {t("home.draws.poolLabel")}
                  </p>
                  <p className="mt-0.5 text-[28px] font-black leading-none nums tracking-tight">
                    <span className="text-sm font-bold text-white/80 mr-0.5">
                      S$
                    </span>
                    {d.grandPoolSgd}
                  </p>
                </div>
                <p className="text-[10px] text-white/70 text-right leading-snug pb-0.5 max-w-[42%]">
                  {t("home.draws.winRate")}
                  <br />
                  {t("home.draws.smallPool", { amount: d.smallPoolSgd })}
                </p>
              </div>

              {prizePreview.length > 0 ? (
                <div className="mt-2.5 space-y-1">
                  {prizePreview.map((p) => (
                    <div key={p.key} className="flex items-center gap-1.5">
                      <span className="w-3.5 shrink-0 text-center text-[11px] leading-none">
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
              ) : d.grandProgress != null ? (
                <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-gold"
                    style={{
                      width: `${Math.max(4, Math.min(100, d.grandProgress))}%`,
                    }}
                  />
                </div>
              ) : null}
            </>
          )}

          {/* footer: 倒计时 + 描边 CTA */}
          <div className="mt-3 flex items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1 text-[11px] text-white/80">
              <Clock size={12} className="shrink-0 opacity-90" />
              <span className="truncate">
                {t("home.draws.untilEnd")}{" "}
                <span className="font-semibold text-white nums">
                  {days}d {String(hours).padStart(2, "0")}h{" "}
                  {String(minutes).padStart(2, "0")}m
                </span>
              </span>
            </span>
            <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full border border-white/55 bg-white/12 px-3 py-1.5 text-[12px] font-bold text-white backdrop-blur-sm">
              {joined ? t("home.draws.view") : t("home.draws.enter")}
              <ChevronRight size={14} className="opacity-90" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/** Calm secondary row */
function DrawRow({ d }: { d: HomeDrawItem }) {
  const { t } = useLang();
  return (
    <Link href={d.href} className="block active:scale-[0.99] transition-transform">
      <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card/90 px-3 py-2.5 shadow-sm">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold/12 text-[color:var(--gold-strong)]">
          <Trophy size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{d.name}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {d.businessName}
            {d.grandPoolSgd !== "0" ? ` · S$${d.grandPoolSgd}` : ""}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-primary">
          {t("home.draws.enter")}
          <ChevronRight size={14} className="opacity-60" />
        </span>
      </div>
    </Link>
  );
}

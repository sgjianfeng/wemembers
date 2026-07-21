"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
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
    <section className="space-y-2">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-sm font-semibold text-slate-900">
          {t(discoverOnly ? "home.section.activeDraws" : "home.section.draws")}
        </h2>
        <Link
          href="/discover/draws"
          className="text-xs font-medium text-[#1A6EFF]"
        >
          {t("home.vouchers.viewAll")}
        </Link>
      </div>

      {primary.length === 0 && discover.length === 0 ? (
        <Card className="border-slate-100 bg-slate-50/80">
          <CardContent className="p-4 text-center">
            <p className="text-2xl mb-1">🎰</p>
            <p className="text-sm font-medium text-slate-700">{t("home.draws.empty")}</p>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              {t("home.draws.emptyHint")}
            </p>
            <Link
              href="/discover/draws"
              className="inline-flex mt-3 px-4 py-1.5 rounded-full text-xs font-semibold bg-white border border-slate-200 text-slate-700"
            >
              {t("home.draws.browse")}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {(primary.length > 0 ? primary : discover.slice(0, 3)).map((d) => (
            <DrawCard key={d.id} d={d} now={now} joined={d.joined || primary.some((p) => p.id === d.id)} />
          ))}
          {primary.length > 0 && discover.length > 0 && (
            <div className="pt-1 space-y-2">
              <p className="text-xs font-medium text-slate-500 px-0.5">
                {t("home.section.discoverDraws")}
              </p>
              {discover.slice(0, 2).map((d) => (
                <DrawCard key={d.id} d={d} now={now} joined={false} compact />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function DrawCard({
  d,
  now,
  joined,
  compact,
}: {
  d: HomeDrawItem;
  now: number;
  joined: boolean;
  compact?: boolean;
}) {
  const { t } = useLang();
  const remaining = new Date(d.endDate).getTime() - now;
  const days = Math.max(0, Math.floor(remaining / 86400000));
  const hours = Math.max(0, Math.floor((remaining % 86400000) / 3600000));
  const minutes = Math.max(0, Math.floor((remaining % 3600000) / 60000));
  const isV2 = d.kind !== "lucky_draw";

  if (compact) {
    return (
      <Link href={d.href}>
        <Card className="border-amber-100 hover:border-amber-200 transition-colors">
          <CardContent className="p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{d.name}</p>
              <p className="text-[10px] text-slate-400 truncate">{d.businessName}</p>
            </div>
            <span className="shrink-0 text-[11px] font-medium text-[#FF6B35]">
              {t("home.draws.enter")}
            </span>
          </CardContent>
        </Card>
      </Link>
    );
  }

  return (
    <Link href={d.href}>
      <Card className="overflow-hidden border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 hover:border-amber-300 transition-colors">
        <div className="h-1 bg-gradient-to-r from-[#FF6B35] via-amber-400 to-[#FF6B35]" />
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0 flex items-start gap-2">
              <span className="text-xl shrink-0">{isV2 ? "🎟️" : "🎰"}</span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 truncate">{d.name}</h3>
                <p className="text-[10px] text-slate-400 truncate">{d.businessName}</p>
              </div>
            </div>
            {joined && d.myCount > 0 && (
              <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-semibold">
                {t("home.draws.myVouchers", { count: String(d.myCount) })}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-xl bg-white/70 px-2.5 py-2">
              <p className="text-[10px] text-amber-600">{t("home.draws.smallPool", { amount: d.smallPoolSgd })}</p>
            </div>
            <div className="rounded-xl bg-white/70 px-2.5 py-2">
              <p className="text-[10px] text-amber-700 font-medium">
                {t("home.draws.grandPool", { amount: d.grandPoolSgd })}
              </p>
            </div>
          </div>

          {d.prizes.length > 0 ? (
            <div className="mb-3 space-y-1.5">
              {d.prizes.map((p) => (
                <div key={p.key} className="flex items-center gap-2">
                  <span className="text-xs shrink-0">{p.icon}</span>
                  <span className="w-16 shrink-0 truncate text-[10px] font-medium text-amber-900">
                    {p.name}
                  </span>
                  <div className="h-1.5 flex-1 bg-amber-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-[#FF6B35] rounded-full"
                      style={{ width: `${Math.min(100, p.progress)}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-amber-600">
                    {p.progress}%
                  </span>
                </div>
              ))}
              {d.grandDaysPredicted != null && (
                <p className="text-[10px] text-amber-500">
                  {t("home.draws.grandEta", { days: String(d.grandDaysPredicted) })}
                </p>
              )}
            </div>
          ) : d.grandProgress != null ? (
            <div className="mb-3">
              <div className="h-1.5 bg-amber-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-[#FF6B35] rounded-full"
                  style={{ width: `${Math.min(100, d.grandProgress)}%` }}
                />
              </div>
              {d.grandDaysPredicted != null && (
                <p className="text-[10px] text-amber-500 mt-1">
                  {t("home.draws.grandEta", { days: String(d.grandDaysPredicted) })}
                </p>
              )}
            </div>
          ) : null}

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">
              {t("home.draws.untilEnd")}{" "}
              <span className="font-semibold text-amber-800 tabular-nums">
                {days}d {String(hours).padStart(2, "0")}h {String(minutes).padStart(2, "0")}m
              </span>
            </span>
            <span className="font-medium text-[#FF6B35]">
              {joined ? t("home.draws.view") : t("home.draws.enter")}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { useLang } from "@/components/i18n/LanguageProvider";

export type CampaignKind = "lucky_draw" | "lucky_draw_v2" | "voucher_sale";

export interface CampaignDraw {
  id: string;
  name: string;
  slug: string | null;
  kind: CampaignKind;
  drawDate: string | null;
  endDate: string;
  grandPoolSgd: string;
  totalPoolSgd: string;
  targetPoolSgd: string | null;
  totalTicketCount: number;
  businessName: string;
  myTicketCount: number;
  href: string;
}

interface CountdownCardProps {
  draws: CampaignDraw[];
  /** Fallback CTA when no active draws (e.g. first coupon or wallet) */
  emptyCta?: { href: string; labelKey: string };
}

export function CountdownCard({ draws, emptyCta }: CountdownCardProps) {
  const { t } = useLang();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (draws.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [draws.length]);

  if (draws.length === 0) {
    return (
      <Card className="bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200">
        <CardContent className="p-4 text-center">
          <p className="text-2xl mb-2">🎰</p>
          <p className="text-sm text-slate-600 font-medium">{t("home.countdown.noActive")}</p>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed px-2">
            {t("home.countdown.noActiveHint")}
          </p>
          {emptyCta && (
            <Link
              href={emptyCta.href}
              className="inline-flex mt-3 px-4 py-1.5 rounded-full text-xs font-semibold bg-[#1A6EFF] text-white hover:bg-blue-600 active:scale-95 transition-all"
            >
              {t(emptyCta.labelKey)}
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  // Most urgent: user tickets first, then closest end
  const draw = [...draws].sort((a, b) => {
    if (a.myTicketCount > 0 && b.myTicketCount === 0) return -1;
    if (b.myTicketCount > 0 && a.myTicketCount === 0) return 1;
    return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
  })[0];

  const target = new Date(draw.drawDate || draw.endDate).getTime();
  const remaining = target - now;

  const days = Math.max(0, Math.floor(remaining / 86400000));
  const hours = Math.max(0, Math.floor((remaining % 86400000) / 3600000));
  const minutes = Math.max(0, Math.floor((remaining % 3600000) / 60000));
  const seconds = Math.max(0, Math.floor((remaining % 60000) / 1000));

  const poolValue = Number(draw.totalPoolSgd || draw.grandPoolSgd || "0");
  const targetPool = draw.targetPoolSgd ? Number(draw.targetPoolSgd) : null;
  const progress =
    targetPool && targetPool > 0
      ? Math.min(100, Math.round((poolValue / targetPool) * 100))
      : null;
  const isExpired = remaining <= 0;
  const isV2 = draw.kind === "lucky_draw_v2" || draw.kind === "voucher_sale";

  const ctaLabel =
    draw.myTicketCount > 0
      ? t("common.viewAll")
      : isV2
      ? t("home.countdown.buyAndDraw")
      : t("home.countdown.enterDraw");

  return (
    <div className="space-y-2">
      {draws.length > 1 && (
        <h2 className="text-sm font-semibold text-slate-900 px-0.5">
          {t("home.section.campaigns")}
        </h2>
      )}
      <Link href={draw.href}>
        <Card className="overflow-hidden border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 hover:border-amber-300 transition-colors cursor-pointer">
          <div className="h-1 bg-gradient-to-r from-[#FF6B35] via-amber-400 to-[#FF6B35]" />

          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xl shrink-0">{isV2 ? "🎟️" : "🎰"}</span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 truncate">{draw.name}</h3>
                  <p className="text-[10px] text-slate-400 truncate">{draw.businessName}</p>
                </div>
              </div>
              {draw.myTicketCount > 0 && (
                <span className="shrink-0 px-2.5 py-1 bg-amber-200 text-amber-800 text-[11px] font-semibold rounded-full">
                  {t("home.countdown.myTickets", { count: String(draw.myTicketCount) })}
                </span>
              )}
            </div>

            {isExpired ? (
              <div className="text-center py-3 bg-red-50 rounded-xl mb-3">
                <p className="text-sm font-bold text-red-500">🔔 {t("draw.ended")}</p>
              </div>
            ) : (
              <div className="mb-3">
                <p className="text-[10px] text-amber-500 mb-1 text-center">
                  {draw.drawDate ? t("home.countdown.untilDraw") : t("home.countdown.untilEnd")}
                </p>
                <div className="flex items-center justify-center gap-1">
                  <TimeBlock v={days} label="d" />
                  <Sep />
                  <TimeBlock v={hours} label="h" />
                  <Sep />
                  <TimeBlock v={minutes} label="m" />
                  <Sep />
                  <TimeBlock v={seconds} label="s" urgent={remaining < 3600000} />
                </div>
              </div>
            )}

            {/* Pool */}
            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-amber-700 font-medium">
                  {t("home.countdown.pool", {
                    amount: poolValue.toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    }),
                  })}
                </span>
                {targetPool != null && targetPool > 0 && (
                  <span className="text-amber-500">
                    S${targetPool.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                )}
              </div>
              {progress != null && (
                <div className="h-2 bg-amber-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-[#FF6B35] rounded-full transition-all duration-1000"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
              <div className="flex justify-between text-[10px] mt-0.5">
                {progress != null ? (
                  <span className="text-amber-400">{progress}%</span>
                ) : (
                  <span />
                )}
                <span className="text-amber-400">
                  {t("home.countdown.ticketsCount", {
                    count: String(draw.totalTicketCount.toLocaleString()),
                  })}
                </span>
              </div>
            </div>

            <div className="mt-3 text-center">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[#FF6B35]">
                {ctaLabel}
              </span>
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* Extra campaigns (compact) */}
      {draws.length > 1 &&
        draws
          .filter((d) => d.id !== draw.id)
          .slice(0, 2)
          .map((d) => (
            <Link key={d.id} href={d.href}>
              <Card className="border-amber-100 hover:border-amber-200 transition-colors">
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{d.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{d.businessName}</p>
                  </div>
                  <span className="shrink-0 text-[11px] font-medium text-[#FF6B35]">
                    {d.kind === "lucky_draw" ? t("home.countdown.enterDraw") : t("home.countdown.buyAndDraw")}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
    </div>
  );
}

function TimeBlock({ v, label, urgent }: { v: number; label: string; urgent?: boolean }) {
  return (
    <div className={`text-center min-w-[28px] px-1 py-1 rounded-lg ${urgent ? "bg-red-100" : "bg-white/60"}`}>
      <span className={`text-lg font-bold tabular-nums ${urgent ? "text-red-500 animate-pulse" : "text-amber-700"}`}>
        {String(v).padStart(2, "0")}
      </span>
      <span className="block text-[9px] text-amber-400">{label}</span>
    </div>
  );
}

function Sep() {
  return <span className="text-amber-300 font-bold text-sm">:</span>;
}

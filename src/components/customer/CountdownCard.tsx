"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { useLang } from "@/components/i18n/LanguageProvider";

interface CampaignDraw {
  id: string;
  name: string;
  slug: string | null;
  drawDate: string | null;
  endDate: string;
  grandPoolSgd: string;
  totalTicketCount: number;
  businessName: string;
  myTicketCount: number;
}

interface CountdownCardProps {
  draws: CampaignDraw[];
}

export function CountdownCard({ draws }: CountdownCardProps) {
  const { t } = useLang();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (draws.length === 0) {
    return (
      <Card className="bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200">
        <CardContent className="p-4 text-center">
          <p className="text-2xl mb-2">🎰</p>
          <p className="text-sm text-slate-400">{t("home.countdown.noActive")}</p>
        </CardContent>
      </Card>
    );
  }

  // Show the most urgent draw (closest to ending or with user tickets)
  const draw = draws[0];
  const target = new Date(draw.drawDate || draw.endDate).getTime();
  const remaining = target - now;

  const days = Math.max(0, Math.floor(remaining / 86400000));
  const hours = Math.max(0, Math.floor((remaining % 86400000) / 3600000));
  const minutes = Math.max(0, Math.floor((remaining % 3600000) / 60000));
  const seconds = Math.max(0, Math.floor((remaining % 60000) / 1000));

  const poolValue = Number(draw.grandPoolSgd || "0");
  const targetPool = 200000;
  const progress = Math.min(100, Math.round((poolValue / targetPool) * 100));
  const isExpired = remaining <= 0;

  return (
    <Link href={draw.slug ? `/draw/${draw.slug}` : `/draw/${draw.id}`}>
      <Card className="overflow-hidden border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 hover:border-amber-300 transition-colors cursor-pointer">
        {/* Top gradient bar */}
        <div className="h-1 bg-gradient-to-r from-[#FF6B35] via-amber-400 to-[#FF6B35]" />

        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎰</span>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{draw.name}</h3>
                <p className="text-[10px] text-slate-400">{draw.businessName}</p>
              </div>
            </div>
            {draw.myTicketCount > 0 && (
              <span className="px-2.5 py-1 bg-amber-200 text-amber-800 text-[11px] font-semibold rounded-full">
                {t("home.countdown.myTickets", { count: String(draw.myTicketCount) })}
              </span>
            )}
          </div>

          {/* Countdown or Ended */}
          {isExpired ? (
            <div className="text-center py-3 bg-red-50 rounded-xl mb-3">
              <p className="text-sm font-bold text-red-500">🔔 {t("draw.ended")}</p>
            </div>
          ) : (
            <div className="mb-3">
              <p className="text-[10px] text-amber-500 mb-1 text-center">
                {draw.drawDate ? "距离开奖" : "距离结束"}
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

          {/* Pool Progress */}
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-amber-700 font-medium">
                S${poolValue.toLocaleString()}
              </span>
              <span className="text-amber-500">S$200,000</span>
            </div>
            <div className="h-2 bg-amber-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-[#FF6B35] rounded-full transition-all duration-1000"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] mt-0.5">
              <span className="text-amber-400">{progress}%</span>
              <span className="text-amber-400">
                {draw.totalTicketCount.toLocaleString()} tickets
              </span>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-3 text-center">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[#FF6B35]">
              {draw.myTicketCount > 0 ? t("common.viewAll") : t("home.countdown.enterDraw")}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
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

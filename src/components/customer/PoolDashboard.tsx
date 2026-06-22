"use client";

import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useLang } from "@/components/i18n/LanguageProvider";

export interface CountdownItem {
  prizeName: string;
  targetCents: number;
  currentCents: number;
  progress: number;
  daysPredicted: number;
  velocityPerDay: number;
  accelerating: boolean;
}

interface PoolDashboardProps {
  countdowns: CountdownItem[];
  instantPoolSgd: string;
  dailyAvgVelocity: number; // in cents
  pool?: { instantPool?: { sgd?: string }; midPool?: { sgd?: string }; grandPool?: { sgd?: string } };
}

function formatSgd(cents: number): string {
  const sgd = cents / 100;
  if (sgd >= 10000) {
    return `S$${(sgd / 1000).toFixed(0)}K`;
  }
  return `S$${sgd.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const PRIZE_ICONS: Record<string, string> = {
  iPhone: "📱",
  MacBook: "💻",
  BYD: "🚗",
};

function CountdownCard({ item }: { item: CountdownItem }) {
  const { t, lang } = useLang();

  const current = Math.max(0, item.currentCents);
  const target = Math.max(1, item.targetCents);
  const pct = Math.min(100, Math.max(0, (current / target) * 100));
  const icon = PRIZE_ICONS[item.prizeName] || "🎁";

  // Days display — cap absurd predictions
  let daysLabel: string;
  if (item.daysPredicted <= 0) {
    daysLabel = t("pool.drawToday");
  } else if (item.daysPredicted === 1) {
    daysLabel = t("pool.drawTomorrow");
  } else if (item.daysPredicted <= 3) {
    daysLabel = t("pool.drawDaysSoon");
  } else if (item.daysPredicted > 365) {
    daysLabel = t("pool.drawDaysFar");
  } else {
    daysLabel = t("pool.drawDays", { days: item.daysPredicted });
  }

  return (
    <Card className="border-slate-100 overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <span className="text-sm font-semibold text-slate-900">{item.prizeName}</span>
          </div>
          <Badge variant={item.accelerating ? "green" : "slate"} size="sm">
            {item.accelerating ? t("pool.accelerating") : t("pool.steady")}
          </Badge>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>{t("pool.target")} {formatSgd(target)}</span>
            <span>{pct.toFixed(1)}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-700"
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">
            {t("pool.raised")} <b className="text-slate-700">{formatSgd(current)}</b>
          </span>
          <span className="text-slate-500">
            {t("pool.remaining")} <b className="text-slate-700">{formatSgd(target - current)}</b>
          </span>
        </div>

        <div className="pt-1 border-t border-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {t("pool.velocity") ? t("pool.velocity", { amount: formatSgd(item.velocityPerDay) }) : formatSgd(item.velocityPerDay)}
          </span>
          <span
            className={`text-sm font-bold ${
              item.daysPredicted <= 0 ? "text-green-600" : item.daysPredicted <= 3 ? "text-amber-600" : "text-blue-600"
            }`}
          >
            {daysLabel}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function PoolDashboard({ countdowns, instantPoolSgd, dailyAvgVelocity }: PoolDashboardProps) {
  const { t } = useLang();

  if (!countdowns || countdowns.length === 0) {
    return (
      <Card>
        <CardContent className="p-5 text-center text-sm text-slate-400">
          {t("pool.noData")}
        </CardContent>
      </Card>
    );
  }

  const velocityFormatted = dailyAvgVelocity > 0
    ? formatSgd(dailyAvgVelocity)
    : null;

  return (
    <div className="space-y-4">
      {/* Instant pool summary */}
      <Card>
        <CardContent className="p-4 space-y-1">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">{t("pool.title")}</h3>
            <Badge variant="green" size="sm">{t("pool.active")}</Badge>
          </div>
          <p className="text-xs text-slate-400">
            {t("pool.instantPool")} {instantPoolSgd && !isNaN(Number(instantPoolSgd)) ? `S$${Number(instantPoolSgd).toFixed(2)}` : ""}
            {velocityFormatted ? ` · ${velocityFormatted}/day` : ` · ${t("pool.velocityNone")}`}
          </p>
        </CardContent>
      </Card>

      {/* Grand prize countdown */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-slate-800 px-0.5">{t("pool.grandPrizes")}</h4>
        <div className="space-y-2">
          {countdowns.map((item) => (
            <CountdownCard key={item.prizeName} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

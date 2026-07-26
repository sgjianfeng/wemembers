"use client";

import { Tablet, Smartphone, Car, Gift, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useLang } from "@/components/i18n/LanguageProvider";

export interface CountdownItem {
  prizeKey?: string;
  prizeName: string;
  prizeIcon?: string;
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
  pool?: {
    instantPool?: { sgd?: string };
    deferredPool?: { sgd?: string };
    grandPool?: { sgd?: string };
  };
}

function formatSgd(cents: number): string {
  const sgd = cents / 100;
  if (sgd >= 10000) {
    return `S$${(sgd / 1000).toFixed(0)}K`;
  }
  return `S$${sgd.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Map a grand-prize to a lucide glyph (chrome). Operator-supplied prizeIcon
 *  emoji is treated as content and rendered as-is when present. */
function lucideForPrize(name: string, key?: string): LucideIcon {
  const s = `${name} ${key ?? ""}`.toLowerCase();
  if (s.includes("ipad") || s.includes("tablet") || s.includes("平板")) return Tablet;
  if (s.includes("iphone") || s.includes("phone") || s.includes("手机")) return Smartphone;
  if (s.includes("byd") || s.includes("car") || s.includes("座驾") || s.includes("车"))
    return Car;
  return Gift;
}

function CountdownCard({ item }: { item: CountdownItem }) {
  const { t } = useLang();

  const current = Math.max(0, item.currentCents);
  const target = Math.max(1, item.targetCents);
  const pct = Math.min(100, Math.max(0, (current / target) * 100));
  const PrizeIcon = lucideForPrize(item.prizeName, item.prizeKey);

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
    <Card className="border-border overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold/15 text-[color:var(--gold-strong)]">
              {item.prizeIcon ? (
                <span className="text-base leading-none">{item.prizeIcon}</span>
              ) : (
                <PrizeIcon size={17} />
              )}
            </span>
            <span className="text-sm font-semibold text-foreground">{item.prizeName}</span>
          </div>
          <Badge variant={item.accelerating ? "green" : "slate"} size="sm">
            {item.accelerating ? t("pool.accelerating") : t("pool.steady")}
          </Badge>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {t("pool.target")} <span className="nums">{formatSgd(target)}</span>
            </span>
            <span className="nums">{pct.toFixed(1)}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gold rounded-full transition-all duration-700"
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {t("pool.raised")}{" "}
            <b className="text-foreground nums">{formatSgd(current)}</b>
          </span>
          <span className="text-muted-foreground">
            {t("pool.remaining")}{" "}
            <b className="text-foreground nums">{formatSgd(target - current)}</b>
          </span>
        </div>

        <div className="pt-1 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground nums">
            {t("pool.velocity")
              ? t("pool.velocity", { amount: formatSgd(item.velocityPerDay) })
              : formatSgd(item.velocityPerDay)}
          </span>
          <span
            className={`text-sm font-bold ${
              item.daysPredicted <= 0
                ? "text-green-600"
                : item.daysPredicted <= 3
                  ? "text-[color:var(--gold-strong)]"
                  : "text-primary"
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
        <CardContent className="p-5 text-center text-sm text-muted-foreground">
          {t("pool.noData")}
        </CardContent>
      </Card>
    );
  }

  const velocityFormatted = dailyAvgVelocity > 0 ? formatSgd(dailyAvgVelocity) : null;

  return (
    <div className="space-y-4">
      {/* Instant pool summary */}
      <Card>
        <CardContent className="p-4 space-y-1">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">{t("pool.title")}</h3>
            <Badge variant="green" size="sm">{t("pool.active")}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("pool.instantPool")}{" "}
            <span className="nums">
              {instantPoolSgd && !isNaN(Number(instantPoolSgd))
                ? `S$${Number(instantPoolSgd).toFixed(2)}`
                : ""}
            </span>
            {velocityFormatted ? ` · ${velocityFormatted}/day` : ` · ${t("pool.velocityNone")}`}
          </p>
        </CardContent>
      </Card>

      {/* Grand prize countdown */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-foreground px-0.5">{t("pool.grandPrizes")}</h4>
        <div className="space-y-2">
          {countdowns.map((item) => (
            <CountdownCard key={item.prizeName} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

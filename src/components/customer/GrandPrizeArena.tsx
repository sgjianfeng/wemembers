"use client";

/**
 * 延迟大奖仪式舞台：环绕奖品轨道 + 共享进度光环 + 个人权重入场感。
 * 大奖不当场开抽，但视觉上要有「我在大奖局里」的兴奋感。
 */
import { useMemo, useState } from "react";
import {
  Tablet,
  Smartphone,
  Car,
  Gift,
  Sparkles,
  Scale,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LuckyWheel, type WheelSegment } from "@/components/customer/LuckyWheel";
import type { CountdownItem } from "@/components/customer/PoolDashboard";

type Props = {
  lang: "zh" | "en";
  countdowns: CountdownItem[];
  instantPoolSgd?: string;
  dailyAvgVelocity?: number;
  /** 用户大奖权重（可选） */
  myWeight?: number;
  entryCount?: number;
  className?: string;
  /** 是否展示「预览开奖仪式」转盘（演示用，不 commit 结果） */
  showCeremonyPreview?: boolean;
};

function formatSgd(cents: number): string {
  const sgd = cents / 100;
  if (sgd >= 10000) return `S$${(sgd / 1000).toFixed(0)}K`;
  if (sgd > 0 && sgd < 100) {
    return `S$${sgd.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `S$${sgd.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function lucideForPrize(name: string, key?: string): LucideIcon {
  const s = `${name} ${key ?? ""}`.toLowerCase();
  if (s.includes("ipad") || s.includes("tablet") || s.includes("平板"))
    return Tablet;
  if (s.includes("iphone") || s.includes("phone") || s.includes("手机"))
    return Smartphone;
  if (
    s.includes("byd") ||
    s.includes("car") ||
    s.includes("座驾") ||
    s.includes("车")
  )
    return Car;
  return Gift;
}

function daysLabel(
  item: CountdownItem,
  lang: "zh" | "en"
): string {
  if (item.daysPredicted <= 0)
    return lang === "en" ? "Draw soon" : "即将开奖";
  if (item.daysPredicted === 1)
    return lang === "en" ? "Tomorrow" : "预计明天";
  if (item.daysPredicted <= 3)
    return lang === "en" ? "Any day now" : "即将开奖";
  if (item.daysPredicted > 365)
    return lang === "en" ? "Building up" : "持续冲刺中";
  return lang === "en"
    ? `~${item.daysPredicted}d`
    : `约 ${item.daysPredicted} 天`;
}

export function GrandPrizeArena({
  lang,
  countdowns,
  instantPoolSgd,
  dailyAvgVelocity = 0,
  myWeight = 0,
  entryCount = 0,
  className,
  showCeremonyPreview = true,
}: Props) {
  const [showPreview, setShowPreview] = useState(false);

  const sorted = useMemo(
    () =>
      [...(countdowns || [])].sort(
        (a, b) => a.targetCents - b.targetCents
      ),
    [countdowns]
  );

  const lead = sorted[0];
  const leadPct = lead
    ? Math.min(100, Math.max(0, (lead.currentCents / Math.max(1, lead.targetCents)) * 100))
    : 0;

  const wheelSegs: WheelSegment[] = sorted.map((c, i) => ({
    id: c.prizeKey || c.prizeName,
    label: c.prizeName,
    icon: c.prizeIcon || "🎁",
    matchName: c.prizeName,
    tone: (["violet", "rose", "amber", "sky"] as const)[i % 4],
  }));

  if (!sorted.length) {
    return (
      <div
        className={cn(
          "rounded-3xl border border-border bg-card p-6 text-center text-sm text-muted-foreground",
          className
        )}
      >
        {lang === "en" ? "Prize pool loading…" : "奖池加载中…"}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Hero arena */}
      <div className="relative overflow-hidden rounded-3xl border border-violet-200/60 bg-gradient-to-b from-violet-950 via-fuchsia-950 to-rose-950 p-5 text-white shadow-[0_12px_40px_rgba(91,33,182,0.25)] dark:border-violet-800/40">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-fuchsia-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-amber-400/20 blur-3xl" />

        <div className="relative flex items-start justify-between gap-2 mb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-200/90">
              {lang === "en" ? "Grand prize arena" : "延迟大奖 · 开奖舞台"}
            </p>
            <h3 className="mt-1 text-lg font-bold tracking-tight text-balance">
              {lang === "en"
                ? "Pool builds · weight wins"
                : "奖池冲刺 · 权重开奖"}
            </h3>
          </div>
          <Badge
            variant="green"
            size="sm"
            className="shrink-0 bg-emerald-400/20 text-emerald-100 border-emerald-300/30"
          >
            {lang === "en" ? "Live" : "进行中"}
          </Badge>
        </div>

        {/* Orbit ring */}
        <div className="relative mx-auto mb-4 h-[200px] w-[200px]">
          <div
            className="absolute inset-0 rounded-full border border-white/15"
            style={{
              background: `conic-gradient(from -90deg, #fbbf24 0%, #a78bfa ${leadPct}%, rgba(255,255,255,0.08) ${leadPct}%)`,
            }}
          />
          <div className="absolute inset-[10px] rounded-full bg-gradient-to-b from-violet-900/90 to-rose-950/95 ring-1 ring-white/10" />

          {/* orbiting prizes */}
          <div className="grand-orbit absolute inset-0">
            {sorted.slice(0, 4).map((item, i) => {
              const n = Math.min(4, sorted.length);
              const angle = (360 / n) * i - 90;
              const rad = (angle * Math.PI) / 180;
              const r = 78;
              const x = Math.cos(rad) * r;
              const y = Math.sin(rad) * r;
              const Icon = lucideForPrize(item.prizeName, item.prizeKey);
              return (
                <div
                  key={item.prizeKey || item.prizeName}
                  className="absolute left-1/2 top-1/2"
                  style={{
                    transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                  }}
                >
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/12 ring-1 ring-white/25 backdrop-blur-sm shadow-lg">
                    {item.prizeIcon ? (
                      <span className="text-lg leading-none">
                        {item.prizeIcon}
                      </span>
                    ) : (
                      <Icon size={18} className="text-amber-200" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* center hub */}
          <div className="absolute left-1/2 top-1/2 z-10 flex h-[104px] w-[104px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-gradient-to-b from-white/15 to-white/5 ring-1 ring-white/20 backdrop-blur-md">
            <Sparkles size={14} className="mb-0.5 text-amber-300" />
            <p className="text-[9px] font-medium uppercase tracking-wide text-white/70">
              {lang === "en" ? "Next unlock" : "下一档"}
            </p>
            <p className="text-sm font-bold text-amber-200">
              {lead?.prizeName || "—"}
            </p>
            <p className="mt-0.5 text-lg font-bold nums text-white">
              {leadPct.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* my weight ticket */}
        <div className="relative mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/15">
            <p className="flex items-center gap-1 text-[10px] text-white/70">
              <Scale size={11} />
              {lang === "en" ? "Your weight" : "我的权重"}
            </p>
            <p className="mt-0.5 text-xl font-bold nums text-amber-200">
              {myWeight > 0 ? myWeight.toLocaleString() : "—"}
            </p>
            <p className="text-[10px] text-white/55">
              {entryCount > 0
                ? lang === "en"
                  ? `${entryCount} entr${entryCount > 1 ? "ies" : "y"}`
                  : `${entryCount} 张参与券`
                : lang === "en"
                  ? "Buy to enter"
                  : "购券即可入局"}
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/15">
            <p className="text-[10px] text-white/70">
              {lang === "en" ? "Instant pool" : "即时小奖池"}
            </p>
            <p className="mt-0.5 text-xl font-bold nums text-white">
              {instantPoolSgd != null && !isNaN(Number(instantPoolSgd))
                ? `S$${Number(instantPoolSgd).toFixed(2)}`
                : "S$0"}
            </p>
            <p className="text-[10px] text-white/55">
              {dailyAvgVelocity > 0
                ? lang === "en"
                  ? `${formatSgd(dailyAvgVelocity)}/day`
                  : `日均 ${formatSgd(dailyAvgVelocity)}`
                : lang === "en"
                  ? "Building velocity"
                  : "增速积累中"}
            </p>
          </div>
        </div>

        <p className="relative text-center text-[11px] leading-relaxed text-white/70">
          {lang === "en"
            ? "When a ladder target is fully funded (e.g. iPad), a real grand-draw button appears for participants. Until then: progress + weight only."
            : "当某一档奖池筹满（如 iPad 达标），参与用户会出现「真抽大奖」按钮；未达标前只显示进度与权重。"}
        </p>
      </div>

      {/* 达标后：真开奖入口位（后端开奖通道上线后启用；现为占位） */}
      {sorted.some(
        (c) =>
          c.targetCents > 0 && c.currentCents >= c.targetCents
      ) && (
        <div className="rounded-2xl border border-emerald-300/70 bg-gradient-to-b from-emerald-50 to-card p-4 text-center shadow-sm dark:border-emerald-800/50 dark:from-emerald-950/40">
          <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
            {lang === "en"
              ? "Prize tier unlocked"
              : "奖池已达标 · 可开大奖"}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {lang === "en"
              ? "Real weighted draw for this tier will open here for ticket holders."
              : "该档真实加权开奖将在此出现；有参与券的用户可点按钮进入仪式转盘。"}
          </p>
          <Button
            type="button"
            className="mt-3 h-11 w-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 font-bold text-white"
            disabled
          >
            {lang === "en"
              ? "Grand draw (opening soon)"
              : "真抽大奖（通道即将开放）"}
          </Button>
        </div>
      )}

      {/* Prize ladder cards */}
      <div className="space-y-2">
        <p className="px-0.5 text-sm font-semibold text-foreground">
          {lang === "en" ? "Prize ladder" : "大奖阶梯"}
        </p>
        {sorted.map((item, idx) => {
          const pct = Math.min(
            100,
            Math.max(0, (item.currentCents / Math.max(1, item.targetCents)) * 100)
          );
          const Icon = lucideForPrize(item.prizeName, item.prizeKey);
          const unlocked = pct >= 100;
          const near = !unlocked && pct >= 80;
          return (
            <div
              key={item.prizeKey || item.prizeName}
              className={cn(
                "overflow-hidden rounded-2xl border bg-card p-3.5 transition-shadow",
                unlocked
                  ? "border-emerald-400/80 shadow-[0_0_24px_rgba(16,185,129,0.2)]"
                  : near
                    ? "border-amber-300/80 shadow-[0_0_24px_rgba(251,191,36,0.18)]"
                    : "border-border"
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                      idx === 0
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                        : idx === 1
                          ? "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                          : "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                    )}
                  >
                    {item.prizeIcon ? (
                      <span className="text-lg">{item.prizeIcon}</span>
                    ) : (
                      <Icon size={18} />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {item.prizeName}
                    </p>
                    <p className="text-[11px] text-muted-foreground nums">
                      {lang === "en" ? "Target" : "目标"}{" "}
                      {formatSgd(item.targetCents)}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className={cn(
                      "text-sm font-bold",
                      unlocked
                        ? "text-emerald-600 dark:text-emerald-400"
                        : near
                          ? "text-[color:var(--gold-strong)]"
                          : "text-foreground"
                    )}
                  >
                    {unlocked
                      ? lang === "en"
                        ? "Unlocked"
                        : "已达标"
                      : daysLabel(item, lang)}
                  </p>
                  <p className="text-[11px] nums text-muted-foreground">
                    {pct.toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="mb-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    unlocked
                      ? "bg-gradient-to-r from-emerald-400 to-teal-500"
                      : near
                        ? "bg-gradient-to-r from-amber-400 to-orange-500"
                        : "bg-gradient-to-r from-violet-500 to-fuchsia-500"
                  )}
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>
                  {lang === "en" ? "Raised" : "已筹"}{" "}
                  <b className="nums text-foreground">
                    {formatSgd(item.currentCents)}
                  </b>
                </span>
                <span>
                  {lang === "en" ? "Left" : "剩余"}{" "}
                  <b className="nums text-foreground">
                    {formatSgd(Math.max(0, item.targetCents - item.currentCents))}
                  </b>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Ceremony preview wheel — visual only */}
      {showCeremonyPreview && wheelSegs.length > 0 && (
        <div className="rounded-3xl border border-dashed border-violet-300/60 bg-violet-50/40 p-3 dark:border-violet-800/40 dark:bg-violet-950/20">
          {!showPreview ? (
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <p className="text-sm font-semibold text-foreground">
                {lang === "en"
                  ? "Preview draw ceremony"
                  : "预览开奖仪式"}
              </p>
              <p className="max-w-xs text-[11px] leading-relaxed text-muted-foreground">
                {lang === "en"
                  ? "Feel the spin — real grand draw runs when a target is met (by weight). This is a ceremony preview only."
                  : "感受转盘氛围。真正开奖在奖池达标后按权重抽取；此处仅为仪式预览，不记结果。"}
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-1 h-10 rounded-full border-violet-300 px-5 text-violet-800 dark:border-violet-700 dark:text-violet-200"
                onClick={() => {
                  setShowPreview(true);
                }}
              >
                {lang === "en" ? "Open ceremony wheel" : "打开仪式转盘"}
              </Button>
            </div>
          ) : (
            <LuckyWheel
              lang={lang}
              theme="grand"
              segments={wheelSegs}
              title={
                lang === "en"
                  ? "Grand ceremony (preview)"
                  : "大奖仪式转盘 · 预览"
              }
              subtitle={
                lang === "en"
                  ? "Demo only · not a real draw"
                  : "仅演示仪式 · 非真实开奖"
              }
              ctaLabel={
                lang === "en" ? "Spin ceremony" : "转动仪式转盘"
              }
              spinningLabel={
                lang === "en" ? "Building suspense…" : "悬念升温中…"
              }
              doneLabel={
                lang === "en"
                  ? "Preview only — real winners when pool unlocks"
                  : "预览而已 · 奖池解锁后才会真实开奖"
              }
              allowReplay
              onSpin={async () => {
                // 预览：按当前进度加权，进度高的奖更易落到
                const weights = sorted.map((c) =>
                  Math.max(1, c.progress || 1)
                );
                const total = weights.reduce((a, b) => a + b, 0);
                let r = Math.random() * total;
                let pick = sorted[0];
                for (let i = 0; i < sorted.length; i++) {
                  r -= weights[i];
                  if (r <= 0) {
                    pick = sorted[i];
                    break;
                  }
                }
                return {
                  name: pick.prizeName,
                  icon: pick.prizeIcon || "🏆",
                  label: pick.prizeName,
                  segmentId: pick.prizeKey || pick.prizeName,
                };
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * 仪式感幸运转盘：分段标签 + 指针 + 缓出落点 + 中奖光晕。
 * 仅做视觉与动效；结果由外部 onSpin 决定。
 */
import { useMemo, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

export type WheelSegment = {
  id: string;
  label: string;
  icon?: string;
  /** 用于匹配中奖落点 */
  matchValueSgd?: string;
  matchName?: string;
  tone?: "amber" | "rose" | "violet" | "emerald" | "sky";
};

type Props = {
  lang: "zh" | "en";
  segments: WheelSegment[];
  /** 外圈主题：即时小奖 amber · 大奖 violet/rose */
  theme?: "instant" | "grand";
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  spinningLabel?: string;
  doneLabel?: string;
  disabled?: boolean;
  className?: string;
  /**
   * 点击旋转：返回中奖 segment id（或 null）。
   * 组件会根据 id / value / name 对齐落点。
   */
  onSpin: () => Promise<{
    segmentId?: string;
    valueSgd?: string;
    name?: string;
    icon?: string;
    label?: string;
  } | null>;
  onRevealed?: (result: {
    segmentId?: string;
    valueSgd?: string;
    name?: string;
    icon?: string;
    label?: string;
  }) => void;
  /** 中奖后仍可再转（仪式预览用） */
  allowReplay?: boolean;
};

const TONE_STOPS: Record<NonNullable<WheelSegment["tone"]>, [string, string]> = {
  amber: ["#fbbf24", "#f59e0b"],
  rose: ["#fb7185", "#e11d48"],
  violet: ["#a78bfa", "#7c3aed"],
  emerald: ["#34d399", "#059669"],
  sky: ["#38bdf8", "#0284c8"],
};

const THEME = {
  instant: {
    ring: "from-amber-300 via-yellow-400 to-orange-500",
    glow: "shadow-[0_0_40px_rgba(251,191,36,0.45)]",
    pointer: "text-amber-500",
    hub: "from-amber-50 to-orange-100 dark:from-amber-950 dark:to-orange-950",
    btn: "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-lg shadow-amber-500/30",
  },
  grand: {
    ring: "from-violet-400 via-fuchsia-400 to-rose-500",
    glow: "shadow-[0_0_48px_rgba(167,139,250,0.4)]",
    pointer: "text-violet-500",
    hub: "from-violet-50 to-fuchsia-100 dark:from-violet-950 dark:to-fuchsia-950",
    btn: "bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg shadow-violet-500/30",
  },
} as const;

function buildConic(segments: WheelSegment[]): string {
  if (segments.length === 0) return "#fbbf24";
  const n = segments.length;
  const slice = 360 / n;
  const parts: string[] = [];
  segments.forEach((seg, i) => {
    const tone = seg.tone || (i % 2 === 0 ? "amber" : "rose");
    const [a, b] = TONE_STOPS[tone];
    const start = i * slice;
    const mid = start + slice / 2;
    const end = start + slice;
    parts.push(`${a} ${start}deg ${mid}deg`, `${b} ${mid}deg ${end}deg`);
  });
  return `conic-gradient(from -90deg, ${parts.join(", ")})`;
}

function findIndex(
  segments: WheelSegment[],
  result: {
    segmentId?: string;
    valueSgd?: string;
    name?: string;
  }
): number {
  if (!segments.length) return 0;
  if (result.segmentId) {
    const i = segments.findIndex((s) => s.id === result.segmentId);
    if (i >= 0) return i;
  }
  if (result.valueSgd) {
    const v = Number(result.valueSgd);
    if (Number.isFinite(v)) {
      const i = segments.findIndex((s) => {
        if (s.matchValueSgd == null) return false;
        return Math.abs(Number(s.matchValueSgd) - v) < 0.001;
      });
      if (i >= 0) return i;
    }
  }
  if (result.name) {
    const name = result.name;
    // 从「S$1 代金券」解析金额再对齐扇区
    const money = name.match(/S?\$?\s*(\d+(?:\.\d+)?)/i);
    if (money) {
      const v = Number(money[1]);
      const i = segments.findIndex((s) => {
        if (s.matchValueSgd == null) return false;
        return Math.abs(Number(s.matchValueSgd) - v) < 0.001;
      });
      if (i >= 0) return i;
    }
    const i = segments.findIndex(
      (s) =>
        s.matchName === name ||
        s.label === name ||
        s.label.includes(name) ||
        name.includes(s.label)
    );
    if (i >= 0) return i;
  }
  return Math.floor(Math.random() * segments.length);
}

export function LuckyWheel({
  lang,
  segments,
  theme = "instant",
  title,
  subtitle,
  ctaLabel,
  spinningLabel,
  doneLabel,
  disabled,
  className,
  onSpin,
  onRevealed,
  allowReplay = false,
}: Props) {
  const [phase, setPhase] = useState<"idle" | "spinning" | "done">("idle");
  const [rotation, setRotation] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [prize, setPrize] = useState<{
    label: string;
    icon?: string;
    valueSgd?: string;
  } | null>(null);
  const [burst, setBurst] = useState(false);

  const skin = THEME[theme];
  const segs = segments.length > 0 ? segments : [{ id: "empty", label: "🎁" }];
  const conic = useMemo(() => buildConic(segs), [segs]);
  const slice = 360 / segs.length;

  async function handleSpin() {
    if (phase === "spinning" || busy || disabled) return;
    if (phase === "done" && !allowReplay) return;
    setBusy(true);
    setErr("");
    setPhase("spinning");
    setBurst(false);
    setPrize(null);

    try {
      const result = await onSpin();
      if (!result) {
        setErr(lang === "en" ? "No prize this time" : "暂无奖品");
        setPhase("idle");
        setBusy(false);
        return;
      }

      const idx = findIndex(segs, result);
      // 指针在顶部 (-90° 起始)：把中奖扇区中心旋到顶部
      const centerAngle = idx * slice + slice / 2;
      const extraTurns = 5 + Math.floor(Math.random() * 2);
      const target =
        rotation +
        extraTurns * 360 +
        (360 - centerAngle) -
        (rotation % 360);

      setRotation(target);

      await new Promise((r) => setTimeout(r, 4200));

      const label =
        result.label ||
        result.name ||
        segs[idx]?.label ||
        (lang === "en" ? "Prize" : "奖品");
      setPrize({
        label,
        icon: result.icon || segs[idx]?.icon,
        valueSgd: result.valueSgd,
      });
      setPhase("done");
      setBurst(true);
      onRevealed?.({
        segmentId: segs[idx]?.id,
        valueSgd: result.valueSgd,
        name: result.name || label,
        icon: result.icon || segs[idx]?.icon,
        label,
      });
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : lang === "en"
            ? "Spin failed"
            : "抽奖失败"
      );
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border/80 bg-card p-5 text-center",
        skin.glow,
        className
      )}
    >
      {/* ambient glow */}
      <div
        className={cn(
          "pointer-events-none absolute -top-16 left-1/2 h-40 w-56 -translate-x-1/2 rounded-full opacity-40 blur-3xl",
          theme === "instant" ? "bg-amber-400" : "bg-violet-500"
        )}
      />

      {(title || subtitle) && (
        <div className="relative mb-4">
          {title && (
            <h3 className="text-base font-bold tracking-tight text-foreground text-balance">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
      )}

      {/* wheel stage */}
      <div className="relative mx-auto mb-4 h-[220px] w-[220px]">
        {/* outer decorative ring */}
        <div
          className={cn(
            "absolute inset-0 rounded-full bg-gradient-to-br p-[3px]",
            skin.ring
          )}
        >
          <div className="h-full w-full rounded-full bg-card" />
        </div>

        {/* spinning disc */}
        <div
          className="absolute inset-[10px] rounded-full"
          style={{
            background: conic,
            transform: `rotate(${rotation}deg)`,
            transition:
              phase === "spinning"
                ? "transform 4.2s cubic-bezier(0.12, 0.85, 0.08, 1)"
                : "none",
            boxShadow:
              "inset 0 0 0 2px rgba(255,255,255,0.35), 0 8px 24px rgba(0,0,0,0.12)",
          }}
        >
          {/* segment labels */}
          {segs.map((seg, i) => {
            const angle = i * slice + slice / 2;
            return (
              <div
                key={seg.id}
                className="absolute left-1/2 top-1/2 h-0 w-0"
                style={{
                  transform: `rotate(${angle}deg)`,
                }}
              >
                <div
                  className="flex w-[88px] -translate-x-1/2 -translate-y-[86px] flex-col items-center gap-0.5"
                  style={{ transform: "rotate(0deg)" }}
                >
                  <span className="text-[13px] drop-shadow-sm leading-none">
                    {seg.icon || "🎁"}
                  </span>
                  <span className="max-w-[72px] truncate text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]">
                    {seg.label}
                  </span>
                </div>
              </div>
            );
          })}

          {/* hub */}
          <div
            className={cn(
              "absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-b shadow-md ring-2 ring-white/70",
              skin.hub
            )}
          >
            <span className="text-lg">
              {theme === "instant" ? "✨" : "🏆"}
            </span>
          </div>
        </div>

        {/* pointer */}
        <div
          className={cn(
            "absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-0.5",
            skin.pointer
          )}
        >
          <div className="relative">
            <div
              className="h-0 w-0 border-l-[10px] border-r-[10px] border-t-[18px] border-l-transparent border-r-transparent drop-shadow-md"
              style={{ borderTopColor: "currentColor" }}
            />
            <div className="absolute left-1/2 top-[14px] h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-white ring-2 ring-current" />
          </div>
        </div>

        {/* confetti burst */}
        {burst && (
          <div className="pointer-events-none absolute inset-0 z-30 overflow-visible">
            {Array.from({ length: 12 }).map((_, i) => {
              const rad = (i / 12) * Math.PI * 2;
              const tx = Math.cos(rad) * 72;
              const ty = Math.sin(rad) * 72 - 12;
              return (
                <span
                  key={i}
                  className="lucky-confetti absolute left-1/2 top-1/2 h-2 w-2 rounded-sm"
                  style={
                    {
                      "--tx": `${tx}px`,
                      "--ty": `${ty}px`,
                      background:
                        i % 3 === 0
                          ? "#fbbf24"
                          : i % 3 === 1
                            ? "#f472b6"
                            : "#a78bfa",
                    } as CSSProperties
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      {phase === "done" && prize && (
        <div className="relative mb-4 animate-in zoom-in-95 fade-in duration-500">
          <div className="mx-auto max-w-[260px] rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50 to-card px-4 py-3 dark:border-emerald-800/50 dark:from-emerald-950/50">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700/80 dark:text-emerald-300/80">
              {lang === "en" ? "You won" : "恭喜中奖"}
            </p>
            <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-300">
              {prize.icon ? `${prize.icon} ` : ""}
              {prize.label}
            </p>
            {prize.valueSgd && (
              <p className="mt-0.5 text-sm font-semibold nums text-emerald-600 dark:text-emerald-400">
                +S${prize.valueSgd}
              </p>
            )}
            {doneLabel && (
              <p className="mt-1 text-[11px] text-muted-foreground">{doneLabel}</p>
            )}
          </div>
        </div>
      )}

      {err && <p className="mb-2 text-xs text-red-500">{err}</p>}

      {(phase !== "done" || allowReplay) && (
        <Button
          type="button"
          className={cn(
            "h-12 w-full rounded-full text-[15px] font-bold active:scale-[0.97] transition-transform",
            skin.btn
          )}
          loading={busy || phase === "spinning"}
          disabled={disabled || busy}
          onClick={handleSpin}
        >
          {phase === "spinning"
            ? spinningLabel ||
              (lang === "en" ? "Spinning…" : "幸运转动中…")
            : phase === "done" && allowReplay
              ? lang === "en"
                ? "Spin again"
                : "再转一次"
              : ctaLabel ||
                (lang === "en" ? "Spin the wheel" : "转动幸运转盘")}
        </Button>
      )}
    </div>
  );
}

"use client";

/**
 * 购券后「点一下赢余额」：
 * - 服务端购券时往往已抽好即时奖；此处点按后播放转盘再揭示（体感 commit）
 * - 若尚未有奖，可走 onClaim 再请求服务端
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

export type WinPrize = {
  name: string;
  icon?: string;
  valueSgd?: string;
};

type Props = {
  lang: "zh" | "en";
  /** 已抽好的奖（购券返回）；无则点按后调 onClaim */
  prize: WinPrize | null;
  onClaim?: () => Promise<WinPrize | null>;
  /** 揭示后回调（刷新余额文案等） */
  onRevealed?: (prize: WinPrize) => void;
  className?: string;
};

const SPIN_SEGMENTS = ["💰", "💵", "🎫", "🎁", "✨", "🏆", "💎", "⭐"];

export function WinBalanceWheel({
  lang,
  prize: initialPrize,
  onClaim,
  onRevealed,
  className,
}: Props) {
  const [phase, setPhase] = useState<"idle" | "spinning" | "done">(
    initialPrize ? "idle" : "idle"
  );
  const [prize, setPrize] = useState<WinPrize | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [spinDeg, setSpinDeg] = useState(0);

  async function handleSpin() {
    if (phase === "spinning" || phase === "done" || busy) return;
    setBusy(true);
    setErr("");
    setPhase("spinning");
    const extra = 360 * 4 + Math.floor(Math.random() * 360);
    setSpinDeg((d) => d + extra);

    let resolved = initialPrize;
    try {
      if (!resolved && onClaim) {
        resolved = await onClaim();
      }
      // 转盘动画时长
      await new Promise((r) => setTimeout(r, 2200));
      if (!resolved) {
        setErr(lang === "en" ? "No prize this time" : "暂无即时奖");
        setPhase("idle");
        setBusy(false);
        return;
      }
      setPrize(resolved);
      setPhase("done");
      onRevealed?.(resolved);
    } catch (e) {
      setErr(e instanceof Error ? e.message : lang === "en" ? "Failed" : "失败");
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-amber-200/80 bg-gradient-to-b from-amber-50 to-card dark:from-amber-950/40 dark:to-card dark:border-amber-800/50 p-4 text-center",
        className
      )}
    >
      <p className="text-sm font-semibold text-foreground">
        {lang === "en" ? "Win balance" : "赢余额"}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">
        {phase === "done"
          ? lang === "en"
            ? "Added to your spendable balance"
            : "已加入可花余额"
          : lang === "en"
            ? "Tap to spin — prize commits when you spin"
            : "点一下转盘 · 转完即揭晓即时奖"}
      </p>

      <div className="relative mx-auto h-36 w-36 mb-3">
        <div
          className="absolute inset-0 rounded-full border-4 border-amber-400/60 shadow-inner overflow-hidden transition-transform duration-[2200ms] ease-out"
          style={{
            transform: `rotate(${spinDeg}deg)`,
            background:
              "conic-gradient(from 0deg,#fbbf24,#f59e0b,#fcd34d,#fbbf24,#f59e0b,#fcd34d,#fbbf24,#f59e0b)",
          }}
        >
          <div className="absolute inset-2 rounded-full bg-card/95 flex items-center justify-center">
            <div className="grid grid-cols-4 gap-0.5 p-2 opacity-80">
              {SPIN_SEGMENTS.map((s) => (
                <span key={s} className="text-sm">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-10 text-amber-600 text-lg leading-none">
          ▼
        </div>
      </div>

      {phase === "done" && prize && (
        <div className="mb-3 animate-in zoom-in duration-300">
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {prize.icon || "🎉"} {prize.name}
          </p>
          {prize.valueSgd && (
            <p className="text-xs text-muted-foreground mt-1">
              +S${prize.valueSgd}
            </p>
          )}
        </div>
      )}

      {err && (
        <p className="text-xs text-red-500 mb-2">{err}</p>
      )}

      {phase !== "done" && (
        <Button
          type="button"
          className="w-full rounded-full h-11 font-semibold"
          loading={busy || phase === "spinning"}
          onClick={handleSpin}
        >
          {phase === "spinning"
            ? lang === "en"
              ? "Spinning…"
              : "转动中…"
            : lang === "en"
              ? "Tap to win balance"
              : "点一下赢余额"}
        </Button>
      )}
    </div>
  );
}

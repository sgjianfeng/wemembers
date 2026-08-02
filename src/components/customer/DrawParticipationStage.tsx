"use client";

/**
 * 已参与用户的「抽奖台」：待转即时小奖 + 大奖权重 + 仪式舞台。
 * 未参与时隐藏或展示轻引导。
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Ticket, Dices, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { WinBalanceWheel } from "@/components/customer/WinBalanceWheel";
import {
  GrandPrizeArena,
} from "@/components/customer/GrandPrizeArena";
import type { CountdownItem } from "@/components/customer/PoolDashboard";

export type DrawStatusData = {
  loggedIn: boolean;
  hasEntries: boolean;
  isDraw?: boolean;
  entryCount: number;
  totalWeight: number;
  balanceTotalSgd: string;
  pendingInstant: Array<{
    voucherId: string;
    faceSgd: number;
    balanceSgd: string;
    shortCode: string | null;
    tier: string;
    drawWeight: number;
    instantCapSgd: number;
  }>;
  claimedInstant: Array<{
    voucherId: string;
    name: string;
    icon: string;
    valueSgd: string;
    at: string;
  }>;
};

type Props = {
  slug: string;
  lang: "zh" | "en";
  countdowns: CountdownItem[];
  instantPoolSgd?: string;
  dailyAvgVelocity?: number;
  className?: string;
  /** 锚点 id，默认 my-draw-stage */
  stageId?: string;
  onScrollToBuy?: () => void;
};

export function DrawParticipationStage({
  slug,
  lang,
  countdowns,
  instantPoolSgd,
  dailyAvgVelocity,
  className,
  stageId = "my-draw-stage",
  onScrollToBuy,
}: Props) {
  const [status, setStatus] = useState<DrawStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePendingIdx, setActivePendingIdx] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/voucher/my-draw-status?slug=${encodeURIComponent(slug)}`,
        { credentials: "same-origin" }
      );
      const j = await res.json();
      if (j.data) setStatus(j.data as DrawStatusData);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div
        id={stageId}
        className={cn(
          "scroll-mt-20 rounded-3xl border border-border bg-card/80 p-5 text-center text-sm text-muted-foreground",
          className
        )}
      >
        {lang === "en" ? "Loading your draws…" : "加载你的抽奖资格…"}
      </div>
    );
  }

  // 未登录：轻量引导卡
  if (!status?.loggedIn) {
    return (
      <div
        id={stageId}
        className={cn(
          "scroll-mt-20 overflow-hidden rounded-3xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-card to-violet-50 p-4 dark:border-amber-900/40 dark:from-amber-950/30 dark:to-violet-950/30",
          className
        )}
      >
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            <Dices size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">
              {lang === "en"
                ? "Your draw stage is here"
                : "这里是你的抽奖台"}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              {lang === "en"
                ? "Log in after purchase to spin instant prizes and track grand-prize weight."
                : "购券登录后，可在此转动即时小奖转盘，并查看大奖权重与倒计时。"}
            </p>
            <Link
              href={`/auth/login?next=${encodeURIComponent(`/voucher/${slug}#my-draw-stage`)}`}
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-primary"
            >
              {lang === "en" ? "Log in" : "去登录"}
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const pending = status.pendingInstant || [];
  const active = pending[activePendingIdx] || pending[0];
  const hasEntries = status.hasEntries;

  return (
    <div id={stageId} className={cn("scroll-mt-20 space-y-3", className)}>
      {/* Summary strip — 与上方 Hero 留出呼吸感 */}
      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm mt-1">
        <div className="bg-gradient-to-r from-amber-500/15 via-orange-400/10 to-violet-500/15 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 text-amber-700 shadow-sm dark:bg-black/30 dark:text-amber-300">
                <Ticket size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">
                  {lang === "en" ? "My draw stage" : "我的抽奖台"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {hasEntries
                    ? lang === "en"
                      ? `${status.entryCount} ticket(s) · weight ${status.totalWeight.toLocaleString()}`
                      : `${status.entryCount} 张参与 · 权重 ${status.totalWeight.toLocaleString()}`
                    : lang === "en"
                      ? "No tickets yet — buy below to enter"
                      : "暂无参与券 · 下方购券即可入局"}
                </p>
              </div>
            </div>
            {pending.length > 0 && (
              <span className="shrink-0 rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm animate-pulse">
                {lang === "en"
                  ? `${pending.length} spin${pending.length > 1 ? "s" : ""}`
                  : `${pending.length} 次待抽`}
              </span>
            )}
          </div>
        </div>

        {hasEntries && (
          <div className="grid grid-cols-3 gap-px border-t border-border bg-border">
            <div className="bg-card px-3 py-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">
                {lang === "en" ? "Pending spins" : "待转小奖"}
              </p>
              <p className="text-base font-bold nums text-amber-600 dark:text-amber-400">
                {pending.length}
              </p>
            </div>
            <div className="bg-card px-3 py-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">
                {lang === "en" ? "Grand weight" : "大奖权重"}
              </p>
              <p className="text-base font-bold nums text-violet-600 dark:text-violet-400">
                {status.totalWeight.toLocaleString()}
              </p>
            </div>
            <div className="bg-card px-3 py-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">
                {lang === "en" ? "Balance" : "可花余额"}
              </p>
              <p className="text-base font-bold nums text-emerald-600 dark:text-emerald-400">
                S${status.balanceTotalSgd}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── 即时小奖区：有待转显示转盘；无待转仍常驻说明，避免「小奖不在这」 ── */}
      {hasEntries && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <p className="text-sm font-semibold text-foreground">
              {lang === "en" ? "Instant small prize" : "即时小奖"}
            </p>
            <span className="text-[11px] text-muted-foreground">
              {pending.length > 0
                ? lang === "en"
                  ? `${pending.length} spin(s) left`
                  : `待转 ${pending.length} 次`
                : lang === "en"
                  ? "All spun · buy for more"
                  : "已抽完 · 再买可再转"}
            </span>
          </div>
          <p className="px-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {lang === "en"
              ? "One spin per draw voucher after purchase · 100% win · adds to spendable balance. Separate from grand prize weight below."
              : "每张抽奖券购后可转 1 次小奖 · 100% 中 · 加进可花余额。与下方延迟大奖权重是两套玩法。"}
          </p>

          {active ? (
            <div className="space-y-2">
              {pending.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {pending.map((p, i) => (
                    <button
                      key={p.voucherId}
                      type="button"
                      onClick={() => setActivePendingIdx(i)}
                      className={cn(
                        "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors",
                        i === activePendingIdx
                          ? "bg-amber-500 text-white shadow-sm"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {lang === "en"
                        ? `Ticket S$${p.faceSgd}`
                        : `券 S$${p.faceSgd}`}
                      {p.shortCode ? ` · ${p.shortCode}` : ""}
                    </button>
                  ))}
                </div>
              )}
              <WinBalanceWheel
                key={active.voucherId}
                lang={lang}
                prize={null}
                instantCapSgd={active.instantCapSgd}
                onClaim={async () => {
                  const res = await fetch("/api/voucher/claim-instant", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ voucherId: active.voucherId }),
                  });
                  const j = await res.json();
                  if (!res.ok) throw new Error(j.error || "claim failed");
                  const p = j.data?.instantPrize;
                  if (!p) return null;
                  return {
                    name: p.name,
                    icon: p.icon,
                    valueSgd: p.valueSgd,
                  };
                }}
                onRevealed={() => {
                  void refresh();
                }}
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-b from-amber-50/90 to-card px-4 py-4 dark:border-amber-900/40 dark:from-amber-950/30">
              <p className="text-sm font-semibold text-foreground">
                {lang === "en"
                  ? "No pending instant spins"
                  : "暂无待转小奖"}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                {status.claimedInstant.length > 0
                  ? lang === "en"
                    ? "You’ve already claimed instant prizes on your tickets. Buy another draw voucher to get a new spin here."
                    : "本活动下的参与券已抽过即时小奖。再买一档抽奖券，新的转盘会出现在这里。"
                  : lang === "en"
                    ? "After you buy a draw voucher, the wheel appears here for one spin."
                    : "购券后，小奖转盘会出现在这里，每张券可转一次。"}
              </p>
              {status.claimedInstant.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                    {lang === "en" ? "Your wins" : "你已中的小奖"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {status.claimedInstant.slice(0, 6).map((c) => (
                      <span
                        key={c.voucherId}
                        className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-[11px] font-medium ring-1 ring-emerald-200/80 dark:ring-emerald-800/50"
                      >
                        <span>{c.icon}</span>
                        <span>{c.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                className="mt-3 h-10 w-full rounded-full border-amber-300 font-semibold text-amber-900 dark:border-amber-700 dark:text-amber-100"
                onClick={() => {
                  onScrollToBuy?.();
                  document
                    .getElementById("buy-voucher")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {lang === "en"
                  ? "Buy another · get a spin"
                  : "再买一档 · 再转小奖"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── 延迟大奖区 ── */}
      {hasEntries && (
        <div className="flex items-center justify-between gap-2 px-0.5 pt-1">
          <p className="text-sm font-semibold text-foreground">
            {lang === "en" ? "Deferred grand prizes" : "延迟大奖"}
          </p>
          <span className="text-[11px] text-muted-foreground">
            {lang === "en" ? "Weight · unlock later" : "权重累计 · 达标再开"}
          </span>
        </div>
      )}

      <GrandPrizeArena
        lang={lang}
        countdowns={countdowns}
        instantPoolSgd={instantPoolSgd}
        dailyAvgVelocity={dailyAvgVelocity}
        myWeight={status.totalWeight}
        entryCount={status.entryCount}
        showCeremonyPreview
      />

      {!hasEntries && (
        <Button
          type="button"
          className="h-11 w-full rounded-full font-semibold"
          onClick={() => {
            onScrollToBuy?.();
            document
              .getElementById("buy-voucher")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          {lang === "en" ? "Buy voucher to draw" : "购券参与抽奖"}
        </Button>
      )}
    </div>
  );
}

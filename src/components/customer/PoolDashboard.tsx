"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { PoolCountdown } from "@/lib/draw-v2";

interface PoolDashboardProps {
  slug: string;
}

interface PoolStatusData {
  campaign: {
    id: string;
    slug: string;
    name: string;
    status: string;
    voucherCount: number;
  };
  pool: {
    totalCents: number;
    totalSgd: string;
    instantPool: { cents: number; sgd: string; ratio: number };
    midPool: { cents: number; sgd: string; ratio: number };
    grandPool: { cents: number; sgd: string; ratio: number };
  };
  draws: Record<string, { total: number; won: number }>;
  velocity: {
    dailyAvgCents: number;
    dailyAvgSgd: string;
    lastUpdated: string | null;
  };
  countdown: PoolCountdown[];
}

type LoadState = "loading" | "error" | "empty" | "loaded";

function formatCents(cents: number): string {
  return `S$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PoolProgressBar({ current, target, label }: { current: number; target: number; label: string }) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span>{pct.toFixed(1)}%</span>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const PRIZE_ICONS: Record<string, string> = {
  iPhone: "📱",
  MacBook: "💻",
  BYD: "🚗",
};

function CountdownCard({ item }: { item: PoolCountdown }) {
  const days = item.daysPredicted;
  const displayDays =
    days <= 0 ? "今日开奖" : days === 1 ? "预计明天" : `预计 ${days} 天`;
  const speedLabel = item.accelerating ? "加速中 ↑" : "持稳";
  const icon = PRIZE_ICONS[item.prizeName] || "🎁";

  return (
    <Card className="border-slate-100 overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <span className="text-sm font-semibold text-slate-900">{item.prizeName}</span>
          </div>
          <Badge variant={item.accelerating ? "green" : "slate"} size="sm">
            {speedLabel}
          </Badge>
        </div>

        <PoolProgressBar
          current={item.currentCents}
          target={item.targetCents}
          label={formatCents(item.targetCents)}
        />

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">
            已筹 <b className="text-slate-700">{formatCents(item.currentCents)}</b>
          </span>
          <span className="text-slate-500">
            剩余 <b className="text-slate-700">{formatCents(item.targetCents - item.currentCents)}</b>
          </span>
        </div>

        <div className="pt-1 border-t border-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            日均 {formatCents(item.velocityPerDay)}
          </span>
          <span
            className={`text-sm font-bold ${
              days <= 0 ? "text-green-600" : days <= 3 ? "text-amber-600" : "text-blue-600"
            }`}
          >
            {displayDays}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function PoolDashboard({ slug }: PoolDashboardProps) {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<PoolStatusData | null>(null);

  const fetchPool = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch(`/api/campaign/pool-status?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) {
        if (res.status === 404) { setState("empty"); return; }
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      const payload: PoolStatusData = json.data;
      if (!payload) { setState("empty"); return; }
      setData(payload);
      setState("loaded");
    } catch {
      setState("error");
    }
  }, [slug]);

  useEffect(() => { fetchPool(); }, [fetchPool]);

  if (state === "loading") {
    return (
      <Card>
        <CardContent className="p-5 text-center text-sm text-slate-400">
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-slate-100 rounded w-1/2 mx-auto" />
            <div className="h-8 bg-slate-100 rounded w-3/4 mx-auto" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state === "error") {
    return (
      <Card>
        <CardContent className="p-5 text-center">
          <p className="text-sm text-red-500 mb-2">奖池加载失败</p>
          <button
            onClick={fetchPool}
            className="text-xs text-blue-500 underline hover:no-underline"
          >
            点击重试
          </button>
        </CardContent>
      </Card>
    );
  }

  if (state === "empty" || !data) {
    return (
      <Card>
        <CardContent className="p-5 text-center text-sm text-slate-400">
          暂无奖池数据
        </CardContent>
      </Card>
    );
  }

  const { campaign, pool, draws, countdown } = data;

  return (
    <div className="space-y-4">
      {/* Campaign header */}
      <Card>
        <CardContent className="p-4 space-y-1">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">{campaign.name}</h3>
            <Badge variant={campaign.status === "active" ? "green" : "slate"} size="sm">
              {campaign.status === "active" ? "进行中" : campaign.status}
            </Badge>
          </div>
          <p className="text-xs text-slate-400">
            {campaign.voucherCount} 张券 · 总奖池 {pool.totalSgd}
          </p>
        </CardContent>
      </Card>

      {/* Pool allocation summary */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <h4 className="text-sm font-semibold text-slate-800">奖池分配</h4>
          <PoolProgressBar current={pool.instantPool.cents} target={pool.totalCents} label={`即时奖池 ${pool.instantPool.sgd}`} />
          <PoolProgressBar current={pool.midPool.cents} target={pool.totalCents} label={`中级奖池 ${pool.midPool.sgd}`} />
          <PoolProgressBar current={pool.grandPool.cents} target={pool.totalCents} label={`大奖池 ${pool.grandPool.sgd}`} />
          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span>即时 {pool.instantPool.ratio}%</span>
            <span>中级 {pool.midPool.ratio}%</span>
            <span>大奖 {pool.grandPool.ratio}%</span>
          </div>
        </CardContent>
      </Card>

      {/* Draw stats */}
      {Object.keys(draws).length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-1">
            <h4 className="text-sm font-semibold text-slate-800 mb-1">抽奖统计</h4>
            {Object.entries(draws).map(([type, info]) => (
              <div key={type} className="flex items-center justify-between text-xs text-slate-600">
                <span className="capitalize">{type === "grand" ? "大奖" : type === "mid" ? "中级" : "即时"}</span>
                <span>
                  <b className="text-slate-800">{info.won}</b> / {info.total} 次中奖
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Grand prize countdown */}
      {countdown && countdown.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-800 px-0.5">大奖进度</h4>
          <div className="space-y-2">
            {countdown.map((item) => (
              <CountdownCard key={item.prizeName} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

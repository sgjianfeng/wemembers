"use client";

import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

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
  dailyAvgVelocity: number;
}

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

function CountdownCard({ item }: { item: CountdownItem }) {
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

export function PoolDashboard({ countdowns, instantPoolSgd, dailyAvgVelocity }: PoolDashboardProps) {
  if (!countdowns || countdowns.length === 0) {
    return (
      <Card>
        <CardContent className="p-5 text-center text-sm text-slate-400">
          暂无奖池数据
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Instant pool summary */}
      <Card>
        <CardContent className="p-4 space-y-1">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">奖池进度</h3>
            <Badge variant="green" size="sm">进行中</Badge>
          </div>
          <p className="text-xs text-slate-400">
            即时奖池 S${instantPoolSgd} · 日均 {dailyAvgVelocity > 0 ? formatCents(dailyAvgVelocity) : "--"}
          </p>
        </CardContent>
      </Card>

      {/* Grand prize countdown */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-slate-800 px-0.5">大奖进度</h4>
        <div className="space-y-2">
          {countdowns.map((item) => (
            <CountdownCard key={item.prizeName} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

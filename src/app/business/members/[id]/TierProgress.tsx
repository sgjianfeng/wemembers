import { getNextTier } from "@/lib/points";

interface TierConfig {
  tier: string;
  name: string;
  pointsRequired: number;
  color: string;
  benefits: string;
}

export function TierProgress({
  points,
  tierConfigs,
}: {
  points: number;
  tierConfigs: TierConfig[];
}) {
  const next = getNextTier(points, tierConfigs);

  if (!next) {
    return (
      <div className="mt-3 pt-3 border-t border-slate-50">
        <div className="flex items-center gap-2">
          <span className="text-sm">💎</span>
          <p className="text-xs text-slate-500">已达到最高等级</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-50">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-slate-500">
          距{next.name}还差 {next.pointsNeeded} 积分
        </span>
        <span className="text-[10px] text-slate-400">{next.progress}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#1A6EFF] to-[#3B82F6] rounded-full transition-all"
          style={{ width: `${next.progress}%` }}
        />
      </div>
    </div>
  );
}

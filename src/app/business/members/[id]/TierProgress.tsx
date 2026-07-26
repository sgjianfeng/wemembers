import { getNextTier } from "@/lib/points";
import { Gem } from "lucide-react";

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
      <div className="mt-3 pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          <Gem size={14} className="text-muted-foreground" />
          <p className="text-xs text-muted-foreground">已达到最高等级</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted-foreground">
          距{next.name}还差 {next.pointsNeeded} 积分
        </span>
        <span className="text-[10px] text-muted-foreground nums">{next.progress}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all"
          style={{ width: `${next.progress}%` }}
        />
      </div>
    </div>
  );
}

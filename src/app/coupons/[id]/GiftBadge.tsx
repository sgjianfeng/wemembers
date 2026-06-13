import { Card, CardContent } from "@/components/ui/Card";

export function GiftBadge({ type, data }: { type: string; data: string }) {
  let config: any = {};
  try { config = JSON.parse(data); } catch {}

  if (type === "item") {
    return (
      <Card className="border-pink-200 bg-gradient-to-r from-pink-50 to-rose-50">
        <CardContent className="p-3 flex items-center gap-3">
          <span className="text-2xl">{config.icon || "🎁"}</span>
          <div>
            <p className="text-sm font-semibold text-pink-700">领券赠好礼</p>
            <p className="text-xs text-pink-600">领取此券额外获得「{config.name || "惊喜礼品"}」</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (type === "lottery") {
    const prizes = config.prizes || [];
    return (
      <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-violet-50">
        <CardContent className="p-3">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">🎰</span>
            <div>
              <p className="text-sm font-semibold text-purple-700">领券抽大奖</p>
              <p className="text-xs text-purple-600">每领一张券即可抽奖一次</p>
            </div>
          </div>
          {prizes.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {prizes.map((p: any, i: number) => (
                <span key={i} className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded-full">
                  {p.icon || "🎁"} {p.name}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (type === "points") {
    return (
      <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50">
        <CardContent className="p-3 flex items-center gap-3">
          <span className="text-2xl">⭐</span>
          <div>
            <p className="text-sm font-semibold text-amber-700">领取即送积分</p>
            <p className="text-xs text-amber-600">额外获得 +{config.points || 0} 积分</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}

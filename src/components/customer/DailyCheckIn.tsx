"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/Card";

export function DailyCheckIn() {
  const [status, setStatus] = useState<"loading" | "checked" | "ready" | "done">("loading");
  const [streak, setStreak] = useState(0);
  const [reward, setReward] = useState(0);
  const [animating, setAnimating] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/game/checkin");
      const data = await res.json();
      const info = data.data;
      setStreak(info.streak || 0);
      setStatus(info.checkedToday ? "checked" : "ready");
    } catch { setStatus("ready"); }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  async function handleCheckIn() {
    setAnimating(true);
    try {
      const res = await fetch("/api/game/checkin", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setStreak(data.data.streak);
        setReward(data.data.reward);
        setStatus("done");
      }
    } catch {}
    setAnimating(false);
  }

  // 庆祝动画只有 2 秒
  if (status === "done") {
    setTimeout(() => setStatus("checked"), 2500);
  }

  const streakIcons: Record<number, string> = { 3: "🔥", 7: "🌟", 15: "💎", 30: "👑" };

  return (
    <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-100">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {status === "done" ? "🎉" : status === "checked" ? "✅" : (streak >= 3 ? streakIcons[streak] || "🔥" : "📅")}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {status === "done"
                  ? `+${reward}⭐ 签到成功!`
                  : status === "checked"
                  ? `已签到 · 连续 ${streak} 天`
                  : "每日签到"}
              </p>
              <p className="text-xs text-slate-500">
                {streak >= 3
                  ? `已连续 ${streak} 天${streak >= 7 ? " 🎉" : ""}`
                  : "签到领积分，连续有惊喜"}
              </p>
            </div>
          </div>

          <button
            onClick={handleCheckIn}
            disabled={status === "checked" || status === "done" || animating}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              status === "checked" || status === "done"
                ? "bg-green-100 text-green-600"
                : animating
                ? "bg-amber-200 text-amber-700 animate-pulse"
                : "bg-amber-400 text-white hover:bg-amber-500 active:scale-95"
            }`}
          >
            {status === "done" ? "🎉" : status === "checked" ? "✓" : animating ? "..." : "签到"}
          </button>
        </div>

        {/* Streak bar */}
        {streak > 0 && (
          <div className="mt-2 flex gap-0.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1 rounded-full ${i < (streak % 7 || (streak % 7 === 0 ? 7 : 0)) ? "bg-amber-400" : "bg-amber-100"}`}
              />
            ))}
            <span className="text-[10px] text-amber-600 ml-2">{streak % 7 || 7}/7天</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

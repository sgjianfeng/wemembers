"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { useLang } from "@/components/i18n/LanguageProvider";

export function DailyCheckIn() {
  const { t } = useLang();
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
    } catch {
      setStatus("ready");
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Celebrate briefly then settle to "checked"
  useEffect(() => {
    if (status !== "done") return;
    const timer = setTimeout(() => setStatus("checked"), 2500);
    return () => clearTimeout(timer);
  }, [status]);

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
    } catch {
      /* ignore */
    }
    setAnimating(false);
  }

  const streakIcons: Record<number, string> = { 3: "🔥", 7: "🌟", 15: "💎", 30: "👑" };

  return (
    <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-100">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {status === "done"
                ? "🎉"
                : status === "checked"
                ? "✅"
                : streak >= 3
                ? streakIcons[streak] || "🔥"
                : "📅"}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {status === "done"
                  ? t("home.checkin.success", { reward: String(reward) })
                  : status === "checked"
                  ? t("home.checkin.done", { streak: String(streak) })
                  : t("home.checkin.title")}
              </p>
              <p className="text-xs text-slate-500">
                {streak >= 3
                  ? t("home.checkin.streak", { streak: String(streak) })
                  : t("home.checkin.subtitle")}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCheckIn}
            disabled={status === "checked" || status === "done" || animating || status === "loading"}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              status === "checked" || status === "done"
                ? "bg-green-100 text-green-600"
                : animating
                ? "bg-amber-200 text-amber-700 animate-pulse"
                : "bg-amber-400 text-white hover:bg-amber-500 active:scale-95"
            }`}
          >
            {status === "done"
              ? "🎉"
              : status === "checked"
              ? "✓"
              : animating
              ? "..."
              : t("home.checkin.btn")}
          </button>
        </div>

        {streak > 0 && (
          <div className="mt-2 flex gap-0.5 items-center">
            {Array.from({ length: 7 }).map((_, i) => {
              const filled = i < (streak % 7 || (streak % 7 === 0 ? 7 : 0));
              return (
                <div
                  key={i}
                  className={`flex-1 h-1 rounded-full ${filled ? "bg-amber-400" : "bg-amber-100"}`}
                />
              );
            })}
            <span className="text-[10px] text-amber-600 ml-2">
              {t("home.checkin.days", { n: String(streak % 7 || 7) })}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

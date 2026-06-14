"use client";

import { useState, useEffect } from "react";

interface CountdownClockProps {
  drawDate: string;       // ISO date string
  progress: number;       // 0-100
  grandPoolSgd: string;   // "188000.00"
  totalTicketCount: number;
  minSpendSgd: number;
  startDate: string;      // ISO date string
}

export function CountdownClock({
  drawDate,
  progress,
  grandPoolSgd,
  totalTicketCount,
  minSpendSgd,
  startDate,
}: CountdownClockProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const target = new Date(drawDate).getTime();
  const remaining = target - now;

  if (remaining <= 0) {
    return (
      <div className="text-center p-2 bg-red-50 rounded-lg text-sm text-red-600 font-semibold">
        🔔 开奖时间已到！
      </div>
    );
  }

  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  // Velocity: 每秒完成度
  const elapsedDays = Math.max(1, (now - new Date(startDate).getTime()) / 86400000);
  const dailyProgress = Math.min(progress, 99) / elapsedDays; // % per day
  const daysToTarget = progress === 0 ? 999 : Math.round((100 - progress) / dailyProgress);

  // Status
  let status: { color: string; bg: string; icon: string; text: string };
  if (daysToTarget < days * 0.8) {
    status = {
      color: "text-green-600",
      bg: "bg-green-50",
      icon: "🟢",
      text: "时间充裕！最快 " + (daysToTarget === 0 ? "即将" : daysToTarget + " 天") + " 达标",
    };
  } else if (daysToTarget <= days) {
    status = {
      color: "text-amber-600",
      bg: "bg-amber-50",
      icon: "🟡",
      text: "刚好赶上！还需 " + daysToTarget + " 天",
    };
  } else {
    const needed = Math.round(
      (200000 - Number(grandPoolSgd || "0")) / Math.max(1, days)
    );
    status = {
      color: "text-red-600",
      bg: "bg-red-50",
      icon: "🔴",
      text: "可能来不及！需要 S$" + needed.toLocaleString() + "/天",
    };
  }

  return (
    <div className="space-y-2">
      {/* Countdown */}
      <div className="text-center">
        <p className="text-[10px] text-amber-400 mb-1">距离开奖</p>
        <div className="flex items-center justify-center gap-1.5">
          <Block v={days} label="天" />
          <span className="text-amber-400 font-bold text-sm">:</span>
          <Block v={hours} label="时" />
          <span className="text-amber-400 font-bold text-sm">:</span>
          <Block v={minutes} label="分" />
          <span className="text-amber-400 font-bold text-sm">:</span>
          <Block v={seconds} label="秒" />
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-amber-600">奖池 S${Number(grandPoolSgd || "0").toLocaleString()}</span>
          <span className="text-amber-600">目标 S$200,000</span>
        </div>
        <div className="h-2.5 bg-amber-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-[#FF6B35] rounded-full transition-all duration-1000"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] mt-0.5">
          <span className="text-amber-400">{progress}%</span>
          <span className="text-amber-400">{totalTicketCount.toLocaleString()} 张券</span>
        </div>
      </div>

      {/* Velocity status */}
      <div className={`text-center py-1.5 rounded-lg ${status.bg} text-[10px] ${status.color} font-medium`}>
        {status.icon} {status.text}
      </div>
    </div>
  );
}

function Block({ v, label }: { v: number; label: string }) {
  const s = String(Math.max(0, v)).padStart(2, "0");
  return (
    <div className="text-center min-w-[36px]">
      <span className="text-sm font-bold text-amber-400 tabular-nums">{s}</span>
      <p className="text-[9px] text-amber-300">{label}</p>
    </div>
  );
}

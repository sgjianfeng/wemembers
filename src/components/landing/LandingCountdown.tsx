"use client";

import { useState, useEffect } from "react";

interface LandingCountdownProps {
  endDate: string;
  drawDate?: string | null;
}

export function LandingCountdown({ endDate, drawDate }: LandingCountdownProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const target = new Date(drawDate || endDate).getTime();
  const remaining = Math.max(0, target - now);

  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  const urgent = remaining < 3600000;
  const warning = remaining < 86400000; // < 24h

  return (
    <div className={`flex items-center justify-center gap-2 ${urgent ? "animate-pulse" : ""}`}>
      <Block value={days} label="DAYS" urgent={urgent} warning={warning} />
      <Separator urgent={urgent} />
      <Block value={hours} label="HRS" urgent={urgent} warning={warning} />
      <Separator urgent={urgent} />
      <Block value={minutes} label="MIN" urgent={urgent} warning={warning} />
      <Separator urgent={urgent} />
      <Block value={seconds} label="SEC" urgent={urgent} warning={warning} />
    </div>
  );
}

function Block({ value, label, urgent, warning }: { value: number; label: string; urgent: boolean; warning: boolean }) {
  return (
    <div className="text-center">
      <div className={`
        w-[58px] h-[58px] rounded-xl flex items-center justify-center
        border-2 font-black tabular-nums tracking-tight
        transition-colors duration-300
        ${urgent
          ? "bg-red-500/20 border-red-500/40 text-red-300 text-2xl"
          : warning
          ? "bg-amber-500/15 border-amber-500/30 text-amber-300 text-2xl"
          : "bg-white/8 border-white/10 text-white text-2xl"
        }
        shadow-lg
      `}>
        {String(value).padStart(2, "0")}
      </div>
      <p className={`text-[9px] font-bold mt-1 tracking-wider ${
        urgent ? "text-red-400" : warning ? "text-amber-400" : "text-white/30"
      }`}>
        {label}
      </p>
    </div>
  );
}

function Separator({ urgent }: { urgent: boolean }) {
  return (
    <span className={`text-2xl font-black pb-4 ${urgent ? "text-red-400" : "text-white/20"}`}>
      :
    </span>
  );
}

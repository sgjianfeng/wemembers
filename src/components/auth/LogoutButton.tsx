"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface LogoutButtonProps {
  label?: string;
  className?: string;
  variant?: "text" | "outline";
}

export function LogoutButton({
  label = "退出登录",
  className,
  variant = "text",
}: LogoutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    if (loading) return;
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // still leave
    }
    router.replace("/auth/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={cn(
        "transition-colors disabled:opacity-50",
        variant === "outline"
          ? "w-full h-11 rounded-full border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
          : "text-xs font-medium text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-50",
        className
      )}
    >
      {loading ? "…" : label}
    </button>
  );
}

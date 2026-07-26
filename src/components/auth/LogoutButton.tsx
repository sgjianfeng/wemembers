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
    // 退出到公开首页；勿 replace 登录页再 history.back，否则会撞上受保护页被拦回
    router.replace("/");
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
          ? "w-full h-11 rounded-full border border-border text-sm font-medium text-muted-foreground hover:bg-muted/50"
          : "text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted/50",
        className
      )}
    >
      {loading ? "…" : label}
    </button>
  );
}

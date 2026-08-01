"use client";

import { useEffect } from "react";
import type { Lang } from "@/lib/i18n";
import { LanguageProvider } from "./LanguageProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { MobileViewportGuard } from "@/components/mobile/MobileViewportGuard";

/** 打开任意页时轻量续期会话（配合 /api/auth/me 内 maybeRefreshSession） */
function SessionKeepAlive() {
  useEffect(() => {
    let cancelled = false;
    const ping = () => {
      if (cancelled || document.visibilityState === "hidden") return;
      fetch("/api/auth/me", { credentials: "same-origin" }).catch(() => {});
    };
    ping();
    // 每天最多续一次即可；visibility 回来时再 ping
    const onVis = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return null;
}

export function LangWrapper({ children, initialLang }: { children: React.ReactNode; initialLang: Lang }) {
  return (
    <ThemeProvider>
      <LanguageProvider initialLang={initialLang}>
        <MobileViewportGuard />
        <SessionKeepAlive />
        {children}
      </LanguageProvider>
    </ThemeProvider>
  );
}

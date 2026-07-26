"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useLang } from "@/components/i18n/LanguageProvider";

type Mode = "light" | "dark" | "system";

/**
 * 亮色 / 暗色 / 跟随系统。
 * variant=compact：顶栏小按钮；default：设置页分段控件。
 */
export function ThemeSwitcher({
  variant = "default",
  className,
}: {
  variant?: "default" | "compact" | "light";
  className?: string;
}) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { lang } = useLang();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const labels: Record<Mode, string> = {
    light: lang === "en" ? "Light" : "亮色",
    dark: lang === "en" ? "Dark" : "暗色",
    system: lang === "en" ? "Auto" : "系统",
  };

  if (!mounted) {
    return (
      <div
        className={cn(
          variant === "compact" || variant === "light"
            ? "h-8 w-8 rounded-full bg-muted/50"
            : "h-9 w-full rounded-xl bg-muted/40",
          className
        )}
        aria-hidden
      />
    );
  }

  const current = (theme as Mode) || "system";

  if (variant === "compact" || variant === "light") {
    const isDark = resolvedTheme === "dark";
    return (
      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors",
          variant === "light"
            ? "bg-white/15 text-white hover:bg-white/25"
            : "bg-muted text-foreground hover:bg-muted/80",
          className
        )}
        aria-label={
          isDark
            ? lang === "en"
              ? "Switch to light mode"
              : "切换到亮色"
            : lang === "en"
              ? "Switch to dark mode"
              : "切换到暗色"
        }
        title={isDark ? labels.light : labels.dark}
      >
        {isDark ? "☀️" : "🌙"}
      </button>
    );
  }

  const modes: Mode[] = ["light", "dark", "system"];

  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1",
        className
      )}
      role="group"
      aria-label={lang === "en" ? "Theme" : "主题"}
    >
      {modes.map((m) => {
        const active = current === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => setTheme(m)}
            className={cn(
              "rounded-xl py-2 text-xs font-medium transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {m === "light" ? "☀️ " : m === "dark" ? "🌙 " : "💻 "}
            {labels[m]}
          </button>
        );
      })}
    </div>
  );
}

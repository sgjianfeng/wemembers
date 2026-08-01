"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useLang } from "@/components/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { BrandMark } from "@/components/ui/BrandMark";

interface TopHeaderProps {
  variant?: "default" | "transparent" | "landing";
  title?: string;
  fallbackUrl?: string;
  /**
   * true：始终去 fallbackUrl（登录/注册退出后用，避免 history.back 撞受保护页）
   * false：优先 history.back，无历史再 fallback
   */
  preferFallback?: boolean;
  children?: React.ReactNode;
}

export function TopHeader({
  variant = "default",
  title,
  fallbackUrl = "/",
  preferFallback = false,
  children,
}: TopHeaderProps) {
  const router = useRouter();
  const { t } = useLang();

  const isTransparent = variant === "transparent" || variant === "landing";
  const isLanding = variant === "landing";

  const containerClass = cn(
    "sticky top-0 z-20 backdrop-blur",
    variant === "landing"
      ? "bg-slate-900"
      : variant === "transparent"
        ? "bg-transparent border-b border-white/10"
        : "bg-background/85 border-b border-border"
  );

  const textClass = isTransparent ? "text-white" : "text-foreground";

  // ── Left: Back button (default/transparent) or brand lockup (landing) ──
  const leftSlot = isLanding ? (
    <Link
      href="/"
      className="group flex items-center gap-2 min-w-0 shrink-0"
      aria-label="WeMembers"
    >
      <BrandMark size={36} priority className="shadow-md ring-white/25" />
      {/* 字标：副级，略小一号 */}
      <span className="flex flex-col justify-center min-w-0 leading-none gap-0.5">
        <span className="text-[12px] font-semibold tracking-tight text-white truncate">
          WeMembers
        </span>
        <span className="text-[10px] font-semibold tracking-[0.12em] text-amber-300">
          .store
        </span>
      </span>
    </Link>
  ) : (
    <button
      type="button"
      onClick={() => {
        if (preferFallback) {
          router.push(fallbackUrl || "/");
          return;
        }
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackUrl || "/");
        }
      }}
      className={cn(
        "flex items-center gap-1 text-sm font-medium shrink-0 transition-colors",
        isTransparent
          ? "text-white/70 hover:text-white"
          : "text-primary hover:text-primary/80"
      )}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      {t("common.back")}
    </button>
  );

  // ── Center: Title (default/transparent only) ──
  const centerSlot = !isLanding && title ? (
    <h1
      className={cn(
        "flex-1 text-center text-sm font-semibold truncate px-2",
        textClass
      )}
    >
      {title}
    </h1>
  ) : (
    <div className="flex-1" />
  );

  // ── Right: LanguageSwitcher + optional children（登录态等）──
  const rightSlot = isLanding ? (
    <div className="flex items-center gap-2 shrink-0">
      <ThemeSwitcher variant="light" />
      <LanguageSwitcher variant="light" />
      {children}
    </div>
  ) : (
    <div className="flex items-center gap-1.5 shrink-0">
      <ThemeSwitcher variant={isTransparent ? "light" : "compact"} />
      <LanguageSwitcher variant={isTransparent ? "light" : "default"} />
      {children}
    </div>
  );

  return (
    <div className={containerClass}>
      <div className={cn("flex items-center px-3", isLanding ? "h-12" : "h-11")}>
        {leftSlot}
        {centerSlot}
        {rightSlot}
      </div>
    </div>
  );
}

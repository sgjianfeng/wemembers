"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useLang } from "@/components/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";

interface TopHeaderProps {
  variant?: "default" | "transparent" | "landing";
  title?: string;
  fallbackUrl?: string;
  children?: React.ReactNode;
}

export function TopHeader({
  variant = "default",
  title,
  fallbackUrl = "/",
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
        : "bg-white/80 border-b border-slate-100"
  );

  const textClass = isTransparent ? "text-white" : "text-slate-900";

  // ── Left: Back button (default/transparent) or brand (landing) ──
  const leftSlot = isLanding ? (
    <Link
      href="/"
      className={cn(
        "flex items-center gap-1.5 font-bold text-sm shrink-0",
        textClass
      )}
    >
      <Image
        src="/logo.png"
        alt="WeMembers"
        width={80}
        height={24}
        className="h-6 w-auto"
        priority
      />
    </Link>
  ) : (
    <button
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackUrl);
        }
      }}
      className={cn(
        "flex items-center gap-1 text-sm font-medium shrink-0 transition-colors",
        isTransparent
          ? "text-white/70 hover:text-white"
          : "text-blue-600 hover:text-blue-700"
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

  // ── Right: LanguageSwitcher + optional children ──
  const rightSlot = isLanding ? (
    <div className="flex items-center gap-2 shrink-0">
      <LanguageSwitcher variant="light" />
      {children}
    </div>
  ) : (
    <LanguageSwitcher variant={isTransparent ? "light" : "default"} />
  );

  return (
    <div className={containerClass}>
      <div className="flex items-center h-11 px-3">
        {leftSlot}
        {centerSlot}
        {rightSlot}
      </div>
    </div>
  );
}

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

  // ── Left: Back button (default/transparent) or brand lockup (landing) ──
  const leftSlot = isLanding ? (
    <Link
      href="/"
      className="group flex items-center gap-2 min-w-0 shrink-0"
      aria-label="WeMembers"
    >
      {/* 圆形 W 标 — 主视觉，略大于字标 */}
      <span className="flex items-center justify-center shrink-0 rounded-full bg-[#240444] p-0.5 shadow-md ring-1 ring-white/25">
        <Image
          src="/logo-mark.png"
          alt=""
          width={36}
          height={36}
          className="h-8 w-8 object-contain"
          priority
        />
      </span>
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
      <div className={cn("flex items-center px-3", isLanding ? "h-12" : "h-11")}>
        {leftSlot}
        {centerSlot}
        {rightSlot}
      </div>
    </div>
  );
}

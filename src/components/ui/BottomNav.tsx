"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type BottomNavTab = {
  icon: string;
  label: string;
  href: string;
  /** exact match only (e.g. /business overview) */
  exact?: boolean;
};

interface BottomNavProps {
  tabs: BottomNavTab[];
  /** Secondary destinations shown under 「更多」 */
  moreItems?: BottomNavTab[];
  moreLabel?: string;
}

function isTabActive(pathname: string, tab: BottomNavTab): boolean {
  if (tab.exact) {
    return pathname === tab.href;
  }
  return pathname === tab.href || pathname.startsWith(tab.href + "/");
}

export function BottomNav({
  tabs,
  moreItems = [],
  moreLabel = "更多",
}: BottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreActive =
    moreItems.length > 0 &&
    moreItems.some((item) => isTabActive(pathname, item));

  // Close sheet on navigation
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Lock body scroll when sheet open
  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t safe-area-pb">
        <div className="flex items-center justify-around h-14 max-w-lg mx-auto px-0.5">
          {tabs.map((tab) => {
            const active = isTabActive(pathname, tab);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1 transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="text-lg leading-none">{tab.icon}</span>
                <span className="text-[10px] leading-none font-medium truncate max-w-full px-0.5">
                  {tab.label}
                </span>
              </Link>
            );
          })}

          {moreItems.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1 transition-colors",
                moreActive || moreOpen
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
            >
              <span className="text-lg leading-none" aria-hidden>
                ⋯
              </span>
              <span className="text-[10px] leading-none font-medium">
                {moreLabel}
              </span>
            </button>
          )}
        </div>
      </nav>

      {/* More sheet */}
      {moreItems.length > 0 && moreOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-w-lg mx-auto bg-white rounded-t-2xl shadow-xl pb-[max(1rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-200">
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>
            <div className="px-4 pb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">{moreLabel}</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="text-xs text-slate-400 px-2 py-1"
              >
                ✕
              </button>
            </div>
            <div className="px-3 pb-3 grid grid-cols-3 gap-2 max-h-[50vh] overflow-y-auto">
              {moreItems.map((item) => {
                const active = isTabActive(pathname, item);
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      router.push(item.href);
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 min-h-[76px] transition-colors",
                      active
                        ? "border-[#1A6EFF]/40 bg-blue-50 text-[#1A6EFF]"
                        : "border-slate-100 bg-slate-50/80 text-slate-700 hover:border-slate-200"
                    )}
                  >
                    <span className="text-2xl leading-none">{item.icon}</span>
                    <span className="text-[11px] font-medium text-center leading-tight">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

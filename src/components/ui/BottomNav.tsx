"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveIcon, type IconName } from "@/components/ui/icons";

export type BottomNavTab = {
  /** semantic icon key resolved via the central registry (not an emoji) */
  icon: IconName;
  label: string;
  href: string;
  /** exact match only (e.g. /business overview) */
  exact?: boolean;
  /** optional group label in the「更多」sheet (items with same section stay together) */
  section?: string;
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

  const moreSections = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, BottomNavTab[]>();
    for (const item of moreItems) {
      const key = item.section?.trim() || "";
      if (!map.has(key)) {
        order.push(key);
        map.set(key, []);
      }
      map.get(key)!.push(item);
    }
    return order.map((key) => ({ section: key, items: map.get(key)! }));
  }, [moreItems]);

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
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/90 backdrop-blur safe-area-pb">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-1">
          {tabs.map((tab) => {
            const active = isTabActive(pathname, tab);
            const Icon = resolveIcon(tab.icon);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex flex-col items-center justify-center gap-1 min-w-0 flex-1 h-full transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center h-8 w-11 rounded-full transition-colors",
                    active && "bg-primary/10"
                  )}
                >
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.4 : 2}
                    className="transition-transform group-active:scale-90"
                    aria-hidden
                  />
                </span>
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
                "group flex flex-col items-center justify-center gap-1 min-w-0 flex-1 h-full transition-colors",
                moreActive || moreOpen
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
            >
              <span
                className={cn(
                  "flex items-center justify-center h-8 w-11 rounded-full transition-colors",
                  (moreActive || moreOpen) && "bg-primary/10"
                )}
              >
                <LayoutGrid
                  size={22}
                  strokeWidth={moreActive || moreOpen ? 2.4 : 2}
                  className="transition-transform group-active:scale-90"
                  aria-hidden
                />
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
            className="absolute inset-0 bg-black/40 animate-in fade-in duration-150"
            aria-label="Close"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-w-lg mx-auto bg-popover text-popover-foreground rounded-t-3xl shadow-xl pb-[max(1rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-200">
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>
            <div className="px-4 pb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">{moreLabel}</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="grid place-items-center h-8 w-8 -mr-1 rounded-full text-muted-foreground hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <div className="px-3 pb-3 space-y-3 max-h-[55vh] overflow-y-auto">
              {moreSections.map(({ section, items }) => (
                <div key={section || "__default"}>
                  {section ? (
                    <p className="px-1 pb-1.5 text-[11px] font-medium text-muted-foreground">
                      {section}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-3 gap-2">
                    {items.map((item) => {
                      const active = isTabActive(pathname, item);
                      const Icon = resolveIcon(item.icon);
                      return (
                        <button
                          key={item.href}
                          type="button"
                          onClick={() => {
                            setMoreOpen(false);
                            router.push(item.href);
                          }}
                          className={cn(
                            "flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 min-h-[76px] transition-all active:scale-[0.97]",
                            active
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border bg-muted/50 text-foreground hover:border-muted-foreground/30"
                          )}
                        >
                          <Icon
                            size={24}
                            strokeWidth={active ? 2.2 : 2}
                            aria-hidden
                          />
                          <span className="text-[11px] font-medium text-center leading-tight">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

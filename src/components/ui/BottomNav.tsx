"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface Tab {
  icon: string;
  label: string;
  href: string;
}

interface BottomNavProps {
  tabs: Tab[];
}

export function BottomNav({ tabs }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 z-40 safe-bottom">
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1",
                isActive ? "text-[#1A6EFF]" : "text-slate-400"
              )}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className="text-[10px] leading-none font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

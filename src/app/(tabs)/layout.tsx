"use client";

import { useLang } from "@/components/i18n/LanguageProvider";
import { BottomNav } from "@/components/ui/BottomNav";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  const { lang } = useLang();

  const tabs = [
    { icon: "🏠", label: "首页", href: "/home" },
    { icon: "🎫", label: "券包", href: "/wallet" },
    { icon: "💳", label: lang === "zh" ? "余额" : "Balance", href: "/balance" },
    { icon: "👤", label: "我的", href: "/profile" },
  ];

  return (
    <>
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-50 px-3 h-10 flex items-center justify-end">
        <LanguageSwitcher />
      </div>
      <main className="pb-16 min-h-screen">{children}</main>
      <BottomNav tabs={tabs} />
    </>
  );
}

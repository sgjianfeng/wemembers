"use client";

import { useLang } from "@/components/i18n/LanguageProvider";
import { BottomNav } from "@/components/ui/BottomNav";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  const { t } = useLang();
  const tabs = [
    { icon: "🏠", label: t("tabs.home"), href: "/home" },
    { icon: "🎫", label: t("tabs.wallet"), href: "/wallet" },
    { icon: "💳", label: t("tabs.balance"), href: "/balance" },
    { icon: "👤", label: t("tabs.profile"), href: "/profile" },
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

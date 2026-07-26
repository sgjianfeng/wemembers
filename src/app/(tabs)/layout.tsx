"use client";

import Image from "next/image";
import Link from "next/link";
import { useLang } from "@/components/i18n/LanguageProvider";
import { BottomNav } from "@/components/ui/BottomNav";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  const { t } = useLang();
  const tabs = [
    { icon: "home" as const, label: t("tabs.home"), href: "/home" },
    { icon: "wallet" as const, label: t("tabs.wallet"), href: "/wallet" },
    { icon: "balance" as const, label: t("tabs.balance"), href: "/balance" },
    { icon: "profile" as const, label: t("tabs.profile"), href: "/profile" },
  ];

  return (
    <>
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b border-border px-3 h-11 flex items-center justify-between">
        <Link href="/home" aria-label="WeMembers" className="flex items-center gap-1.5">
          <Image
            src="/logo-mark.png"
            alt=""
            width={256}
            height={256}
            priority
            className="h-6 w-6"
          />
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            WeMembers
          </span>
        </Link>
        <LanguageSwitcher />
      </div>
      <main className="pb-16 min-h-screen">{children}</main>
      <BottomNav tabs={tabs} />
    </>
  );
}

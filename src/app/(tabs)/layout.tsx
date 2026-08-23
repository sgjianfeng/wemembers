"use client";

import Link from "next/link";
import { useLang } from "@/components/i18n/LanguageProvider";
import { BottomNav } from "@/components/ui/BottomNav";
import { BrandMark } from "@/components/ui/BrandMark";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  const { t } = useLang();
  /**
   * 券包与余额过去是两个 tab，那是按**存储形式**分的（CustomerCoupon vs Voucher），
   * 是数据库的分法不是顾客的分法。顾客要回答的是「我在这家店有什么」，
   * 跑两个 tab 才能拼出答案。合并为按品牌聚合的「我的卡」。
   * /wallet 与 /balance 路由保留，供深链与品牌卡内的下钻。
   */
  const tabs = [
    { icon: "home" as const, label: t("tabs.home"), href: "/home" },
    { icon: "wallet" as const, label: t("tabs.cards"), href: "/card" },
    { icon: "profile" as const, label: t("tabs.profile"), href: "/profile" },
  ];

  return (
    <>
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b border-border px-3 h-11 flex items-center justify-between">
        <Link
          href="/home"
          aria-label="WeMembers"
          className="flex items-center gap-2 min-w-0"
        >
          <BrandMark size={30} priority />
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            WeMembers
          </span>
        </Link>
        <div className="flex items-center gap-1.5 shrink-0">
          <ThemeSwitcher variant="compact" />
          <LanguageSwitcher />
        </div>
      </div>
      <main className="pb-16 min-h-screen">{children}</main>
      <BottomNav tabs={tabs} />
    </>
  );
}

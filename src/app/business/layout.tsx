"use client";

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/ui/BottomNav";
import { useLang } from "@/components/i18n/LanguageProvider";

export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  // Import shared dict access
  const { getLangDict } = await import("@/lib/i18n");
  const { cookies } = await import("next/headers");
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";
  const d = getLangDict(lang as "zh" | "en");

  const businessTabs = [
    { icon: "📊", label: d["business.tabs.overview"] || "概览", href: "/business" },
    { icon: "👥", label: d["business.tabs.members"] || "会员", href: "/business/members" },
    { icon: "🎫", label: d["business.tabs.coupons"] || "券管理", href: "/business/coupons" },
    { icon: "🎰", label: d["business.tabs.luckyDraw"] || "抽奖", href: "/business/lucky-draw" },
    { icon: "📅", label: d["business.tabs.campaigns"] || "活动", href: "/business/campaigns" },
    { icon: "🏪", label: d["business.tabs.stores"] || "门店", href: "/business/stores" },
    { icon: "🤝", label: d["business.tabs.partners"] || "合作", href: "/business/partners" },
  ];

  const staffTabs = [
    { icon: "📊", label: "Overview", href: "/business" },
    { icon: "📷", label: "Redeem", href: "/business/scan" },
    { icon: "👥", label: "Members", href: "/business/members" },
    { icon: "🏪", label: "Store", href: "/business/store" },
  ];

  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const tabs = (session.role === "staff" ? staffTabs : businessTabs).map((t) => ({
    ...t,
    label: lang === "en" ? t.label : t.label, // 已在上面用 dict 翻译
  }));

  return (
    <>
      <main className="pb-16 min-h-screen">{children}</main>
      <BottomNav tabs={tabs} />
    </>
  );
}

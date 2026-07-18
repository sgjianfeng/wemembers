import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import { BottomNav } from "@/components/ui/BottomNav";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";

export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const businessTabs = [
    { icon: "📊", label: t("business.tabs.overview", lang as "zh" | "en"), href: "/business" },
    { icon: "👥", label: t("business.tabs.members", lang as "zh" | "en"), href: "/business/members" },
    { icon: "🎫", label: t("business.tabs.coupons", lang as "zh" | "en"), href: "/business/coupons" },
    { icon: "🎰", label: t("business.tabs.luckyDraw", lang as "zh" | "en"), href: "/business/lucky-draw" },
    { icon: "📅", label: t("business.tabs.campaigns", lang as "zh" | "en"), href: "/business/campaigns" },
    { icon: "🧾", label: t("business.tabs.receipt", lang as "zh" | "en"), href: "/business/receipt" },
    { icon: "🏪", label: t("business.tabs.stores", lang as "zh" | "en"), href: "/business/stores" },
    { icon: "🤝", label: t("business.tabs.partners", lang as "zh" | "en"), href: "/business/partners" },
  ];

  const staffTabs = [
    { icon: "📊", label: t("business.tabs.staffOverview", lang as "zh" | "en"), href: "/business" },
    { icon: "📷", label: t("business.tabs.redeem", lang as "zh" | "en"), href: "/business/scan" },
    { icon: "👥", label: t("business.tabs.members", lang as "zh" | "en"), href: "/business/members" },
    { icon: "🏪", label: t("business.tabs.store", lang as "zh" | "en"), href: "/business/store" },
  ];

  return (
    <>
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-50 px-3 h-10 flex items-center justify-end">
        <LanguageSwitcher />
      </div>
      <main className="pb-16 min-h-screen">{children}</main>
      <BottomNav tabs={session.role === "staff" ? staffTabs : businessTabs} />
    </>
  );
}

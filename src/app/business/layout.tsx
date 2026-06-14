import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import { BottomNav } from "@/components/ui/BottomNav";

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
    { icon: "🏪", label: t("business.tabs.stores", lang as "zh" | "en"), href: "/business/stores" },
    { icon: "🤝", label: t("business.tabs.partners", lang as "zh" | "en"), href: "/business/partners" },
  ];

  const staffTabs = [
    { icon: "📊", label: "Overview", href: "/business" },
    { icon: "📷", label: "Redeem", href: "/business/scan" },
    { icon: "👥", label: "Members", href: "/business/members" },
    { icon: "🏪", label: "Store", href: "/business/store" },
  ];

  return (
    <>
      <main className="pb-16 min-h-screen">{children}</main>
      <BottomNav tabs={session.role === "staff" ? staffTabs : businessTabs} />
    </>
  );
}

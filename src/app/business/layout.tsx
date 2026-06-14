import { getSession } from "@/lib/auth";
import { BottomNav } from "@/components/ui/BottomNav";
import { redirect } from "next/navigation";

const businessTabs = [
  { icon: "📊", label: "概览", href: "/business" },
  { icon: "👥", label: "会员", href: "/business/members" },
  { icon: "🎫", label: "券管理", href: "/business/coupons" },
  { icon: "🎰", label: "抽奖", href: "/business/lucky-draw" },
  { icon: "📅", label: "活动", href: "/business/campaigns" },
  { icon: "🏪", label: "门店", href: "/business/stores" },
  { icon: "🤝", label: "合作", href: "/business/partners" },
];

const staffTabs = [
  { icon: "📊", label: "概览", href: "/business" },
  { icon: "📷", label: "核销", href: "/business/scan" },
  { icon: "👥", label: "会员", href: "/business/members" },
  { icon: "🏪", label: "本店", href: "/business/store" },
];

export default async function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const tabs = session.role === "staff" ? staffTabs : businessTabs;

  return (
    <>
      <main className="pb-16 min-h-screen">{children}</main>
      <BottomNav tabs={tabs} />
    </>
  );
}

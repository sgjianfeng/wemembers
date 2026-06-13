import { BottomNav } from "@/components/ui/BottomNav";

const tabs = [
  { icon: "🏠", label: "首页", href: "/home" },
  { icon: "🎫", label: "券包", href: "/wallet" },
  { icon: "💳", label: "会员卡", href: "/card/default" },
  { icon: "👤", label: "我的", href: "/profile" },
];

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="pb-16 min-h-screen">{children}</main>
      <BottomNav tabs={tabs} />
    </>
  );
}

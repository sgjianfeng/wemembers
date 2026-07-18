import Link from "next/link";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";

const navItems = [
  { icon: "📊", label: "平台概览", href: "/admin" },
  { icon: "🏢", label: "商家管理", href: "/admin/businesses" },
  { icon: "🪙", label: "Token管理", href: "/admin/tokens" },
  { icon: "⚙️", label: "系统配置", href: "/admin/system" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 h-12 flex items-center justify-between">
        <span className="font-semibold text-sm text-slate-900">WeMembers 后台</span>
        <div className="flex items-center gap-1">
          <AdminLogoutButton />
          <LanguageSwitcher />
        </div>
      </header>
      <main className="flex-1 pb-16">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 z-40">
        <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1 text-slate-400"
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="text-[10px] leading-none font-medium">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

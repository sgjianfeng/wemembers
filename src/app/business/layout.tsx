import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import { BottomNav } from "@/components/ui/BottomNav";
import { BrandAvatar } from "@/components/ui/BrandAvatar";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { prisma } from "@/lib/db";
import Link from "next/link";

/** 经 Route Handler 清 cookie，避免 Server Component 改 Cookie 报错 */
const STALE_SESSION_CLEAR = "/api/auth/logout?next=/auth/login";

export default async function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  // 清库后 JWT 仍在：必须先清 cookie，否则 login ↔ business 无限 redirect（replaceState 爆炸）
  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, businessName: true, businessLogo: true },
  });
  if (
    !dbUser ||
    (dbUser.role !== "business" && dbUser.role !== "staff")
  ) {
    redirect(STALE_SESSION_CLEAR);
  }

  const c = await cookies();
  const lang = (c.get("gwm_lang")?.value === "en" ? "en" : "zh") as "zh" | "en";

  /**
   * 底栏：主路径 4 个 + 「更多」
   * 主：概览 / 核销 / 活动 / 功能仓（日常运营 + 扩展入口）
   * 更多：门店、会员、营销券、账户、经营看板、设置
   * 工具类（资料仓/实体券/现金发券/合作）收进功能仓，抽奖并入活动
   */
  const businessPrimary = [
    {
      icon: "overview" as const,
      label: t("business.tabs.overview", lang),
      href: "/business",
      exact: true,
    },
    {
      icon: "redeem" as const,
      label: t("business.tabs.redeem", lang),
      href: "/business/scan",
    },
    {
      icon: "campaigns" as const,
      label: lang === "en" ? "Products" : "券产品",
      href: "/business/products",
    },
    {
      icon: "hub" as const,
      label: t("business.tabs.hub", lang),
      href: "/business/hub",
    },
  ];

  const businessMore = [
    {
      icon: "campaigns" as const,
      label: lang === "en" ? "Activities" : "活动",
      href: "/business/campaigns",
    },
    {
      icon: "stores" as const,
      label: t("business.tabs.stores", lang),
      href: "/business/stores",
    },
    {
      icon: "members" as const,
      label: t("business.tabs.members", lang),
      href: "/business/members",
    },
    {
      icon: "coupons" as const,
      label: t("business.tabs.coupons", lang),
      href: "/business/coupons",
    },
    {
      icon: "tokens" as const,
      label: t("business.tabs.wallet", lang),
      href: "/business/tokens",
    },
    {
      icon: "earnings" as const,
      label: t("business.overview.earnings", lang),
      href: "/business/earnings",
    },
    {
      icon: "settings" as const,
      label: t("business.tabs.settings", lang),
      href: "/business/settings",
    },
  ];

  const staffTabs = [
    {
      icon: "overview" as const,
      label: lang === "en" ? "Store" : "本店",
      href: "/business",
      exact: true,
    },
    {
      icon: "redeem" as const,
      label: t("business.tabs.redeem", lang),
      href: "/business/scan",
    },
    {
      icon: "members" as const,
      label: t("business.tabs.members", lang),
      href: "/business/members",
    },
    {
      icon: "store" as const,
      label: t("business.tabs.store", lang),
      href: "/business/store",
    },
  ];

  // 顶栏：企业显示公司名；店员显示固定门店名（无「当前门店」切换）
  let leftLabel = lang === "en" ? "Company" : "企业后台";
  let leftHref = "/business";
  let headerLogo: string | null = dbUser.businessLogo;
  let headerLogoName: string | null = dbUser.businessName;

  if (dbUser.role === "business") {
    leftLabel = dbUser.businessName || leftLabel;
    leftHref = "/business/settings";
  } else if (dbUser.role === "staff") {
    const storeRow = session.storeId
      ? await prisma.store.findUnique({
          where: { id: session.storeId },
          select: {
            name: true,
            business: {
              select: { businessLogo: true, businessName: true },
            },
          },
        })
      : null;
    leftLabel = storeRow?.name
      ? storeRow.name
      : lang === "en"
        ? "Store staff"
        : "门店账号";
    leftHref = "/business";
    headerLogo = storeRow?.business.businessLogo ?? null;
    headerLogoName = storeRow?.name ?? leftLabel;
  }

  return (
    <>
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border px-3 h-11 flex items-center justify-between gap-2">
        <Link
          href={leftHref}
          className="min-w-0 flex items-center gap-2 max-w-[70%]"
        >
          {(dbUser.role === "business" || dbUser.role === "staff") && (
            <BrandAvatar
              src={headerLogo}
              name={headerLogoName}
              size={24}
              rounded="lg"
            />
          )}
          <span className="text-xs font-semibold text-foreground truncate">
            {leftLabel}
          </span>
        </Link>
        <div className="flex items-center gap-1.5 shrink-0">
          <ThemeSwitcher variant="compact" />
          <LanguageSwitcher />
        </div>
      </div>
      <main className="pb-16 min-h-screen">{children}</main>
      {dbUser.role === "staff" ? (
        <BottomNav tabs={staffTabs} />
      ) : (
        <BottomNav
          tabs={businessPrimary}
          moreItems={businessMore}
          moreLabel={lang === "en" ? "More" : "更多"}
        />
      )}
    </>
  );
}

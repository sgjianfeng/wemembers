import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";

export default async function BusinessDashboard() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { tokenAccount: { select: { balance: true } } },
  });
  if (!user) redirect("/auth/login");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const stores = await prisma.store.findMany({
    where: { businessId: user.id },
    select: { id: true },
  });
  const storeIds = stores.map((s) => s.id);

  const [
    memberCount,
    couponCount,
    activeCampaignCount,
    salesToday,
    redeemsToday,
    recentVoucherUsages,
    marketCampaignCount,
  ] = await Promise.all([
    prisma.membership.count({ where: { businessId: user.id } }),
    prisma.coupon.count({ where: { businessId: user.id, status: "published" } }),
    prisma.campaign.count({
      where: {
        businessId: user.id,
        status: "active",
        type: { in: ["lucky_draw_v2", "voucher_sale"] },
      },
    }),
    prisma.voucher.count({
      where: {
        campaign: { businessId: user.id },
        createdAt: { gte: today, lt: tomorrow },
      },
    }),
    storeIds.length
      ? prisma.voucherUsage.count({
          where: { storeId: { in: storeIds }, createdAt: { gte: today, lt: tomorrow } },
        })
      : Promise.resolve(0),
    storeIds.length
      ? prisma.voucherUsage.findMany({
          where: { storeId: { in: storeIds } },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            store: { select: { name: true } },
            voucher: { select: { campaign: { select: { name: true } } } },
          },
        })
      : Promise.resolve([]),
    prisma.campaign.count({
      where: {
        joinable: true,
        status: "active",
        endDate: { gte: today },
        businessId: { not: user.id },
      },
    }),
  ]);

  const balance = user.tokenAccount?.balance ?? 0;
  // TokenAccount balance is in cents for V2 cash; show as S$ for clarity
  const balanceSgd = (balance / 100).toFixed(2);

  void couponCount;

  return (
    <div className="pb-4">
      <div className="bg-white border-b border-slate-100 px-4 py-3 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {user.businessName || t("business.overview.myStore", lang)}
            </p>
            <p className="text-xs text-slate-400">
              {new Date().toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <Link href="/business/tokens">
            <div className="flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100">
              <span className="text-xs">💰</span>
              <span className="text-sm font-semibold text-amber-700">S${balanceSgd}</span>
            </div>
          </Link>
        </div>
      </div>
      <div className="px-4 mt-4">
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              icon: "👤",
              label: t("business.overview.members", lang),
              value: memberCount.toString(),
            },
            {
              icon: "🎰",
              label: t("business.overview.activeCampaigns", lang),
              value: activeCampaignCount.toString(),
            },
            {
              icon: "🛒",
              label: t("business.overview.salesToday", lang),
              value: salesToday.toString(),
            },
            {
              icon: "💎",
              label: t("business.overview.todayRedeems", lang),
              value: redeemsToday.toString(),
            },
          ].map((k) => (
            <Card key={k.label} className="bg-slate-50 border-0">
              <CardContent className="p-3">
                <span className="text-lg">{k.icon}</span>
                <p className="text-2xl font-bold text-slate-900 mt-2">{k.value}</p>
                <p className="text-xs text-slate-400">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <h3 className="text-sm font-semibold text-slate-900 mt-5 mb-2">
          {t("business.overview.quickActions", lang)}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            {
              icon: "🎫",
              label: t("business.overview.issueCoupon", lang),
              desc: t("business.overview.issueCouponDesc", lang),
              href: "/business/coupons/new",
            },
            {
              icon: "👤",
              label: t("business.overview.membersMgmt", lang),
              desc: t("business.overview.membersMgmtDesc", lang),
              href: "/business/members",
            },
            {
              icon: "📷",
              label: t("business.overview.scan", lang),
              desc: t("business.overview.scanDesc", lang),
              href: "/business/scan",
            },
            {
              icon: "🪙",
              label: t("business.overview.topup", lang),
              desc: t("business.overview.topupDesc", lang),
              href: "/business/tokens",
            },
            {
              icon: "📊",
              label: t("business.overview.earnings", lang),
              desc: t("business.overview.earningsDesc", lang),
              href: "/business/earnings",
            },
            {
              icon: "🎰",
              label: t("business.overview.joinCampaigns", lang),
              desc: t("business.overview.joinCampaignsDesc", lang, {
                count: marketCampaignCount,
              }),
              href: "/business/campaigns/market",
            },
            {
              icon: "🔗",
              label: t("business.overview.sellerLinks", lang),
              desc: t("business.overview.sellerLinksDesc", lang),
              href: "/seller",
            },
          ].map((a) => (
            <Link key={a.href} href={a.href}>
              <Card className="hover:border-[#1A6EFF]/30 transition-colors">
                <CardContent className="p-3 flex items-center gap-3">
                  <span className="text-2xl">{a.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{a.label}</p>
                    <p className="text-[10px] text-slate-400">{a.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        <h3 className="text-sm font-semibold text-slate-900 mt-5 mb-2">
          {t("business.overview.recent", lang)}
        </h3>
        {recentVoucherUsages.length > 0 ? (
          recentVoucherUsages.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg text-sm mb-1"
            >
              <span className="text-slate-600 truncate pr-2">
                {t("business.overview.usageRow", lang, {
                  campaign: u.voucher.campaign?.name || "—",
                  store: u.store?.name || "—",
                  amount: (u.storeIncome / 100).toFixed(2),
                })}
              </span>
              <span className="text-xs text-slate-400 shrink-0">{timeAgo(u.createdAt)}</span>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-slate-400">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-sm">{t("business.overview.noActivity", lang)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

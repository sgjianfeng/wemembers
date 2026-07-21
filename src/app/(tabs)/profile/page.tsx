import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatPoints } from "@/lib/utils";
import Link from "next/link";
import { ProfileReferral } from "./ProfileReferral";
import { ProfileEditName } from "./ProfileEditName";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { DailyCheckIn } from "@/components/customer/DailyCheckIn";
import { t } from "@/lib/i18n";
import { cookies } from "next/headers";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { tokenAccount: { select: { balance: true } } },
  });
  if (!user) redirect("/api/auth/logout?next=/auth/login");

  // 获取徽章
  const userBadges = await prisma.userBadge.findMany({
    where: { userId: session.userId },
    include: { badge: true },
    orderBy: { earnedAt: "desc" },
    take: 12,
  });

  // 统计数据
  const [claimCount, redeemCount, inviteCount] = await Promise.all([
    prisma.customerCoupon.count({ where: { customerId: session.userId } }),
    prisma.redemptionLog.count({ where: { customerId: session.userId } }),
    prisma.referral.count({ where: { referrerId: session.userId } }),
  ]);

  // 签到统计
  const checkInCount = await prisma.checkIn.count({ where: { userId: session.userId } });

  const tierLabels: Record<string, { label: string; color: "slate" | "amber" | "purple" }> = {
    regular: { label: t("profile.regular", lang), color: "slate" },
    silver: { label: t("profile.silver", lang), color: "slate" },
    gold: { label: t("profile.gold", lang), color: "amber" },
    platinum: { label: t("profile.platinum", lang), color: "purple" },
  };
  const tier = tierLabels[user.membershipTier] || tierLabels.regular;

  return (
    <div className="pb-4">
      {/* 头像 + 等级 */}
      <div className="px-4 pt-6 pb-4 bg-gradient-to-b from-[#1A6EFF] to-white">
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold text-white">
            {(user.displayName || t("profile.defaultInitial", lang)).charAt(0)}
          </div>
          <div className="text-white">
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold">{user.displayName || user.phone || t("profile.defaultName", lang)}</p>
              <Badge variant="slate" size="sm" className="!bg-white/20 !text-white">{tier.label}</Badge>
            </div>
            <p className="text-sm text-white/70 mt-0.5">⭐ {formatPoints(user.pointsBalance)} {t("profile.points", lang)}</p>
            <ProfileEditName initialName={user.displayName || ""} />
          </div>
        </div>

        {/* 统计小格 */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          {[{ v: user.streakDays, l: t("profile.streakDays", lang) },{ v: checkInCount, l: t("profile.totalCheckins", lang) },{ v: claimCount, l: t("profile.claimCount", lang) },{ v: inviteCount, l: t("profile.inviteCount", lang) }].map(s => (
            <div key={s.l} className="text-center bg-white/60 rounded-lg py-2">
              <p className="text-base font-bold text-slate-900">{s.v}</p>
              <p className="text-[10px] text-slate-500">{s.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 每日签到（从首页降级到个人中心） */}
      <div className="px-4 mt-4">
        <DailyCheckIn />
      </div>

      {/* 徽章 */}
      <div className="px-4 mt-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">🏅 {t("profile.myBadges", lang)} ({userBadges.length}/12)</h3>
        {userBadges.length > 0 ? (
          <div className="grid grid-cols-6 gap-2">
            {userBadges.map((ub) => (
              <div key={ub.id} className="text-center">
                <div className="w-10 h-10 mx-auto rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-lg">
                  {ub.badge.icon}
                </div>
                <p className="text-[9px] text-slate-500 mt-1 truncate">{ub.badge.name}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 bg-slate-50 rounded-xl">
            <p className="text-xs text-slate-400">{t("profile.noBadges", lang)}</p>
          </div>
        )}
      </div>

      {/* 已实现功能入口 — 保证全部可从「我的」到达 */}
      <div className="px-4 mt-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">
          {t("profile.menu", lang)}
        </h3>
        <div className="space-y-2">
          {(
            [
              {
                href: "/wallet",
                icon: "🎫",
                title: t("profile.menu.wallet", lang),
                desc: t("profile.menu.walletDesc", lang),
              },
              {
                href: "/balance",
                icon: "💳",
                title: t("profile.menu.balance", lang),
                desc: t("profile.menu.balanceDesc", lang),
              },
              {
                href: "/card",
                icon: "🪪",
                title: t("profile.menu.card", lang),
                desc: t("profile.menu.cardDesc", lang),
              },
              {
                href: "/promoter",
                icon: "💸",
                title: t("profile.promoter", lang),
                desc: t("profile.promoterDesc", lang),
                accent: true,
              },
              {
                href: "/seller",
                icon: "📣",
                title: t("profile.seller", lang),
                desc: t("profile.sellerDesc", lang),
              },
            ] as const
          ).map((item) => (
            <Link key={item.href} href={item.href}>
              <Card
                className={
                  "accent" in item && item.accent
                    ? "border-dashed border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 hover:border-green-300 transition-colors"
                    : "hover:border-[#1A6EFF]/30 transition-colors"
                }
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl shrink-0">{item.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{item.desc}</p>
                    </div>
                  </div>
                  <span className="text-slate-300 shrink-0">→</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* 邀请好友 */}
      <div className="px-4 mt-4">
        <ProfileReferral />
      </div>

      {/* 登出 */}
      <div className="px-4 mt-6 pb-4 space-y-3">
        <LogoutButton
          label={lang === "en" ? "Log out" : "退出登录"}
          variant="outline"
        />
        <p className="text-center text-xs text-slate-300">{t("profile.version", lang)}</p>
      </div>
    </div>
  );
}

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { formatMoney } from "@/lib/utils";
import Link from "next/link";
import { ProfileReferral } from "./ProfileReferral";
import { ProfileEditName } from "./ProfileEditName";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { DailyCheckIn } from "@/components/customer/DailyCheckIn";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { t } from "@/lib/i18n";
import { cookies } from "next/headers";
import {
  Wallet,
  CreditCard,
  TrendingUp,
  Megaphone,
  ChevronRight,
  Gift,
  Trophy,
} from "lucide-react";

/**
 * 顾客「我的」
 * 对齐最新心智：活动权益（满赠/抽奖）· 预付余额 · 门店会员；
 * 签到/徽章降为次要；推广为可选工具。
 */
export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";
  const zh = lang !== "en";

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      displayName: true,
      phone: true,
      email: true,
      pointsBalance: true,
      streakDays: true,
      membershipTier: true,
    },
  });
  if (!user) redirect("/api/auth/logout?next=/auth/login");

  const [
    giftAvailable,
    giftTotal,
    activeVouchers,
    drawEntries,
    membershipCount,
    userBadges,
    checkInCount,
    inviteCount,
  ] = await Promise.all([
    prisma.customerCoupon.count({
      where: { customerId: session.userId, status: "available" },
    }),
    prisma.customerCoupon.count({ where: { customerId: session.userId } }),
    prisma.voucher.findMany({
      where: { customerId: session.userId, status: "active" },
      select: { balanceCents: true, drawWeight: true },
    }),
    prisma.voucher.count({
      where: {
        customerId: session.userId,
        status: "active",
        drawWeight: { gt: 0 },
      },
    }),
    prisma.membership.count({
      where: { customerId: session.userId },
    }),
    prisma.userBadge.findMany({
      where: { userId: session.userId },
      include: { badge: true },
      orderBy: { earnedAt: "desc" },
      take: 12,
    }),
    prisma.checkIn.count({ where: { userId: session.userId } }),
    prisma.referral.count({ where: { referrerId: session.userId } }),
  ]);

  const prepaidBalance = activeVouchers.reduce(
    (s, v) => s + (v.balanceCents || 0),
    0
  );
  const prepaidCount = activeVouchers.length;

  const contact =
    user.phone ||
    user.email ||
    (zh ? "未绑定手机" : "No phone");
  const displayName =
    user.displayName?.trim() ||
    user.phone ||
    t("profile.defaultName", lang);

  type MenuItem = {
    href: string;
    icon: typeof Ticket;
    title: string;
    desc: string;
    meta?: string;
    tone?: "primary" | "default" | "muted";
  };

  const assetMenus: MenuItem[] = [
    {
      href: "/wallet",
      icon: Gift,
      title: zh ? "活动权益 · 券包" : "Activity perks · wallet",
      desc: zh
        ? "满赠券 · 抽奖资格 · 到店出示"
        : "Gift coupons · draw entries · show in store",
      meta:
        giftAvailable + drawEntries > 0
          ? zh
            ? `${giftAvailable} 张可用` +
              (drawEntries > 0 ? ` · ${drawEntries} 抽奖` : "")
            : `${giftAvailable} ready` +
              (drawEntries > 0 ? ` · ${drawEntries} draw` : "")
          : zh
            ? "暂无"
            : "None",
      tone: "primary",
    },
    {
      href: "/balance",
      icon: Wallet,
      title: zh ? "预付余额" : "Prepaid balance",
      desc: zh
        ? "长期券 / 9折卡等到店花"
        : "Long-term & discount credit · spend in store",
      meta:
        prepaidBalance > 0
          ? formatMoney(prepaidBalance)
          : prepaidCount > 0
            ? zh
              ? `${prepaidCount} 张券`
              : `${prepaidCount} vouchers`
            : zh
              ? "S$0"
              : "S$0",
      tone: "primary",
    },
    {
      href: "/card",
      icon: CreditCard,
      title: zh ? "门店会员卡" : "Store membership",
      desc: zh
        ? "各店积分 · 等级权益（按门店）"
        : "Points & tiers per store",
      meta:
        membershipCount > 0
          ? zh
            ? `${membershipCount} 家店`
            : `${membershipCount} stores`
          : zh
            ? "未加入"
            : "None yet",
    },
  ];

  const toolMenus: MenuItem[] = [
    {
      href: "/promoter",
      icon: TrendingUp,
      title: t("profile.promoter", lang),
      desc: t("profile.promoterDesc", lang),
    },
    {
      href: "/seller",
      icon: Megaphone,
      title: t("profile.seller", lang),
      desc: t("profile.sellerDesc", lang),
    },
  ];

  return (
    <div className="pb-6">
      {/* 账号头：实色底 + 白卡片速览，避免渐变发白看不清 */}
      <div className="px-4 pt-5 pb-5 bg-[#1A6EFF]">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-white/25 ring-2 ring-white/40 flex items-center justify-center text-xl font-bold text-white shrink-0">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 text-white">
            <p className="text-lg font-bold tracking-tight truncate drop-shadow-sm">
              {displayName}
            </p>
            <p className="text-xs text-white/95 mt-0.5 font-mono truncate">
              {contact}
            </p>
            <ProfileEditName initialName={user.displayName || ""} />
          </div>
        </div>

        {/* 权益速览：白底深字，对比度最高 */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <Link
            href="/wallet"
            className="text-center bg-white rounded-xl py-2.5 px-1 shadow-sm active:scale-[0.98] transition-transform"
          >
            <p className="text-lg font-bold text-[#1A6EFF] tabular-nums leading-none">
              {giftAvailable}
            </p>
            <p className="text-[10px] font-medium text-slate-600 mt-1">
              {zh ? "可用赠券" : "Gifts"}
            </p>
          </Link>
          <Link
            href="/balance"
            className="text-center bg-white rounded-xl py-2.5 px-1 shadow-sm active:scale-[0.98] transition-transform"
          >
            <p className="text-lg font-bold text-[#1A6EFF] tabular-nums leading-none">
              {prepaidBalance > 0
                ? `S$${(prepaidBalance / 100).toFixed(0)}`
                : "0"}
            </p>
            <p className="text-[10px] font-medium text-slate-600 mt-1">
              {zh ? "预付余额" : "Prepaid"}
            </p>
          </Link>
          <Link
            href="/wallet"
            className="text-center bg-white rounded-xl py-2.5 px-1 shadow-sm active:scale-[0.98] transition-transform"
          >
            <p className="text-lg font-bold text-[#1A6EFF] tabular-nums leading-none flex items-center justify-center gap-0.5">
              <Trophy size={15} className="text-amber-500 shrink-0" />
              {drawEntries}
            </p>
            <p className="text-[10px] font-medium text-slate-600 mt-1">
              {zh ? "抽奖资格" : "Draws"}
            </p>
          </Link>
        </div>
      </div>

      {/* 我的权益：主路径 */}
      <div className="px-4 mt-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          {zh ? "我的权益" : "My perks"}
        </h3>
        <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
          {zh
            ? "对应门店活动：满赠权益 · 预付长期券 · 大奖资格"
            : "Maps to store activities: gifts · prepaid · draw entries"}
        </p>
        <div className="space-y-2">
          {assetMenus.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href + item.title} href={item.href}>
                <Card className="hover:border-primary/30 transition-colors active:scale-[0.99]">
                  <CardContent className="p-3.5 flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
                      <Icon size={20} strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {item.title}
                        </p>
                        {item.meta && (
                          <span className="text-[11px] font-medium text-primary tabular-nums shrink-0">
                            {item.meta}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {item.desc}
                      </p>
                    </div>
                    <ChevronRight
                      size={16}
                      className="text-muted-foreground shrink-0"
                    />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* 日常：签到（次要） */}
      <div className="px-4 mt-5">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          {zh ? "日常" : "Daily"}
        </h3>
        <DailyCheckIn />
        {(user.streakDays > 0 || checkInCount > 0 || giftTotal > 0) && (
          <p className="text-[10px] text-muted-foreground mt-2 px-0.5">
            {zh
              ? `连续签到 ${user.streakDays} 天 · 累计 ${checkInCount} 次 · 历史领券 ${giftTotal}`
              : `Streak ${user.streakDays}d · ${checkInCount} check-ins · ${giftTotal} claims`}
            {inviteCount > 0
              ? zh
                ? ` · 邀请 ${inviteCount}`
                : ` · ${inviteCount} invites`
              : ""}
          </p>
        )}
      </div>

      {/* 徽章：有则展示，无则一行轻提示 */}
      <div className="px-4 mt-5">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          {zh ? "徽章" : "Badges"}{" "}
          <span className="text-muted-foreground font-normal text-xs">
            ({userBadges.length}/12)
          </span>
        </h3>
        {userBadges.length > 0 ? (
          <div className="grid grid-cols-6 gap-2">
            {userBadges.map((ub) => (
              <div key={ub.id} className="text-center">
                <div className="w-10 h-10 mx-auto rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-100 dark:border-amber-800/50 flex items-center justify-center text-lg">
                  {ub.badge.icon}
                </div>
                <p className="text-[9px] text-muted-foreground mt-1 truncate">
                  {ub.badge.name}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground rounded-xl bg-muted/40 px-3 py-2.5">
            {zh
              ? "签到、到店消费后可获得徽章（可选玩法）"
              : "Optional · earn badges via check-in & visits"}
          </p>
        )}
      </div>

      {/* 邀请 */}
      <div className="px-4 mt-5">
        <ProfileReferral />
      </div>

      {/* 工具：推广等 */}
      <div className="px-4 mt-5">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          {zh ? "更多工具" : "More tools"}
        </h3>
        <div className="space-y-2">
          {toolMenus.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <Card className="hover:border-border transition-colors">
                  <CardContent className="p-3.5 flex items-center gap-3">
                    <Icon
                      size={20}
                      className="text-muted-foreground shrink-0"
                      strokeWidth={1.8}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {item.desc}
                      </p>
                    </div>
                    <ChevronRight
                      size={16}
                      className="text-muted-foreground shrink-0"
                    />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* 外观（顶栏已有切换，这里保留完整三选） */}
      <div className="px-4 mt-5">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          {zh ? "外观" : "Appearance"}
        </h3>
        <Card className="border-border">
          <CardContent className="p-3">
            <ThemeSwitcher />
          </CardContent>
        </Card>
      </div>

      <div className="px-4 mt-6 pb-4 space-y-3">
        <LogoutButton
          label={zh ? "退出登录" : "Log out"}
          variant="outline"
        />
        <p className="text-center text-[10px] text-muted-foreground">
          {t("profile.version", lang)}
        </p>
      </div>
    </div>
  );
}

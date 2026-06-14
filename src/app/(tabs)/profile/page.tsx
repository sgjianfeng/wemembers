import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPoints } from "@/lib/utils";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import Link from "next/link";
import { ProfileReferral } from "./ProfileReferral";

export default async function ProfilePage() {
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { tokenAccount: { select: { balance: true } } },
  });
  if (!user) redirect("/auth/login");

  const userBadges = await prisma.userBadge.findMany({
    where: { userId: session.userId },
    include: { badge: true },
    orderBy: { earnedAt: "desc" },
    take: 12,
  });

  const [claimCount, redeemCount, inviteCount] = await Promise.all([
    prisma.customerCoupon.count({ where: { customerId: session.userId } }),
    prisma.redemptionLog.count({ where: { customerId: session.userId } }),
    prisma.referral.count({ where: { referrerId: session.userId } }),
  ]);

  const checkInCount = await prisma.checkIn.count({ where: { userId: session.userId } });

  const tierLabels: Record<string, { label: { zh: string; en: string }; color: "slate" | "amber" | "purple" }> = {
    regular: { label: { zh: "普通会员", en: "Regular" }, color: "slate" },
    silver: { label: { zh: "银卡会员", en: "Silver" }, color: "slate" },
    gold: { label: { zh: "金卡会员", en: "Gold" }, color: "amber" },
    platinum: { label: { zh: "铂金会员", en: "Platinum" }, color: "purple" },
  };
  const tier = tierLabels[user.membershipTier] || tierLabels.regular;

  const statLabels = [
    { v: user.streakDays, l: { zh: "连续签到", en: "Streak" } },
    { v: checkInCount, l: { zh: "累计签到", en: "Total" } },
    { v: claimCount, l: { zh: "领券", en: "Claims" } },
    { v: inviteCount, l: { zh: "邀请", en: "Invites" } },
  ];

  return (
    <div className="pb-4">
      <div className="px-4 pt-6 pb-4 bg-gradient-to-b from-[#1A6EFF] to-white">
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold text-white">{(user.displayName || "U").charAt(0)}</div>
          <div className="text-white">
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold">{user.displayName || user.phone || (lang === "zh" ? "用户" : "User")}</p>
              <Badge variant="slate" size="sm" className="!bg-white/20 !text-white">{tier.label[lang]}</Badge>
            </div>
            <p className="text-sm text-white/70 mt-0.5">⭐ {formatPoints(user.pointsBalance)} {lang === "zh" ? "积分" : "pts"}</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 mt-4">
          {statLabels.map((s) => (
            <div key={s.l.zh} className="text-center bg-white/60 rounded-lg py-2">
              <p className="text-base font-bold text-slate-900">{s.v}</p>
              <p className="text-[10px] text-slate-500">{s.l[lang]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 mt-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">🏅 {lang === "zh" ? "我的徽章" : "My Badges"} ({userBadges.length}/12)</h3>
        {userBadges.length > 0 ? (
          <div className="grid grid-cols-6 gap-2">
            {userBadges.map((ub) => (
              <div key={ub.id} className="text-center">
                <div className="w-10 h-10 mx-auto rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-lg">{ub.badge.icon}</div>
                <p className="text-[9px] text-slate-500 mt-1 truncate">{ub.badge.name}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 bg-slate-50 rounded-xl">
            <p className="text-xs text-slate-400">{lang === "zh" ? "还没有徽章，去领券签到获取吧！" : "No badges yet — claim vouchers and check in!"}</p>
          </div>
        )}
      </div>

      <div className="px-4 mt-4">
        <Link href="/promoter">
          <Card className="border-dashed border-green-200 bg-gradient-to-r from-green-50 to-emerald-50">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">💸</span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{t("profile.promoter", lang)}</p>
                  <p className="text-xs text-slate-500">{t("profile.promoterDesc", lang)}</p>
                </div>
              </div>
              <span className="text-slate-300">→</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="px-4 mt-4"><ProfileReferral /></div>

      {user.tokenAccount && (
        <div className="px-4 mt-4">
          <Card>
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2"><span className="text-lg">🪙</span><span className="text-sm text-slate-600">{t("profile.tokenBalance", lang)}</span></div>
              <span className="text-sm font-semibold text-amber-600">{user.tokenAccount.balance.toLocaleString()}</span>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="px-4 mt-6 pb-4">
        <form action="/auth/login" className="text-center">
          <span className="text-xs text-slate-300">{t("profile.version", lang)}</span>
        </form>
      </div>
    </div>
  );
}

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPoints } from "@/lib/utils";
import Link from "next/link";
import { ProfileReferral } from "./ProfileReferral";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { tokenAccount: { select: { balance: true } } },
  });
  if (!user) redirect("/auth/login");

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
    regular: { label: "普通会员", color: "slate" }, silver: { label: "银卡会员", color: "slate" },
    gold: { label: "金卡会员", color: "amber" }, platinum: { label: "铂金会员", color: "purple" },
  };
  const tier = tierLabels[user.membershipTier] || tierLabels.regular;

  return (
    <div className="pb-4">
      {/* 头像 + 等级 */}
      <div className="px-4 pt-6 pb-4 bg-gradient-to-b from-[#1A6EFF] to-white">
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold text-white">
            {(user.displayName || "用").charAt(0)}
          </div>
          <div className="text-white">
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold">{user.displayName || user.phone || "用户"}</p>
              <Badge variant="slate" size="sm" className="!bg-white/20 !text-white">{tier.label}</Badge>
            </div>
            <p className="text-sm text-white/70 mt-0.5">⭐ {formatPoints(user.pointsBalance)} 积分</p>
          </div>
        </div>

        {/* 统计小格 */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          {[{ v: user.streakDays, l: "连续签到" },{ v: checkInCount, l: "累计签到" },{ v: claimCount, l: "领券" },{ v: inviteCount, l: "邀请" }].map(s => (
            <div key={s.l} className="text-center bg-white/60 rounded-lg py-2">
              <p className="text-base font-bold text-slate-900">{s.v}</p>
              <p className="text-[10px] text-slate-500">{s.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 徽章 */}
      <div className="px-4 mt-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">🏅 我的徽章 ({userBadges.length}/12)</h3>
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
            <p className="text-xs text-slate-400">还没有徽章，去领券签到获取吧！</p>
          </div>
        )}
      </div>

      {/* 推广赚钱 */}
      <div className="px-4 mt-4">
        <Link href="/promoter">
          <Card className="border-dashed border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 hover:border-green-300 transition-colors">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">💸</span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">推广赚钱</p>
                  <p className="text-xs text-slate-500">分享代金券 · 赚取佣金 · 随时提现</p>
                </div>
              </div>
              <span className="text-slate-300">→</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* 邀请好友 */}
      <div className="px-4 mt-4">
        <ProfileReferral />
      </div>

      {/* Token 余额 */}
      {user.tokenAccount && (
        <div className="px-4 mt-4">
          <Card>
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🪙</span>
                <span className="text-sm text-slate-600">Token 余额</span>
              </div>
              <span className="text-sm font-semibold text-amber-600">{user.tokenAccount.balance.toLocaleString()}</span>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 登出 */}
      <div className="px-4 mt-6 pb-4">
        <form action="/auth/login" className="text-center">
          <span className="text-xs text-slate-300">v0.1.0 · WeMembers</span>
        </form>
      </div>
    </div>
  );
}

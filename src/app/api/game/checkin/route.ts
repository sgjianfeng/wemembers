import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// 签到奖励配置: [连续天数] = 积分
const rewards = [5, 5, 10, 10, 10, 15, 20, 25, 25, 30, 30, 35, 40, 45, 50, 50, 60, 70, 80, 100, 100, 120, 140, 160, 180, 200, 220, 250, 300, 500];
// 3天额外+10, 7天额外+30, 15天额外+80, 30天额外+200

function getBonus(day: number): number {
  if (day >= 30) return 200;
  if (day >= 15) return 80;
  if (day >= 7) return 30;
  if (day >= 3) return 10;
  return 0;
}

// POST /api/game/checkin — 每日签到
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const user = await prisma.user.findUnique({ where: { id: session.userId } });

  // 检查今天是否已签到
  const existing = await prisma.checkIn.findUnique({
    where: { userId_date: { userId: session.userId, date: today } },
  });
  if (existing) {
    return NextResponse.json({ error: "今天已签到", data: { alreadyChecked: true, streak: user?.streakDays ?? 0 } }, { status: 400 });
  }

  // 计算连续天数
  let newStreak = 1;
  if (user?.lastCheckIn) {
    const lastDate = user.lastCheckIn.toISOString().slice(0, 10);
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    if (lastDate === yesterday.toISOString().slice(0, 10)) {
      newStreak = (user.streakDays || 0) + 1;
    }
    // 如果是同一天（已经签到）已在上面拦截；更早则重置
  }

  // 计算奖励
  const baseReward = rewards[Math.min(newStreak - 1, rewards.length - 1)] || 5;
  const bonus = getBonus(newStreak);
  const total = baseReward + bonus;

  // 事务：更新用户 + 记录签到
  await Promise.all([
    prisma.user.update({ where: { id: session.userId }, data: { streakDays: newStreak, lastCheckIn: new Date(), pointsBalance: { increment: total }, lifetimePoints: { increment: total } } }),
    prisma.checkIn.create({ data: { userId: session.userId, date: today, dayNumber: newStreak, bonus: total } }),
  ]);

  // 签到积分计入最近消费的商家
  let businessPointsEarned = 0;
  try {
    const lastRedemption = await prisma.redemptionLog.findFirst({
      where: { customerId: session.userId },
      orderBy: { redeemedAt: "desc" },
      select: { businessId: true },
    });

    if (lastRedemption) {
      const membership = await prisma.membership.findUnique({
        where: {
          businessId_customerId: {
            businessId: lastRedemption.businessId,
            customerId: session.userId,
          },
        },
      });

      if (membership) {
        const { addPointsLog } = await import("@/lib/points");
        await prisma.membership.update({
          where: { id: membership.id },
          data: { points: { increment: total } },
        });
        await addPointsLog({
          membershipId: membership.id,
          amount: total,
          type: "checkin",
          reason: `连续签到第${newStreak}天`,
        });
        businessPointsEarned = total;
      }
    }
  } catch {
    // 签到积分商家计入失败不影响主流程
  }

  return NextResponse.json({
    data: {
      streak: newStreak, reward: total, baseReward, bonus,
      nextMilestone: newStreak >= 30 ? null : newStreak < 3 ? { days: 3, bonus: 10 } : newStreak < 7 ? { days: 7, bonus: 30 } : newStreak < 15 ? { days: 15, bonus: 80 } : { days: 30, bonus: 200 },
      businessPointsEarned: businessPointsEarned > 0 ? businessPointsEarned : undefined,
    },
  });
}

// GET /api/game/checkin — 查询今日签到状态
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const [checkIn, user] = await Promise.all([
    prisma.checkIn.findUnique({ where: { userId_date: { userId: session.userId, date: today } } }),
    prisma.user.findUnique({ where: { id: session.userId }, select: { streakDays: true, lastCheckIn: true } }),
  ]);

  return NextResponse.json({
    data: { checkedToday: !!checkIn, streak: user?.streakDays ?? 0, lastCheckIn: user?.lastCheckIn },
  });
}

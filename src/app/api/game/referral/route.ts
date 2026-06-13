import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { grantTokens } from "@/lib/tokens";
import { v4 as uuidv4 } from "uuid";

// GET /api/game/referral — 我的推荐统计
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const [sent, received] = await Promise.all([
    prisma.referral.findMany({ where: { referrerId: session.userId }, include: { referred: { select: { displayName: true, phone: true, createdAt: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.referral.findMany({ where: { referredId: session.userId }, include: { referrer: { select: { displayName: true, phone: true } } } }),
  ]);

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { referralCode: true } });

  return NextResponse.json({
    data: {
      referralCode: user?.referralCode,
      invited: sent,
      invitedBy: received[0]?.referrer || null,
      count: sent.length,
      reward: sent.filter((r) => r.rewardGranted).length * 100, // 每个邀请奖励100积分
    },
  });
}

// POST /api/game/referral — 生成我的推荐码
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let user = await prisma.user.findUnique({ where: { id: session.userId } });

  if (!user?.referralCode) {
    const code = uuidv4().slice(0, 8).toUpperCase();
    user = await prisma.user.update({ where: { id: session.userId }, data: { referralCode: code } });
  }

  return NextResponse.json({ data: { referralCode: user.referralCode } });
}

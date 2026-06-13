import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/game/badges — 我的徽章
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const [allBadges, myBadges] = await Promise.all([
    prisma.badge.findMany({ orderBy: { rarity: "asc" } }),
    prisma.userBadge.findMany({ where: { userId: session.userId }, include: { badge: true } }),
  ]);

  const earnedKeys = new Set(myBadges.map((ub) => ub.badge.key));

  return NextResponse.json({
    data: {
      earned: myBadges.map((ub) => ({ ...ub.badge, earnedAt: ub.earnedAt })),
      all: allBadges.map((b) => ({ ...b, earned: earnedKeys.has(b.key), earnedAt: myBadges.find((ub) => ub.badgeId === b.id)?.earnedAt })),
      stats: { total: allBadges.length, earned: myBadges.length, percentage: Math.round((myBadges.length / allBadges.length) * 100) },
    },
  });
}

// 检查并发放徽章的工具函数 (被其他API调用)
export async function checkAndAwardBadge(userId: string, key: string): Promise<boolean> {
  const existing = await prisma.userBadge.findFirst({
    where: { userId, badge: { key } },
  });
  if (existing) return false;

  const badge = await prisma.badge.findUnique({ where: { key } });
  if (!badge) return false;

  await prisma.userBadge.create({ data: { userId, badgeId: badge.id } });
  return true;
}

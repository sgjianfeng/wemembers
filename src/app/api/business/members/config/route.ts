import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTierConfigs, TIER_BONUS_PERCENT_MAX } from "@/lib/points";

// GET /api/business/members/config
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const configs = await getTierConfigs(session.userId);
  return NextResponse.json({ data: configs });
}

// PUT /api/business/members/config
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { configs } = await request.json();
  if (!Array.isArray(configs) || configs.length !== 4) {
    return NextResponse.json({ error: "必须提供全部4个等级的配置" }, { status: 400 });
  }

  // 返现加成是商家的额外负债，必须有上限；单笔计提时还会再被总费率上限夹一次
  for (const c of configs) {
    const bonus = c.cashbackBonusPercent;
    if (bonus === undefined || bonus === null || bonus === "") continue;
    const n = Number(bonus);
    if (!Number.isFinite(n) || n < 0 || n > TIER_BONUS_PERCENT_MAX) {
      return NextResponse.json(
        { error: `等级返现加成需在 0 – ${TIER_BONUS_PERCENT_MAX} 个百分点之间` },
        { status: 400 }
      );
    }
  }

  const bonusOf = (c: { cashbackBonusPercent?: unknown }) => {
    const n = Number(c.cashbackBonusPercent ?? 0);
    return Number.isFinite(n) ? Math.max(0, Math.min(TIER_BONUS_PERCENT_MAX, n)) : 0;
  };

  await Promise.all(
    configs.map((c: { tier: string; name: string; pointsRequired: number; color?: string; benefits?: string; cashbackBonusPercent?: number }) =>
      prisma.membershipTierConfig.upsert({
        where: {
          businessId_tier: { businessId: session.userId, tier: c.tier },
        },
        create: {
          businessId: session.userId,
          tier: c.tier,
          name: c.name,
          pointsRequired: c.pointsRequired,
          color: c.color || null,
          benefits:
            typeof c.benefits === "string" ? c.benefits : JSON.stringify(c.benefits || []),
          cashbackBonusPercent: bonusOf(c),
        },
        update: {
          name: c.name,
          pointsRequired: c.pointsRequired,
          color: c.color || null,
          benefits:
            typeof c.benefits === "string" ? c.benefits : JSON.stringify(c.benefits || []),
          cashbackBonusPercent: bonusOf(c),
        },
      })
    )
  );

  return NextResponse.json({ data: { success: true } });
}

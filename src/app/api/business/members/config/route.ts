import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTierConfigs } from "@/lib/points";

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

  await Promise.all(
    configs.map((c: { tier: string; name: string; pointsRequired: number; color?: string; benefits?: string }) =>
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
        },
        update: {
          name: c.name,
          pointsRequired: c.pointsRequired,
          color: c.color || null,
          benefits:
            typeof c.benefits === "string" ? c.benefits : JSON.stringify(c.benefits || []),
        },
      })
    )
  );

  return NextResponse.json({ data: { success: true } });
}

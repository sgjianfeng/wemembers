import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/auth/me — 获取当前用户信息
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        tokenAccount: {
          select: { balance: true, totalEarned: true, totalSpent: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        id: user.id,
        role: user.role,
        displayName: user.displayName,
        email: user.email,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        businessName: user.businessName,
        businessLogo: user.businessLogo,
        businessCategory: user.businessCategory,
        businessSlug: user.businessSlug,
        pointsBalance: user.pointsBalance,
        lifetimePoints: user.lifetimePoints,
        membershipTier: user.membershipTier,
        status: user.status,
        tokenBalance: user.tokenAccount?.balance ?? 0,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("me error:", error);
    return NextResponse.json({ error: "获取用户信息失败" }, { status: 500 });
  }
}

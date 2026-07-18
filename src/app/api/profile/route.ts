import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/profile
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        role: true,
        displayName: true,
        email: true,
        phone: true,
        membershipTier: true,
        pointsBalance: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    return NextResponse.json({ data: user });
  } catch (error) {
    console.error("profile GET error:", error);
    return NextResponse.json({ error: "加载失败" }, { status: 500 });
  }
}

// PATCH /api/profile — customer/promoter display name
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    if (typeof body.displayName !== "string") {
      return NextResponse.json({ error: "请填写昵称" }, { status: 400 });
    }
    const displayName = body.displayName.trim().slice(0, 40);
    if (!displayName) {
      return NextResponse.json({ error: "昵称不能为空" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: session.userId },
      data: { displayName },
      select: {
        id: true,
        displayName: true,
        email: true,
        phone: true,
        role: true,
      },
    });

    return NextResponse.json({ data: user });
  } catch (error) {
    console.error("profile PATCH error:", error);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}

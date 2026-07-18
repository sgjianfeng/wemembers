import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";

// POST /api/auth/set-password
// Body: { password: string }
// 登录后设置 / 重置密码（客户与商家）
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    if (session.role === "admin") {
      return NextResponse.json(
        { error: "管理员账号仅支持验证码登录，无需设置密码" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const password = typeof body.password === "string" ? body.password : "";

    if (password.length < 6) {
      return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
    }
    if (password.length > 64) {
      return NextResponse.json({ error: "密码过长" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    await prisma.user.update({
      where: { id: session.userId },
      data: { passwordHash },
    });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("set-password error:", error);
    return NextResponse.json({ error: "设置密码失败" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { issueSession, verifyPassword, type AuthRole } from "@/lib/auth";

// POST /api/auth/login
// Body: { contact, password, rememberMe?, intentRole?: "customer"|"business" }
// 客户 / 商家 / 店员可用密码；管理员禁止密码登录
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const raw = typeof body.contact === "string" ? body.contact.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const rememberMe = Boolean(body.rememberMe);
    const intentRole =
      body.intentRole === "business" || body.intentRole === "customer"
        ? (body.intentRole as "customer" | "business")
        : null;

    if (!raw || !password) {
      return NextResponse.json({ error: "请输入账号和密码" }, { status: 400 });
    }

    const isEmail = raw.includes("@");
    const contact = isEmail ? raw.toLowerCase() : raw.replace(/\s+/g, "");

    const user = isEmail
      ? await prisma.user.findUnique({ where: { email: contact } })
      : await prisma.user.findUnique({ where: { phone: contact } });

    if (!user || user.status !== "active") {
      return NextResponse.json({ error: "账号不存在或已停用" }, { status: 404 });
    }

    if (user.role === "admin") {
      return NextResponse.json(
        { error: "管理员须使用验证码登录" },
        { status: 403 }
      );
    }

    // Tab 意图与账号角色校验，避免登错场景
    if (intentRole === "customer" && user.role !== "customer") {
      return NextResponse.json(
        { error: "该账号不是客户身份，请切换到「商家」标签" },
        { status: 403 }
      );
    }
    if (
      intentRole === "business" &&
      user.role !== "business" &&
      user.role !== "staff"
    ) {
      return NextResponse.json(
        { error: "该账号不是商家身份，请切换到「客户」标签" },
        { status: 403 }
      );
    }

    if (!user.passwordHash) {
      return NextResponse.json(
        { error: "该账号尚未设置密码，请使用验证码登录" },
        { status: 400 }
      );
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "密码错误" }, { status: 401 });
    }

    const role = user.role as AuthRole;
    const duration = await issueSession(
      {
        userId: user.id,
        role,
        storeId: role === "staff" ? user.storeId || undefined : undefined,
      },
      rememberMe
    );

    return NextResponse.json({
      data: {
        user: {
          id: user.id,
          role: user.role,
          displayName: user.displayName,
          email: user.email,
          phone: user.phone,
          businessName: user.businessName,
          pointsBalance: user.pointsBalance,
          membershipTier: user.membershipTier,
          hasPassword: true,
        },
        sessionDays: duration.labelDays,
      },
    });
  } catch (error) {
    console.error("login error:", error);
    return NextResponse.json({ error: "登录失败" }, { status: 500 });
  }
}

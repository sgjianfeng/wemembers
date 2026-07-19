import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { issueSession, type AuthRole } from "@/lib/auth";

// POST /api/auth/verify-code
// Body: { contact, code, purpose, rememberMe?, intentRole? }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = body.code as string;
    const purpose = body.purpose as string;
    const raw = typeof body.contact === "string" ? body.contact.trim() : "";
    const rememberMe = Boolean(body.rememberMe);
    const intentRole =
      body.intentRole === "admin" ||
      body.intentRole === "business" ||
      body.intentRole === "customer"
        ? (body.intentRole as "admin" | "business" | "customer")
        : null;

    if (!raw || !code || !purpose) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    const isEmail = raw.includes("@");
    const { normalizeSingaporePhone } = await import("@/lib/utils");
    const contact = isEmail
      ? raw.toLowerCase()
      : normalizeSingaporePhone(raw);

    const record = await prisma.verificationCode.findFirst({
      where: {
        contact,
        code,
        purpose,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      return NextResponse.json({ error: "验证码无效或已过期" }, { status: 400 });
    }

    if (record.attempts >= 5) {
      await prisma.verificationCode.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      return NextResponse.json({ error: "验证码已失效，请重新获取" }, { status: 400 });
    }

    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    if (purpose === "login") {
      const user = isEmail
        ? await prisma.user.findUnique({ where: { email: contact } })
        : await prisma.user.findUnique({ where: { phone: contact } });

      if (!user || user.status !== "active") {
        return NextResponse.json({ error: "账号不存在或已停用" }, { status: 404 });
      }

      // Tab 意图校验
      if (intentRole === "admin" && user.role !== "admin") {
        return NextResponse.json(
          { error: "该账号不是管理员，请切换标签" },
          { status: 403 }
        );
      }
      if (intentRole === "customer" && user.role !== "customer") {
        return NextResponse.json(
          { error: "该账号不是客户身份，请切换到对应标签" },
          { status: 403 }
        );
      }
      if (
        intentRole === "business" &&
        user.role !== "business" &&
        user.role !== "staff"
      ) {
        return NextResponse.json(
          { error: "该账号不是商家身份，请切换到对应标签" },
          { status: 403 }
        );
      }

      const role = user.role as AuthRole;
      // 管理员不可延长会话
      const effectiveRemember = role === "admin" ? false : rememberMe;
      const duration = await issueSession(
        {
          userId: user.id,
          role,
          storeId: role === "staff" ? user.storeId || undefined : undefined,
        },
        effectiveRemember
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
            hasPassword: Boolean(user.passwordHash),
          },
          sessionDays: duration.labelDays,
        },
      });
    }

    return NextResponse.json({
      data: { verified: true, message: "验证通过" },
    });
  } catch (error) {
    console.error("verify-code error:", error);
    return NextResponse.json({ error: "验证失败" }, { status: 500 });
  }
}

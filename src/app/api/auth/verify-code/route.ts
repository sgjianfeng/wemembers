import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signToken, setSession } from "@/lib/auth";

// POST /api/auth/verify-code
// Body: { contact: string, code: string, purpose: "login"|"register" }
// Returns JWT and sets cookie
export async function POST(request: NextRequest) {
  try {
    const { contact, code, purpose } = await request.json();

    if (!contact || !code || !purpose) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    // 查找验证码
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

    // 检查尝试次数
    if (record.attempts >= 5) {
      await prisma.verificationCode.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      return NextResponse.json({ error: "验证码已失效，请重新获取" }, { status: 400 });
    }

    // 更新尝试次数 (不是这次,是之前)
    // 标记已使用
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    // 如果是 login: 查找用户并签发 JWT
    if (purpose === "login") {
      const isEmail = contact.includes("@");
      const user = isEmail
        ? await prisma.user.findUnique({ where: { email: contact } })
        : await prisma.user.findUnique({ where: { phone: contact } });

      if (!user || user.status !== "active") {
        return NextResponse.json({ error: "账号不存在或已停用" }, { status: 404 });
      }

      const token = await signToken({
        userId: user.id,
        role: user.role as "admin" | "business" | "customer",
      });

      await setSession(token);

      return NextResponse.json({
        data: {
          token,
          user: {
            id: user.id,
            role: user.role,
            displayName: user.displayName,
            email: user.email,
            phone: user.phone,
            businessName: user.businessName,
            pointsBalance: user.pointsBalance,
            membershipTier: user.membershipTier,
          },
        },
      });
    }

    // 如果是 register: 只验证码通过，不创建用户
    return NextResponse.json({
      data: { verified: true, message: "验证通过" },
    });
  } catch (error) {
    console.error("verify-code error:", error);
    return NextResponse.json({ error: "验证失败" }, { status: 500 });
  }
}

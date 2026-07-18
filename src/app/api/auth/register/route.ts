import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { issueSession } from "@/lib/auth";
import { SIGNUP_BONUS } from "@/types";

// POST /api/auth/register
// Body: { contact, code, role, displayName, password?, businessName?, businessCategory? }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contact, code, role, displayName, password, businessName, businessCategory } = body;

    if (!contact || !code || !role) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    // 再次验证验证码
    const record = await prisma.verificationCode.findFirst({
      where: {
        contact,
        code,
        purpose: "register",
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      return NextResponse.json({ error: "验证码无效或已过期" }, { status: 400 });
    }

    // 标记验证码已使用
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    // 判断是邮箱还是手机号
    const isEmail = contact.includes("@");

    // 检查唯一性
    if (isEmail) {
      const dup = await prisma.user.findUnique({ where: { email: contact } });
      if (dup) return NextResponse.json({ error: "该邮箱已注册" }, { status: 409 });
    } else {
      const dup = await prisma.user.findUnique({ where: { phone: contact } });
      if (dup) return NextResponse.json({ error: "该手机号已注册" }, { status: 409 });
    }

    // 生成 password hash (如果提供了)
    let passwordHash: string | null = null;
    if (password) {
      const { hashPassword } = await import("@/lib/auth");
      passwordHash = await hashPassword(password);
    }

    // 生成 business slug
    let businessSlug: string | null = null;
    if (role === "business" && businessName) {
      businessSlug = businessName
        .toLowerCase()
        .replace(/[^a-z0-9一-鿿]+/g, "-")
        .replace(/^-|-$/g, "")
        + "-" + Math.random().toString(36).substring(2, 6);
    }

    // 创建用户
    const user = await prisma.user.create({
      data: {
        role,
        email: isEmail ? contact : null,
        phone: isEmail ? null : contact,
        passwordHash,
        displayName: displayName || (isEmail ? contact.split("@")[0] : contact),
        businessName: role === "business" ? businessName : null,
        businessCategory: role === "business" ? businessCategory : null,
        businessSlug,
        pointsBalance: 0,
        lifetimePoints: 0,
        membershipTier: "regular",
      },
    });

    // 创建 Token 账户 + 发放注册奖励
    if (["business", "customer"].includes(role)) {
      const tokenAccount = await prisma.tokenAccount.create({
        data: {
          userId: user.id,
          balance: role === "business" ? SIGNUP_BONUS.business : SIGNUP_BONUS.customer,
          totalEarned: role === "business" ? SIGNUP_BONUS.business : SIGNUP_BONUS.customer,
        },
      });

      await prisma.tokenTransaction.create({
        data: {
          accountId: tokenAccount.id,
          amount: role === "business" ? SIGNUP_BONUS.business : SIGNUP_BONUS.customer,
          type: "signup_bonus",
          description: "新用户注册奖励",
          balanceAfter: role === "business" ? SIGNUP_BONUS.business : SIGNUP_BONUS.customer,
        },
      });
    }

    // 创建默认门店
    if (role === "business" && businessSlug) {
      await prisma.store.create({
        data: {
          businessId: user.id,
          name: businessName || "默认门店",
          slug: businessSlug,
        },
      });
    }

    // 为商家自动创建 Stripe Connected account (异步，不阻塞注册)
    if (role === "business") {
      try {
        const { createConnectedAccount } = await import("@/lib/stripe");
        const stripeAccountId = await createConnectedAccount(
          isEmail ? contact : `business-${user.id}@wemembers.com`,
          businessName || "商家"
        );
        await prisma.stripeAccount.create({
          data: { userId: user.id, stripeAccountId },
        });
      } catch (e) {
        console.error("Stripe account creation failed:", e);
        // 不阻塞注册
      }
    }

    // 签发 JWT（按角色默认时长；新用户不勾「记住」）
    await issueSession(
      {
        userId: user.id,
        role: user.role as "admin" | "business" | "customer" | "staff",
      },
      false
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
        },
      },
    });
  } catch (error) {
    console.error("register error:", error);
    return NextResponse.json({ error: "注册失败" }, { status: 500 });
  }
}

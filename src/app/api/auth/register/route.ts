import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { issueSession } from "@/lib/auth";

// POST /api/auth/register
// Body: { contact, code, role, displayName, password?, businessName?, businessUen?, businessCategory? }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawContact = typeof body.contact === "string" ? body.contact.trim() : "";
    const code = body.code as string;
    const role = body.role as string;
    const displayName =
      typeof body.displayName === "string" ? body.displayName.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const businessName =
      typeof body.businessName === "string" ? body.businessName.trim() : "";
    const businessCategory =
      typeof body.businessCategory === "string" ? body.businessCategory : "";
    const rawUen =
      typeof body.businessUen === "string" ? body.businessUen.trim() : "";

    if (!rawContact || !code || !role) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    const isEmail = rawContact.includes("@");
    const contact = isEmail ? rawContact.toLowerCase() : rawContact.replace(/\s+/g, "");

    let businessUen: string | null = null;
    if (role === "business") {
      if (!isEmail) {
        return NextResponse.json({ error: "企业账号请使用邮箱注册" }, { status: 400 });
      }
      if (!businessName) {
        return NextResponse.json({ error: "请填写公司名称" }, { status: 400 });
      }
      if (!password || password.length < 6) {
        return NextResponse.json({ error: "须设置至少 6 位密码" }, { status: 400 });
      }
      const { isValidSingaporeUen, normalizeUen } = await import("@/lib/utils");
      if (!rawUen || !isValidSingaporeUen(rawUen)) {
        return NextResponse.json(
          { error: "请填写有效的新加坡 UEN" },
          { status: 400 }
        );
      }
      businessUen = normalizeUen(rawUen);
      const uenTaken = await prisma.user.findUnique({
        where: { businessUen },
        select: { id: true },
      });
      if (uenTaken) {
        return NextResponse.json(
          { error: "该 UEN 已注册企业账号" },
          { status: 409 }
        );
      }
    }
    if (role === "customer" && isEmail) {
      return NextResponse.json({ error: "客户请使用手机号注册" }, { status: 400 });
    }
    if (password && password.length < 6) {
      return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
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

    // 生成英文唯一 slug（仅 a-z0-9-，便于 URL / 搜索 / 二维码）
    let businessSlug: string | null = null;
    if (role === "business" && businessName) {
      const { makeBusinessSlug } = await import("@/lib/utils");
      let candidate = makeBusinessSlug(businessName, isEmail ? contact : null);
      // 极低概率碰撞时再补随机
      for (let i = 0; i < 5; i++) {
        const exists = await prisma.user.findUnique({
          where: { businessSlug: candidate },
          select: { id: true },
        });
        if (!exists) break;
        candidate = makeBusinessSlug(businessName, isEmail ? contact : null);
      }
      businessSlug = candidate;
    }

    // 创建用户
    const user = await prisma.user.create({
      data: {
        role,
        email: isEmail ? contact : null,
        phone: isEmail ? null : contact,
        passwordHash,
        // 联系人姓名：客户可用展示名；商家优先用填写的联系人，否则空（邮箱单独字段）
        displayName:
          displayName ||
          (role === "business" ? null : isEmail ? contact.split("@")[0] : contact),
        businessName: role === "business" ? businessName : null,
        businessCategory: role === "business" ? businessCategory || null : null,
        businessSlug,
        businessUen,
        pointsBalance: 0,
        lifetimePoints: 0,
        membershipTier: "regular",
      },
    });

    // 创建现金钱包账户（分）：余额从 0 起
    if (["business", "customer"].includes(role)) {
      await prisma.tokenAccount.create({
        data: {
          userId: user.id,
          balance: 0,
          frozenBalance: 0,
          totalEarned: 0,
          totalSpent: 0,
        },
      });
    }

    // 企业注册不自动建门店：引导在后台「门店」添加（多店架构）

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

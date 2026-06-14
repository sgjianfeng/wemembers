import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createConnectedAccount, createAccountLink, getAccountStatus } from "@/lib/stripe";

// GET /api/stripe/account — 获取账户状态
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  let stripeAccount = await prisma.stripeAccount.findUnique({
    where: { userId: session.userId },
  });

  if (stripeAccount) {
    // 刷新状态
    const status = await getAccountStatus(stripeAccount.stripeAccountId);
    stripeAccount = await prisma.stripeAccount.update({
      where: { userId: session.userId },
      data: {
        chargesEnabled: status.chargesEnabled,
        payoutsEnabled: status.payoutsEnabled,
        detailsSubmitted: status.detailsSubmitted,
      },
    });
  }

  return NextResponse.json({
    data: stripeAccount
      ? {
          stripeAccountId: stripeAccount.stripeAccountId,
          chargesEnabled: stripeAccount.chargesEnabled,
          payoutsEnabled: stripeAccount.payoutsEnabled,
          detailsSubmitted: stripeAccount.detailsSubmitted,
        }
      : null,
  });
}

// POST /api/stripe/account — 创建/获取 onboarding 链接
export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, businessName: true },
  });

  // 获取或创建 Stripe Connected account
  let stripeAccount = await prisma.stripeAccount.findUnique({
    where: { userId: session.userId },
  });

  if (!stripeAccount?.stripeAccountId) {
    const accountId = await createConnectedAccount(
      user?.email || `business-${session.userId}@wemembers.com`,
      user?.businessName || "商家"
    );

    stripeAccount = await prisma.stripeAccount.create({
      data: {
        userId: session.userId,
        stripeAccountId: accountId,
      },
    });

    // 在 Stripe 上标记 userId
    // await stripe.accounts.update(accountId, { metadata: { userId: session.userId } });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const accountLink = await createAccountLink(
    stripeAccount.stripeAccountId,
    `${origin}/business/tokens?onboarding=refresh`,
    `${origin}/business/tokens?onboarding=success`
  );

  return NextResponse.json({ data: { url: accountLink } });
}

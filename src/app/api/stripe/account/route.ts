import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  createConnectedAccount,
  createAccountLink,
  getAccountStatus,
} from "@/lib/stripe";

export const dynamic = "force-dynamic";

function isStripeModeMismatch(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /test mode|live mode|testmode|livemode|test account|platform account/i.test(
      msg
    ) || /No such account/i.test(msg)
  );
}

// GET /api/stripe/account — 获取账户状态
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "无权操作" }, { status: 403 });
    }

    let stripeAccount = await prisma.stripeAccount.findUnique({
      where: { userId: session.userId },
    });

    if (stripeAccount) {
      try {
        const status = await getAccountStatus(stripeAccount.stripeAccountId);
        stripeAccount = await prisma.stripeAccount.update({
          where: { userId: session.userId },
          data: {
            chargesEnabled: status.chargesEnabled,
            payoutsEnabled: status.payoutsEnabled,
            detailsSubmitted: status.detailsSubmitted,
          },
        });
      } catch (e) {
        // Test/Live 错配等：状态刷新失败时仍返回 DB 快照，避免整页挂掉
        console.error("stripe account GET refresh:", e);
      }
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
  } catch (error) {
    console.error("stripe account GET:", error);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

// POST /api/stripe/account — 创建/获取 onboarding 链接
export async function POST() {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "无权操作" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true, businessName: true },
    });

    const email =
      user?.email || `business-${session.userId}@wemembers.com`;
    const businessName = user?.businessName || "商家";

    let stripeAccount = await prisma.stripeAccount.findUnique({
      where: { userId: session.userId },
    });

    async function createAndSave() {
      const accountId = await createConnectedAccount(email, businessName);
      if (stripeAccount) {
        return prisma.stripeAccount.update({
          where: { userId: session.userId },
          data: {
            stripeAccountId: accountId,
            chargesEnabled: false,
            payoutsEnabled: false,
            detailsSubmitted: false,
          },
        });
      }
      return prisma.stripeAccount.create({
        data: {
          userId: session.userId,
          stripeAccountId: accountId,
        },
      });
    }

    if (!stripeAccount?.stripeAccountId) {
      stripeAccount = await createAndSave();
    } else {
      // 校验账号在当前密钥模式下仍可用（Test→Live 切换后旧 acct 会失效）
      try {
        await getAccountStatus(stripeAccount.stripeAccountId);
      } catch (e) {
        if (isStripeModeMismatch(e)) {
          console.warn(
            "stripe account mode mismatch, recreating Connect account",
            stripeAccount.stripeAccountId
          );
          stripeAccount = await createAndSave();
        } else {
          throw e;
        }
      }
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || "https://wemembers.store";

    let accountLink: string;
    try {
      accountLink = await createAccountLink(
        stripeAccount.stripeAccountId,
        `${origin}/business/tokens?onboarding=refresh`,
        `${origin}/business/tokens?onboarding=success`
      );
    } catch (e) {
      // 创建链接仍失败（常见：test acct + live key）→ 重建一次
      if (isStripeModeMismatch(e)) {
        console.warn("accountLinks mode mismatch, recreating", e);
        stripeAccount = await createAndSave();
        accountLink = await createAccountLink(
          stripeAccount.stripeAccountId,
          `${origin}/business/tokens?onboarding=refresh`,
          `${origin}/business/tokens?onboarding=success`
        );
      } else {
        throw e;
      }
    }

    return NextResponse.json({ data: { url: accountLink } });
  } catch (error) {
    console.error("stripe account POST:", error);
    const msg =
      error instanceof Error ? error.message : "创建收款账户链接失败";
    return NextResponse.json(
      {
        error: msg.includes("live mode") || msg.includes("test mode")
          ? "Stripe 测试/正式模式不一致，请重试；若仍失败请联系管理员"
          : msg.slice(0, 200),
      },
      { status: 500 }
    );
  }
}

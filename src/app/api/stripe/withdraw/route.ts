import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createTransfer, MIN_WITHDRAWAL_CENTS } from "@/lib/stripe";

// POST /api/stripe/withdraw — 提现
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { amountCents } = await request.json();
  if (!amountCents || amountCents < MIN_WITHDRAWAL_CENTS) {
    return NextResponse.json(
      { error: `提现金额至少 S$${(MIN_WITHDRAWAL_CENTS / 100).toFixed(0)}` },
      { status: 400 }
    );
  }

  // 查余额
  const account = await prisma.tokenAccount.findUnique({
    where: { userId: session.userId },
  });
  if (!account || account.balance < amountCents) {
    return NextResponse.json({ error: "可用余额不足" }, { status: 400 });
  }

  // 查 Stripe 账户
  const stripeAccount = await prisma.stripeAccount.findUnique({
    where: { userId: session.userId },
  });
  if (!stripeAccount || !stripeAccount.chargesEnabled) {
    return NextResponse.json(
      { error: "提现前请先完成收款账户设置" },
      { status: 400 }
    );
  }

  try {
    // Stripe Transfer
    await createTransfer({
      amountCents,
      stripeAccountId: stripeAccount.stripeAccountId,
      description: "WeMembers 余额提现",
    });

    // 扣余额
    const updated = await prisma.tokenAccount.update({
      where: { userId: session.userId },
      data: {
        balance: { decrement: amountCents },
        totalSpent: { increment: amountCents },
      },
    });

    await prisma.tokenTransaction.create({
      data: {
        accountId: updated.id,
        amount: -amountCents,
        type: "withdrawal",
        description: `提现 S$${(amountCents / 100).toFixed(2)}`,
        balanceAfter: updated.balance,
      },
    });

    return NextResponse.json({
      data: {
        success: true,
        amount: amountCents / 100,
        balance: updated.balance,
      },
    });
  } catch (error: any) {
    console.error("withdrawal error:", error);
    return NextResponse.json(
      { error: error?.message || "提现失败" },
      { status: 500 }
    );
  }
}

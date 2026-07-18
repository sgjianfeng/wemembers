import { prisma } from "@/lib/db";

/** Next calendar day 00:00 UTC+8 (Singapore) — T+1 settlement unlock */
export function tPlusOneUnlockAt(from: Date = new Date()): Date {
  const sgt = new Date(from.getTime() + 8 * 60 * 60 * 1000);
  const y = sgt.getUTCFullYear();
  const m = sgt.getUTCMonth();
  const d = sgt.getUTCDate();
  // Next day 00:00 SGT = previous day 16:00 UTC
  return new Date(Date.UTC(y, m, d + 1, 0, 0, 0) - 8 * 60 * 60 * 1000);
}

/**
 * Credit business cash income (cents) with T+1 freeze.
 * Goes to frozenBalance until availableAt; then releaseMaturedHolds moves to balance.
 */
export async function grantBusinessIncomeHold(
  userId: string,
  amountCents: number,
  type: string,
  description: string,
  referenceId?: string,
  availableAt?: Date
): Promise<{ success: boolean; balanceAfter: number; frozenAfter: number }> {
  if (amountCents <= 0) {
    const account = await prisma.tokenAccount.findUnique({ where: { userId } });
    return {
      success: true,
      balanceAfter: account?.balance ?? 0,
      frozenAfter: account?.frozenBalance ?? 0,
    };
  }

  let account = await prisma.tokenAccount.findUnique({ where: { userId } });
  if (!account) {
    account = await prisma.tokenAccount.create({
      data: { userId, balance: 0, frozenBalance: 0, totalEarned: 0, totalSpent: 0 },
    });
  }

  const unlockAt = availableAt ?? tPlusOneUnlockAt();
  const updated = await prisma.tokenAccount.update({
    where: { userId },
    data: {
      frozenBalance: { increment: amountCents },
      totalEarned: { increment: amountCents },
    },
  });

  await prisma.tokenTransaction.create({
    data: {
      accountId: account.id,
      amount: amountCents,
      type,
      description,
      referenceId,
      balanceAfter: updated.balance,
      availableAt: unlockAt,
      releasedAt: null,
    },
  });

  return {
    success: true,
    balanceAfter: updated.balance,
    frozenAfter: updated.frozenBalance,
  };
}

/** Move matured T+1 holds from frozenBalance → balance. Safe to call often. */
export async function releaseMaturedHolds(userId: string): Promise<number> {
  const account = await prisma.tokenAccount.findUnique({ where: { userId } });
  if (!account || account.frozenBalance <= 0) return 0;

  const now = new Date();
  const holds = await prisma.tokenTransaction.findMany({
    where: {
      accountId: account.id,
      amount: { gt: 0 },
      availableAt: { lte: now },
      releasedAt: null,
      type: {
        in: [
          "voucher_redeem_income",
          "voucher_spend_income",
          "seller_commission",
          "platform_fee",
          "settlement_earn",
          "voucher_withdraw",
        ],
      },
    },
    orderBy: { availableAt: "asc" },
  });

  let released = 0;
  let frozenLeft = account.frozenBalance;
  let balanceNow = account.balance;

  for (const hold of holds) {
    if (hold.amount > frozenLeft) break;
    balanceNow += hold.amount;
    frozenLeft -= hold.amount;
    await prisma.$transaction([
      prisma.tokenAccount.update({
        where: { id: account.id },
        data: {
          frozenBalance: { decrement: hold.amount },
          balance: { increment: hold.amount },
        },
      }),
      prisma.tokenTransaction.update({
        where: { id: hold.id },
        data: { releasedAt: now },
      }),
      prisma.tokenTransaction.create({
        data: {
          accountId: account.id,
          amount: hold.amount,
          type: "t1_release",
          description: `T+1 解冻 · ${hold.description}`,
          referenceId: hold.id,
          balanceAfter: balanceNow,
        },
      }),
    ]);
    released += hold.amount;
  }

  return released;
}

// Token 消耗
export async function spendTokens(
  userId: string,
  amount: number,
  type: string,
  description: string,
  referenceId?: string
): Promise<{ success: boolean; balanceAfter: number; error?: string }> {
  const account = await prisma.tokenAccount.findUnique({ where: { userId } });
  if (!account || account.balance < amount) {
    return { success: false, balanceAfter: account?.balance ?? 0, error: "Token 余额不足" };
  }

  await prisma.tokenAccount.update({
    where: { userId },
    data: { balance: { decrement: amount }, totalSpent: { increment: amount } },
  });

  await prisma.tokenTransaction.create({
    data: {
      accountId: account.id,
      amount: -amount,
      type,
      description,
      referenceId,
      balanceAfter: account.balance - amount,
    },
  });

  return { success: true, balanceAfter: account.balance - amount };
}

// Token 发放
export async function grantTokens(
  userId: string,
  amount: number,
  type: string,
  description: string,
  referenceId?: string
): Promise<{ success: boolean; balanceAfter: number }> {
  let account = await prisma.tokenAccount.findUnique({ where: { userId } });

  if (!account) {
    account = await prisma.tokenAccount.create({
      data: { userId, balance: 0, totalEarned: 0, totalSpent: 0 },
    });
  }

  await prisma.tokenAccount.update({
    where: { userId },
    data: { balance: { increment: amount }, totalEarned: { increment: amount } },
  });

  await prisma.tokenTransaction.create({
    data: {
      accountId: account.id,
      amount,
      type,
      description,
      referenceId,
      balanceAfter: account.balance + amount,
    },
  });

  return { success: true, balanceAfter: account.balance + amount };
}

// 获取余额
export async function getTokenBalance(userId: string): Promise<number> {
  const account = await prisma.tokenAccount.findUnique({ where: { userId } });
  return account?.balance ?? 0;
}

// 检查余额是否充足
export async function hasEnoughTokens(userId: string, amount: number): Promise<boolean> {
  const balance = await getTokenBalance(userId);
  return balance >= amount;
}

// 获取流水
export async function getTokenTransactions(
  userId: string,
  options?: { type?: string; cursor?: string; limit?: number }
) {
  const account = await prisma.tokenAccount.findUnique({ where: { userId } });
  if (!account) return { transactions: [], hasMore: false };

  const limit = options?.limit ?? 20;
  const where: any = { accountId: account.id };
  if (options?.type) where.type = options.type;

  const transactions = await prisma.tokenTransaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(options?.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
  });

  const hasMore = transactions.length > limit;
  if (hasMore) transactions.pop();

  return { transactions, hasMore, cursor: transactions[transactions.length - 1]?.id };
}

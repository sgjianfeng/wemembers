import { prisma } from "@/lib/db";

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

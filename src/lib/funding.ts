/**
 * Funding helpers — Stripe top-up credit & withdraw prechecks.
 * Extracted for unit tests without calling live Stripe.
 */
import { prisma } from "@/lib/db";
import { MIN_WITHDRAWAL_CENTS } from "@/lib/stripe";
import { releaseMaturedHolds } from "@/lib/tokens";

export interface TopupResult {
  alreadyApplied: boolean;
  accountId: string;
  balance: number;
  creditedCents: number;
}

/** Credit TokenAccount after successful Stripe Checkout (top-up). Idempotent via session id. */
export async function applyStripeTopupCredit(params: {
  userId: string;
  amountCents: number;
  stripeSessionId?: string | null;
}): Promise<TopupResult> {
  const amountCents = Math.max(0, Math.round(params.amountCents));
  if (amountCents <= 0) {
    throw new Error("invalid_topup_amount");
  }

  if (params.stripeSessionId) {
    const existing = await prisma.tokenTransaction.findFirst({
      where: {
        type: "stripe_topup",
        referenceId: params.stripeSessionId,
      },
    });
    if (existing) {
      const acct = await prisma.tokenAccount.findUnique({
        where: { userId: params.userId },
      });
      return {
        alreadyApplied: true,
        accountId: existing.accountId,
        balance: acct?.balance ?? existing.balanceAfter,
        creditedCents: 0,
      };
    }
  }

  const tokenAccount = await prisma.tokenAccount.upsert({
    where: { userId: params.userId },
    create: {
      userId: params.userId,
      balance: amountCents,
      frozenBalance: 0,
      totalEarned: amountCents,
      totalSpent: 0,
    },
    update: {
      balance: { increment: amountCents },
      totalEarned: { increment: amountCents },
    },
  });

  await prisma.tokenTransaction.create({
    data: {
      accountId: tokenAccount.id,
      amount: amountCents,
      type: "stripe_topup",
      description: `Stripe 充值 S$${(amountCents / 100).toFixed(2)}`,
      referenceId: params.stripeSessionId || null,
      balanceAfter: tokenAccount.balance,
    },
  });

  return {
    alreadyApplied: false,
    accountId: tokenAccount.id,
    balance: tokenAccount.balance,
    creditedCents: amountCents,
  };
}

export type WithdrawPrecheckError =
  | "forbidden"
  | "min_amount"
  | "insufficient"
  | "insufficient_with_frozen"
  | "stripe_not_ready";

export interface WithdrawPrecheckOk {
  ok: true;
  amountCents: number;
  balance: number;
  stripeAccountId: string;
}

export interface WithdrawPrecheckFail {
  ok: false;
  code: WithdrawPrecheckError;
  message: string;
  status: number;
}

/** Validate business withdraw before calling Stripe Transfer. Releases matured T+1 holds first. */
export async function precheckBusinessWithdraw(params: {
  userId: string;
  role: string;
  amountCents: number;
}): Promise<WithdrawPrecheckOk | WithdrawPrecheckFail> {
  if (params.role !== "business") {
    return { ok: false, code: "forbidden", message: "无权操作", status: 403 };
  }

  const amountCents = Math.round(params.amountCents);
  if (!amountCents || amountCents < MIN_WITHDRAWAL_CENTS) {
    return {
      ok: false,
      code: "min_amount",
      message: `提现金额至少 S$${(MIN_WITHDRAWAL_CENTS / 100).toFixed(0)}`,
      status: 400,
    };
  }

  await releaseMaturedHolds(params.userId);

  const account = await prisma.tokenAccount.findUnique({
    where: { userId: params.userId },
  });
  if (!account || account.balance < amountCents) {
    const frozen = account?.frozenBalance ?? 0;
    return {
      ok: false,
      code: frozen > 0 ? "insufficient_with_frozen" : "insufficient",
      message:
        frozen > 0
          ? `可用余额不足（另有 S$${(frozen / 100).toFixed(2)} 冻结中，T+1 后可提）`
          : "可用余额不足",
      status: 400,
    };
  }

  const stripeAccount = await prisma.stripeAccount.findUnique({
    where: { userId: params.userId },
  });
  if (!stripeAccount || !stripeAccount.chargesEnabled) {
    return {
      ok: false,
      code: "stripe_not_ready",
      message: "提现前请先完成收款账户设置",
      status: 400,
    };
  }

  return {
    ok: true,
    amountCents,
    balance: account.balance,
    stripeAccountId: stripeAccount.stripeAccountId,
  };
}

/** Debit TokenAccount after successful Stripe Transfer. */
export async function applyBusinessWithdrawLedger(params: {
  userId: string;
  amountCents: number;
}): Promise<{ balance: number; amountSgd: number }> {
  const amountCents = Math.round(params.amountCents);
  const updated = await prisma.tokenAccount.update({
    where: { userId: params.userId },
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

  return { balance: updated.balance, amountSgd: amountCents / 100 };
}

/** Promoter cash-out (MVP ledger only — no real bank rail yet). */
export async function applyPromoterWithdraw(params: {
  userId: string;
  amountSgd: number;
  method?: string;
}): Promise<
  | { ok: true; amountSgd: number; method: string; newBalanceCents: number }
  | { ok: false; message: string; status: number }
> {
  const amountSgd = Number(params.amountSgd);
  if (!amountSgd || amountSgd <= 0) {
    return { ok: false, message: "请输入提现金额", status: 400 };
  }
  if (amountSgd < 10) {
    return { ok: false, message: "最低提现金额为 S$10.00", status: 400 };
  }

  const amountCents = Math.round(amountSgd * 100);
  const account = await prisma.promoterAccount.findUnique({
    where: { userId: params.userId },
  });
  if (!account) {
    return { ok: false, message: "请先开启推广模式", status: 400 };
  }
  if (account.availableBalance < amountCents) {
    return {
      ok: false,
      message: `可提现余额不足（可用 S$${(account.availableBalance / 100).toFixed(2)}）`,
      status: 400,
    };
  }

  const method = params.method || "paynow";
  await prisma.promoterAccount.update({
    where: { userId: params.userId },
    data: { availableBalance: { decrement: amountCents } },
  });
  await prisma.promoterEarning.updateMany({
    where: { promoterId: params.userId, status: "confirmed" },
    data: { status: "paid" },
  });

  return {
    ok: true,
    amountSgd,
    method,
    newBalanceCents: account.availableBalance - amountCents,
  };
}

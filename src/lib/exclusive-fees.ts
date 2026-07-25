/**
 * 独享：付款即扣 15%（小奖 3% + 服务费 2% + 大奖 10%）
 * - 线上：从支付切（调用方记 paid 与平台池；可不扣企业代币）
 * - 现金/实体：从企业 giftBalance → balance 扣
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  DEFAULT_BUSINESS_GIFT_CENTS,
  splitExclusiveSaleFees,
  type FeeSplit,
} from "@/lib/activity-fees";

type Tx = Prisma.TransactionClient;

export async function ensureBusinessTokenAccount(
  tx: Tx,
  businessId: string,
  withDefaultGift = false
) {
  let account = await tx.tokenAccount.findUnique({
    where: { userId: businessId },
  });
  if (!account) {
    account = await tx.tokenAccount.create({
      data: {
        userId: businessId,
        balance: 0,
        giftBalance: withDefaultGift ? DEFAULT_BUSINESS_GIFT_CENTS : 0,
        frozenBalance: 0,
        totalEarned: withDefaultGift ? DEFAULT_BUSINESS_GIFT_CENTS : 0,
        totalSpent: 0,
      },
    });
    if (withDefaultGift && DEFAULT_BUSINESS_GIFT_CENTS > 0) {
      await tx.tokenTransaction.create({
        data: {
          accountId: account.id,
          amount: DEFAULT_BUSINESS_GIFT_CENTS,
          type: "platform_gift",
          description: `平台赠送额度 S$${(DEFAULT_BUSINESS_GIFT_CENTS / 100).toFixed(0)}（不可提现）`,
          balanceAfter: account.balance,
        },
      });
    }
  }
  return account;
}

/** 可扣总额 = gift + 可提 balance */
export function spendableTokenCents(account: {
  balance: number;
  giftBalance: number;
}): number {
  return Math.max(0, account.balance) + Math.max(0, account.giftBalance);
}

/**
 * 从企业账户扣款：优先 gift（不可提），再 balance（可提）
 */
export async function debitBusinessTokens(
  tx: Tx,
  businessId: string,
  amountCents: number,
  opts: { type: string; description: string; referenceId?: string }
): Promise<{
  giftDebited: number;
  paidDebited: number;
  giftAfter: number;
  balanceAfter: number;
}> {
  const amount = Math.max(0, Math.round(amountCents));
  if (amount <= 0) {
    const a = await ensureBusinessTokenAccount(tx, businessId);
    return {
      giftDebited: 0,
      paidDebited: 0,
      giftAfter: a.giftBalance,
      balanceAfter: a.balance,
    };
  }

  const account = await ensureBusinessTokenAccount(tx, businessId);
  const gift = Math.max(0, account.giftBalance);
  const paid = Math.max(0, account.balance);
  if (gift + paid < amount) {
    throw new Error("INSUFFICIENT_TOKEN");
  }

  const giftDebited = Math.min(gift, amount);
  const paidDebited = amount - giftDebited;

  const updated = await tx.tokenAccount.update({
    where: { id: account.id },
    data: {
      giftBalance: { decrement: giftDebited },
      balance: { decrement: paidDebited },
      totalSpent: { increment: amount },
    },
  });

  await tx.tokenTransaction.create({
    data: {
      accountId: account.id,
      amount: -amount,
      type: opts.type,
      description: opts.description,
      referenceId: opts.referenceId || null,
      balanceAfter: updated.balance,
    },
  });

  return {
    giftDebited,
    paidDebited,
    giftAfter: updated.giftBalance,
    balanceAfter: updated.balance,
  };
}

/** 独享售出：扣企业代币 15% 并写入活动小奖池/大奖池 */
export async function applyExclusiveCashSaleFees(
  tx: Tx,
  params: {
    businessId: string;
    campaignId: string;
    faceCents: number;
    referenceId?: string;
    label?: string;
  }
): Promise<FeeSplit> {
  const split = splitExclusiveSaleFees(params.faceCents);
  if (split.totalCents <= 0) return split;

  await debitBusinessTokens(tx, params.businessId, split.totalCents, {
    type: "exclusive_sale_fee",
    description:
      params.label ||
      `独享活动扣点 15%（小奖3%+服务费2%+大奖10%）S$${(split.totalCents / 100).toFixed(2)}`,
    referenceId: params.referenceId,
  });

  await creditExclusivePools(tx, params.campaignId, split);
  return split;
}

/** 线上独享：支付已切 15%，只记账进池（不扣企业代币） */
export async function creditExclusivePools(
  tx: Tx,
  campaignId: string,
  split: FeeSplit
): Promise<void> {
  if (split.smallPrizeCents <= 0 && split.grandPoolCents <= 0) return;
  await tx.campaign.update({
    where: { id: campaignId },
    data: {
      instantPoolCents: { increment: split.smallPrizeCents },
      grandPoolCents: { increment: split.grandPoolCents },
    },
  });
}

export async function applyExclusiveOnlineSaleFees(
  tx: Tx,
  params: { campaignId: string; faceCents: number }
): Promise<FeeSplit> {
  const split = splitExclusiveSaleFees(params.faceCents);
  await creditExclusivePools(tx, params.campaignId, split);
  return split;
}

/** 非 transaction 包装：现金售出前预检 */
export async function canAffordExclusiveCash(
  businessId: string,
  faceCents: number
): Promise<{ ok: boolean; needCents: number; haveCents: number }> {
  const split = splitExclusiveSaleFees(faceCents);
  const account = await prisma.tokenAccount.findUnique({
    where: { userId: businessId },
  });
  const have = account
    ? spendableTokenCents(account)
    : 0;
  return {
    ok: have >= split.totalCents,
    needCents: split.totalCents,
    haveCents: have,
  };
}

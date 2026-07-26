/**
 * 独享：付款即扣 15%（小奖 3% + 服务费 2% + 大奖 10%）
 *
 * 资金安全：
 * - 真钱（线上支付切 / 企业可提现 balance 自充）→ 进小奖池+大奖池，小奖可进顾客余额
 * - 平台赠送 gift 参与扣款 → 不注水奖池、小奖不进余额（门店兑）、大奖权重降低
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  DEFAULT_BUSINESS_GIFT_CENTS,
  splitExclusiveSaleFees,
  type FeeSplit,
} from "@/lib/activity-fees";

type Tx = Prisma.TransactionClient;

/** gift 路径：大奖权重系数（仍给抽奖乐趣，弱进大奖） */
export const EXCLUSIVE_GIFT_WEIGHT_FACTOR = 0.2;

export type ExclusiveFundingMode = "paid" | "gift";

export type ExclusiveCashFeeResult = FeeSplit & {
  /** paid = 全部来自可提现余额；gift = 用到了平台赠送 */
  fundingMode: ExclusiveFundingMode;
  /** 是否把小奖加进顾客可花余额、是否注入平台奖池 */
  realPrizeFunding: boolean;
  weightFactor: number;
  giftDebited: number;
  paidDebited: number;
};

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
          description: `平台赠送额度 S$${(DEFAULT_BUSINESS_GIFT_CENTS / 100).toFixed(0)}（不可提现，不可注奖金池）`,
          balanceAfter: account.balance,
        },
      });
    }
  }
  return account;
}

export function spendableTokenCents(account: {
  balance: number;
  giftBalance: number;
}): number {
  return Math.max(0, account.balance) + Math.max(0, account.giftBalance);
}

/**
 * 扣款策略：
 * - 可提现 balance ≥ 应付 → 只扣 balance（真钱，可进池）
 * - 否则 gift+balance 够 → 先 gift 后 balance（含 gift，不进池）
 */
export async function debitBusinessTokensForExclusive(
  tx: Tx,
  businessId: string,
  amountCents: number,
  opts: { type: string; description: string; referenceId?: string }
): Promise<{
  giftDebited: number;
  paidDebited: number;
  fundingMode: ExclusiveFundingMode;
  giftAfter: number;
  balanceAfter: number;
}> {
  const amount = Math.max(0, Math.round(amountCents));
  const account = await ensureBusinessTokenAccount(tx, businessId);
  const gift = Math.max(0, account.giftBalance);
  const paid = Math.max(0, account.balance);

  if (amount <= 0) {
    return {
      giftDebited: 0,
      paidDebited: 0,
      fundingMode: "paid",
      giftAfter: gift,
      balanceAfter: paid,
    };
  }

  if (paid + gift < amount) {
    throw new Error("INSUFFICIENT_TOKEN");
  }

  let giftDebited = 0;
  let paidDebited = 0;
  let fundingMode: ExclusiveFundingMode;

  if (paid >= amount) {
    // 真钱路径：只动可提现余额
    paidDebited = amount;
    fundingMode = "paid";
  } else {
    // 含平台赠送：先 gift 再 balance
    giftDebited = Math.min(gift, amount);
    paidDebited = amount - giftDebited;
    fundingMode = "gift";
  }

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
      description:
        opts.description +
        (fundingMode === "gift"
          ? " · 含平台赠送（不注奖池/小奖门店兑）"
          : " · 企业自充（可进奖池）"),
      referenceId: opts.referenceId || null,
      balanceAfter: updated.balance,
    },
  });

  return {
    giftDebited,
    paidDebited,
    fundingMode,
    giftAfter: updated.giftBalance,
    balanceAfter: updated.balance,
  };
}

/** 独享现金/实体售出：扣 15%；仅真钱路径注入奖池 */
export async function applyExclusiveCashSaleFees(
  tx: Tx,
  params: {
    businessId: string;
    campaignId: string;
    faceCents: number;
    referenceId?: string;
    label?: string;
  }
): Promise<ExclusiveCashFeeResult> {
  const split = splitExclusiveSaleFees(params.faceCents);
  if (split.totalCents <= 0) {
    return {
      ...split,
      fundingMode: "paid",
      realPrizeFunding: true,
      weightFactor: 1,
      giftDebited: 0,
      paidDebited: 0,
    };
  }

  const debited = await debitBusinessTokensForExclusive(
    tx,
    params.businessId,
    split.totalCents,
    {
      type: "exclusive_sale_fee",
      description:
        params.label ||
        `独享活动扣点 15%（小奖3%+服务费2%+大奖10%）S$${(split.totalCents / 100).toFixed(2)}`,
      referenceId: params.referenceId,
    }
  );

  const realPrizeFunding = debited.fundingMode === "paid";
  if (realPrizeFunding) {
    await creditExclusivePools(tx, params.campaignId, split);
  }

  return {
    ...split,
    fundingMode: debited.fundingMode,
    realPrizeFunding,
    weightFactor: realPrizeFunding ? 1 : EXCLUSIVE_GIFT_WEIGHT_FACTOR,
    giftDebited: debited.giftDebited,
    paidDebited: debited.paidDebited,
  };
}

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

/** 线上：支付真钱，始终进池 */
export async function applyExclusiveOnlineSaleFees(
  tx: Tx,
  params: { campaignId: string; faceCents: number }
): Promise<ExclusiveCashFeeResult> {
  const split = splitExclusiveSaleFees(params.faceCents);
  await creditExclusivePools(tx, params.campaignId, split);
  return {
    ...split,
    fundingMode: "paid",
    realPrizeFunding: true,
    weightFactor: 1,
    giftDebited: 0,
    paidDebited: 0,
  };
}

export async function canAffordExclusiveCash(
  businessId: string,
  faceCents: number
): Promise<{
  ok: boolean;
  needCents: number;
  haveCents: number;
  paidCents: number;
  giftCents: number;
  canFullPrizeMode: boolean;
}> {
  const split = splitExclusiveSaleFees(faceCents);
  const account = await prisma.tokenAccount.findUnique({
    where: { userId: businessId },
  });
  const paid = account?.balance ?? 0;
  const gift = account?.giftBalance ?? 0;
  const have = paid + gift;
  return {
    ok: have >= split.totalCents,
    needCents: split.totalCents,
    haveCents: have,
    paidCents: paid,
    giftCents: gift,
    canFullPrizeMode: paid >= split.totalCents,
  };
}

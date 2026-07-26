/**
 * 独享：付款时费用
 *
 * 标准 15%：小奖 3% + 服务费 2% + 大奖 10%
 * 轻量 10%：小奖 3% + 服务费 2% + 大奖 5%
 *
 * 资金：
 * - 小奖+大奖 → 仅企业自充 balance；扣了才进池/小奖入余额
 * - 服务费 2% → gift 或自充均可
 * - 无自充 → 只扣服务费，门店送小奖，权重 ×0.2
 * - 线上 PayNow → 始终真金路径
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  DEFAULT_BUSINESS_GIFT_CENTS,
  splitExclusiveSaleFees,
  type ExclusiveFeeConfig,
  type ExclusiveFeePlan,
  type FeeSplit,
} from "@/lib/activity-fees";

type Tx = Prisma.TransactionClient;

/** gift/弱路径：大奖权重系数 */
export const EXCLUSIVE_GIFT_WEIGHT_FACTOR = 0.2;

export type ExclusiveFundingMode = "paid" | "gift";

export type ExclusiveCashFeeResult = FeeSplit & {
  /** paid = 奖池部分由自充支付；gift = 未付奖池（仅服务费，弱路径） */
  fundingMode: ExclusiveFundingMode;
  /** 是否注入奖池、小奖是否进顾客可花余额 */
  realPrizeFunding: boolean;
  weightFactor: number;
  giftDebited: number;
  paidDebited: number;
  /** 实际从企业账户扣的总额（弱路径通常只有 2% 服务费） */
  chargedCents: number;
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
          description: `平台赠送额度 S$${(DEFAULT_BUSINESS_GIFT_CENTS / 100).toFixed(0)}（仅可抵独享服务费 2%，不可提现、不可注奖池）`,
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

/** 奖池相关：小奖 3% + 大奖 10%（只能自充） */
export function exclusivePrizeFundingCents(split: FeeSplit): number {
  return Math.max(0, split.smallPrizeCents) + Math.max(0, split.grandPoolCents);
}

/**
 * 独享现金/实体售出扣费：
 * 1) 服务费 2%：gift 优先，不足再扣自充
 * 2) 奖池（小奖+大奖）：仅自充；不够则不扣、不注池 → 弱路径
 */
export async function applyExclusiveCashSaleFees(
  tx: Tx,
  params: {
    businessId: string;
    campaignId: string;
    faceCents: number;
    plan?: ExclusiveFeePlan;
    /** 优先于 plan：企业自定义 total/small/grand */
    feeConfig?: ExclusiveFeeConfig;
    referenceId?: string;
    label?: string;
  }
): Promise<ExclusiveCashFeeResult> {
  const planOrConfig = params.feeConfig ?? params.plan ?? "exclusive_15";
  const split = splitExclusiveSaleFees(params.faceCents, planOrConfig);
  const platformFee = Math.max(0, split.platformFeeCents);
  const prizeNeed = exclusivePrizeFundingCents(split);

  if (platformFee <= 0 && prizeNeed <= 0) {
    return {
      ...split,
      fundingMode: "paid",
      realPrizeFunding: true,
      weightFactor: 1,
      giftDebited: 0,
      paidDebited: 0,
      chargedCents: 0,
    };
  }

  const account = await ensureBusinessTokenAccount(tx, params.businessId);
  const gift = Math.max(0, account.giftBalance);
  const paid = Math.max(0, account.balance);

  // 至少要付得起服务费（gift+自充）
  if (gift + paid < platformFee) {
    throw new Error("INSUFFICIENT_TOKEN");
  }

  // 服务费：gift 优先
  const giftDebited = Math.min(gift, platformFee);
  const paidForPlatform = platformFee - giftDebited;
  const paidLeft = paid - paidForPlatform;

  // 奖池部分：仅自充剩余
  const realPrizeFunding = prizeNeed <= 0 || paidLeft >= prizeNeed;
  const paidForPrize = realPrizeFunding ? prizeNeed : 0;
  const paidDebited = paidForPlatform + paidForPrize;
  const chargedCents = platformFee + paidForPrize;
  const fundingMode: ExclusiveFundingMode = realPrizeFunding ? "paid" : "gift";
  const weightFactor = realPrizeFunding ? 1 : EXCLUSIVE_GIFT_WEIGHT_FACTOR;

  const updated = await tx.tokenAccount.update({
    where: { id: account.id },
    data: {
      giftBalance: { decrement: giftDebited },
      balance: { decrement: paidDebited },
      totalSpent: { increment: chargedCents },
    },
  });

  const smallPct = split.smallPrizePercent ?? 3;
  const grandPct = split.grandPoolPercent ?? (split.totalPercent === 10 ? 5 : 10);
  const baseLabel =
    params.label ||
    `独享${split.totalPercent}%扣点（服务费2%${
      realPrizeFunding
        ? `+小奖${smallPct}%+大奖${grandPct}%`
        : "；未自充奖池"
    }）`;

  await tx.tokenTransaction.create({
    data: {
      accountId: account.id,
      amount: -chargedCents,
      type: "exclusive_sale_fee",
      description:
        `${baseLabel} S$${(chargedCents / 100).toFixed(2)}` +
        (realPrizeFunding
          ? " · 自充进奖池/可抽小奖"
          : " · 仅服务费；小奖门店送、不注大奖池、弱权重"),
      referenceId: params.referenceId || null,
      balanceAfter: updated.balance,
    },
  });

  if (realPrizeFunding && prizeNeed > 0) {
    await creditExclusivePools(tx, params.campaignId, split);
  }

  return {
    ...split,
    fundingMode,
    realPrizeFunding,
    weightFactor,
    giftDebited,
    paidDebited,
    chargedCents,
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

/** 线上：支付真钱，始终进池（不扣企业 gift） */
export async function applyExclusiveOnlineSaleFees(
  tx: Tx,
  params: {
    campaignId: string;
    faceCents: number;
    plan?: ExclusiveFeePlan;
    feeConfig?: ExclusiveFeeConfig;
  }
): Promise<ExclusiveCashFeeResult> {
  const planOrConfig = params.feeConfig ?? params.plan ?? "exclusive_15";
  const split = splitExclusiveSaleFees(params.faceCents, planOrConfig);
  await creditExclusivePools(tx, params.campaignId, split);
  return {
    ...split,
    fundingMode: "paid",
    realPrizeFunding: true,
    weightFactor: 1,
    giftDebited: 0,
    paidDebited: 0,
    chargedCents: split.totalCents,
  };
}

/**
 * 现金售独享门槛：
 * - ok：gift+自充 ≥ 服务费 2%（不强制充值）
 * - canFullPrizeMode：自充在付完服务费后仍够奖池部分
 */
export async function canAffordExclusiveCash(
  businessId: string,
  faceCents: number,
  planOrConfig: ExclusiveFeePlan | ExclusiveFeeConfig = "exclusive_15"
): Promise<{
  ok: boolean;
  needCents: number;
  haveCents: number;
  paidCents: number;
  giftCents: number;
  platformFeeCents: number;
  prizeNeedCents: number;
  canFullPrizeMode: boolean;
}> {
  const split = splitExclusiveSaleFees(faceCents, planOrConfig);
  const platformFeeCents = split.platformFeeCents;
  const prizeNeedCents = exclusivePrizeFundingCents(split);
  const account = await prisma.tokenAccount.findUnique({
    where: { userId: businessId },
  });
  const paid = Math.max(0, account?.balance ?? 0);
  const gift = Math.max(0, account?.giftBalance ?? 0);
  const have = paid + gift;

  const giftForPlatform = Math.min(gift, platformFeeCents);
  const paidForPlatform = platformFeeCents - giftForPlatform;
  const paidLeft = paid - paidForPlatform;
  const canFullPrizeMode =
    have >= platformFeeCents &&
    (prizeNeedCents <= 0 || paidLeft >= prizeNeedCents);

  return {
    ok: have >= platformFeeCents,
    needCents: platformFeeCents,
    haveCents: have,
    paidCents: paid,
    giftCents: gift,
    platformFeeCents,
    prizeNeedCents,
    canFullPrizeMode,
  };
}

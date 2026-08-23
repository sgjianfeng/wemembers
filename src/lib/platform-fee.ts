/**
 * 平台费（活动 1 / 活动 2）—— 阶梯费率 + 月保底
 *
 * 活动 3（购券抽奖）走另一张费率卡：2%，含在 15% 扣点内（见 activity-fees.ts）。
 * 两张费率卡并存是有意的：活动 3 平台要托管奖池资金、承担实物大奖兑付，
 * 活动 1/2 平台不碰钱、只提供系统。
 *
 * 阶梯按**当月累计流水**分段计算边际费率，不能用整月单一费率——
 * 否则商家月末冲量跳档会产生账单争议（同一笔消费在月初月末算出不同费用）。
 *
 * 保底在月末结算任务补收，交易时不收。
 */

export type PlatformFeeTier = {
  /** 该档位的月累计流水上限（分），含 */
  upToCents: number;
  percent: number;
};

/** 首 S$30k → 1%；S$30k–100k → 0.7%；>S$100k → 0.5% */
export const PLATFORM_FEE_TIERS: PlatformFeeTier[] = [
  { upToCents: 3_000_000, percent: 1.0 },
  { upToCents: 10_000_000, percent: 0.7 },
  { upToCents: Number.POSITIVE_INFINITY, percent: 0.5 },
];

/** 月最低平台费 S$88 */
export const PLATFORM_MIN_MONTHLY_CENTS = 8_800;

export type MarginalFeeBreakdown = {
  feeCents: number;
  /** 本笔的实际混合费率 %（展示用） */
  effectivePercent: number;
  /** 分段明细：[档位费率, 落在该档的金额, 该段费用] */
  segments: Array<{ percent: number; amountCents: number; feeCents: number }>;
};

/**
 * 按当月累计流水计算这一笔消费的边际平台费。
 *
 * @param mtdGmvCents 本笔**之前**的当月累计流水（分）
 * @param amountCents 本笔消费金额（分）
 */
export function marginalPlatformFeeDetailed(
  mtdGmvCents: number,
  amountCents: number
): MarginalFeeBreakdown {
  const amount = Math.max(0, Math.round(amountCents));
  if (amount <= 0) {
    return { feeCents: 0, effectivePercent: 0, segments: [] };
  }

  let cursor = Math.max(0, Math.round(mtdGmvCents));
  let remaining = amount;
  let feeCents = 0;
  const segments: MarginalFeeBreakdown["segments"] = [];

  for (const tier of PLATFORM_FEE_TIERS) {
    if (remaining <= 0) break;
    const roomInTier = tier.upToCents - cursor;
    if (roomInTier <= 0) continue;

    const take = Math.min(remaining, roomInTier);
    const segFee = Math.floor((take * tier.percent) / 100);
    feeCents += segFee;
    segments.push({ percent: tier.percent, amountCents: take, feeCents: segFee });

    cursor += take;
    remaining -= take;
  }

  return {
    feeCents,
    effectivePercent: amount > 0 ? (feeCents / amount) * 100 : 0,
    segments,
  };
}

/** 便捷版：只要金额 */
export function marginalPlatformFee(
  mtdGmvCents: number,
  amountCents: number
): number {
  return marginalPlatformFeeDetailed(mtdGmvCents, amountCents).feeCents;
}

/** 月末保底补收：已收不足 S$88 时补齐差额 */
export function monthlyMinimumTopUp(chargedThisMonthCents: number): number {
  const charged = Math.max(0, Math.round(chargedThisMonthCents));
  return Math.max(0, PLATFORM_MIN_MONTHLY_CENTS - charged);
}

/** 达到保底所需的月流水（按首档费率）——商家后台"再做多少就不用补保底"提示用 */
export function gmvToReachMinimum(): number {
  const firstTier = PLATFORM_FEE_TIERS[0];
  return Math.ceil((PLATFORM_MIN_MONTHLY_CENTS * 100) / firstTier.percent);
}

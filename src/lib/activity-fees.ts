/**
 * 活动扣点定稿
 *
 * 共赢 20%（核销时）：小奖 3% + 服务费 2% + 卖券 5% + 大奖 10%
 * 独享 15%（付款时）：小奖 3% + 服务费 2% + 大奖 10%（无卖券）
 * 独享退款：最多退面值 10%（小奖已抽心智）
 */

export const COWIN_TOTAL_PERCENT = 20;
export const EXCLUSIVE_TOTAL_PERCENT = 15;
export const EXCLUSIVE_REFUND_MAX_PERCENT = 10;

export const FEE_SMALL_PRIZE_PERCENT = 3;
export const FEE_PLATFORM_PERCENT = 2;
export const FEE_SELLER_PERCENT = 5;
export const FEE_GRAND_PERCENT = 10;

/** 企业默认平台赠送额度（分）S$300 */
export const DEFAULT_BUSINESS_GIFT_CENTS = 30000;

export type FeeSplit = {
  faceCents: number;
  totalCents: number;
  smallPrizeCents: number;
  platformFeeCents: number;
  sellerCommissionCents: number;
  grandPoolCents: number;
  totalPercent: number;
};

function floorPct(faceCents: number, pct: number): number {
  return Math.floor((Math.max(0, faceCents) * pct) / 100);
}

/** 共赢核销：必有卖家时 seller=5%；无卖家不应发生（调用方拦截） */
export function splitCowinRedeemFees(faceCents: number): FeeSplit {
  const f = Math.max(0, Math.round(faceCents));
  const smallPrizeCents = floorPct(f, FEE_SMALL_PRIZE_PERCENT);
  const platformFeeCents = floorPct(f, FEE_PLATFORM_PERCENT);
  const sellerCommissionCents = floorPct(f, FEE_SELLER_PERCENT);
  const grandPoolCents = floorPct(f, FEE_GRAND_PERCENT);
  return {
    faceCents: f,
    totalCents:
      smallPrizeCents +
      platformFeeCents +
      sellerCommissionCents +
      grandPoolCents,
    smallPrizeCents,
    platformFeeCents,
    sellerCommissionCents,
    grandPoolCents,
    totalPercent: COWIN_TOTAL_PERCENT,
  };
}

/** 独享付款：无卖券奖励 */
export function splitExclusiveSaleFees(faceCents: number): FeeSplit {
  const f = Math.max(0, Math.round(faceCents));
  const smallPrizeCents = floorPct(f, FEE_SMALL_PRIZE_PERCENT);
  const platformFeeCents = floorPct(f, FEE_PLATFORM_PERCENT);
  const grandPoolCents = floorPct(f, FEE_GRAND_PERCENT);
  return {
    faceCents: f,
    totalCents: smallPrizeCents + platformFeeCents + grandPoolCents,
    smallPrizeCents,
    platformFeeCents,
    sellerCommissionCents: 0,
    grandPoolCents,
    totalPercent: EXCLUSIVE_TOTAL_PERCENT,
  };
}

/** 独享退款上限（分） */
export function exclusiveRefundMaxCents(faceCents: number): number {
  return floorPct(Math.max(0, Math.round(faceCents)), EXCLUSIVE_REFUND_MAX_PERCENT);
}

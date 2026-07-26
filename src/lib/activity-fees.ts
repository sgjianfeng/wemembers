/**
 * 活动扣点定稿
 *
 * 共赢 20%（核销时）：小奖 3% + 服务费 2% + 卖券 5% + 大奖 10%
 * 独享 15%（付款时）：小奖 3% + 服务费 2% + 大奖 10%（无卖券）
 * 独享 10%（付款时）：小奖 3% + 服务费 2% + 大奖 5%（无卖券）
 * 企业拷贝模版可改：总率、小奖%、大奖%——平台服务费固定 2% 不可改
 * 独享退款：最多退面值 10%
 */

export const COWIN_TOTAL_PERCENT = 20;
export const EXCLUSIVE_TOTAL_PERCENT = 15;
export const EXCLUSIVE_LIGHT_TOTAL_PERCENT = 10;
export const EXCLUSIVE_REFUND_MAX_PERCENT = 10;

export const FEE_SMALL_PRIZE_PERCENT = 3;
export const FEE_PLATFORM_PERCENT = 2;
export const FEE_SELLER_PERCENT = 5;
export const FEE_GRAND_PERCENT = 10;
export const FEE_GRAND_LIGHT_PERCENT = 5;

/** 企业自定义独享费率边界 */
export const EXCLUSIVE_CUSTOM_TOTAL_MIN = 5;
export const EXCLUSIVE_CUSTOM_TOTAL_MAX = 30;
export const EXCLUSIVE_CUSTOM_PART_MIN = 1;
export const EXCLUSIVE_CUSTOM_PART_MAX = 25;

/** 企业默认平台赠送额度（分）S$300 */
export const DEFAULT_BUSINESS_GIFT_CENTS = 30000;

/** 独享费率档：标准 15% | 轻量 10% | 企业自定义 */
export type ExclusiveFeePlan = "exclusive_15" | "exclusive_10" | "exclusive_custom";

export type FeeSplit = {
  faceCents: number;
  totalCents: number;
  smallPrizeCents: number;
  platformFeeCents: number;
  sellerCommissionCents: number;
  grandPoolCents: number;
  totalPercent: number;
  plan?: ExclusiveFeePlan;
  smallPrizePercent?: number;
  platformFeePercent?: number;
  grandPoolPercent?: number;
};

/** 独享扣点百分比（平台固定 2%） */
export type ExclusiveFeeConfig = {
  plan: ExclusiveFeePlan;
  totalPercent: number;
  smallPrizePercent: number;
  /** 始终为 FEE_PLATFORM_PERCENT (2) */
  platformFeePercent: number;
  grandPoolPercent: number;
};

export function getExclusiveFeePercents(
  plan: ExclusiveFeePlan = "exclusive_15"
): ExclusiveFeeConfig {
  if (plan === "exclusive_10") {
    return {
      plan: "exclusive_10",
      totalPercent: EXCLUSIVE_LIGHT_TOTAL_PERCENT,
      smallPrizePercent: FEE_SMALL_PRIZE_PERCENT,
      platformFeePercent: FEE_PLATFORM_PERCENT,
      grandPoolPercent: FEE_GRAND_LIGHT_PERCENT,
    };
  }
  return {
    plan: "exclusive_15",
    totalPercent: EXCLUSIVE_TOTAL_PERCENT,
    smallPrizePercent: FEE_SMALL_PRIZE_PERCENT,
    platformFeePercent: FEE_PLATFORM_PERCENT,
    grandPoolPercent: FEE_GRAND_PERCENT,
  };
}

export function resolveExclusiveFeePlan(
  input?: ExclusiveFeePlan | number | null
): ExclusiveFeePlan {
  if (input === "exclusive_10" || input === 10) return "exclusive_10";
  if (input === "exclusive_custom") return "exclusive_custom";
  return "exclusive_15";
}

/**
 * 校验并规范化企业自定义独享费率。
 * 平台服务费固定 2%；必须 small + 2 + grand === total。
 */
export function normalizeExclusiveFeeConfig(input: {
  totalPercent?: number | null;
  smallPrizePercent?: number | null;
  grandPoolPercent?: number | null;
  /** 若只给 plan 预设 */
  plan?: ExclusiveFeePlan | null;
}): ExclusiveFeeConfig {
  const platform = FEE_PLATFORM_PERCENT;

  // 纯预设
  if (
    (input.plan === "exclusive_15" || input.plan === "exclusive_10") &&
    input.totalPercent == null &&
    input.smallPrizePercent == null &&
    input.grandPoolPercent == null
  ) {
    return getExclusiveFeePercents(input.plan);
  }

  let small =
    input.smallPrizePercent != null
      ? Math.round(Number(input.smallPrizePercent))
      : null;
  let grand =
    input.grandPoolPercent != null
      ? Math.round(Number(input.grandPoolPercent))
      : null;
  let total =
    input.totalPercent != null ? Math.round(Number(input.totalPercent)) : null;

  // 从预设补缺
  if (small == null || grand == null || total == null) {
    const base = getExclusiveFeePercents(
      input.plan === "exclusive_10" ? "exclusive_10" : "exclusive_15"
    );
    if (small == null) small = base.smallPrizePercent;
    if (grand == null) grand = base.grandPoolPercent;
    if (total == null) total = small + platform + grand;
  }

  // 若 total 与 small/grand 不一致：优先用用户给的 total，重算缺失项
  if (small + platform + grand !== total) {
    if (
      input.totalPercent != null &&
      input.smallPrizePercent != null &&
      input.grandPoolPercent == null
    ) {
      grand = total - small - platform;
    } else if (
      input.totalPercent != null &&
      input.grandPoolPercent != null &&
      input.smallPrizePercent == null
    ) {
      small = total - grand - platform;
    } else if (
      input.smallPrizePercent != null &&
      input.grandPoolPercent != null &&
      input.totalPercent == null
    ) {
      total = small + platform + grand;
    } else if (input.totalPercent != null) {
      // 有 total，按比例缩放 small/grand（保整数）
      const rest = total - platform;
      if (rest < 2) {
        throw new Error("EXCLUSIVE_FEE_TOTAL_TOO_LOW");
      }
      const s0 = small;
      const g0 = grand;
      const sum = s0 + g0;
      if (sum <= 0) {
        small = Math.floor(rest / 2);
        grand = rest - small;
      } else {
        small = Math.max(1, Math.round((s0 / sum) * rest));
        grand = rest - small;
        if (grand < 1) {
          grand = 1;
          small = rest - 1;
        }
      }
    } else {
      total = small + platform + grand;
    }
  }

  if (
    total < EXCLUSIVE_CUSTOM_TOTAL_MIN ||
    total > EXCLUSIVE_CUSTOM_TOTAL_MAX
  ) {
    throw new Error("EXCLUSIVE_FEE_TOTAL_OUT_OF_RANGE");
  }
  if (
    small < EXCLUSIVE_CUSTOM_PART_MIN ||
    small > EXCLUSIVE_CUSTOM_PART_MAX ||
    grand < EXCLUSIVE_CUSTOM_PART_MIN ||
    grand > EXCLUSIVE_CUSTOM_PART_MAX
  ) {
    throw new Error("EXCLUSIVE_FEE_PART_OUT_OF_RANGE");
  }
  if (small + platform + grand !== total) {
    throw new Error("EXCLUSIVE_FEE_SPLIT_MISMATCH");
  }

  const is15 =
    total === 15 && small === 3 && grand === 10;
  const is10 =
    total === 10 && small === 3 && grand === 5;

  return {
    plan: is15 ? "exclusive_15" : is10 ? "exclusive_10" : "exclusive_custom",
    totalPercent: total,
    smallPrizePercent: small,
    platformFeePercent: platform,
    grandPoolPercent: grand,
  };
}

function floorPct(faceCents: number, pct: number): number {
  return Math.floor((Math.max(0, faceCents) * pct) / 100);
}

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

/** 独享付款；plan 预设或完整 ExclusiveFeeConfig */
export function splitExclusiveSaleFees(
  faceCents: number,
  planOrConfig: ExclusiveFeePlan | ExclusiveFeeConfig = "exclusive_15"
): FeeSplit {
  const f = Math.max(0, Math.round(faceCents));
  const p: ExclusiveFeeConfig =
    typeof planOrConfig === "string"
      ? getExclusiveFeePercents(planOrConfig)
      : planOrConfig.platformFeePercent === FEE_PLATFORM_PERCENT
        ? planOrConfig
        : normalizeExclusiveFeeConfig(planOrConfig);

  // 强制平台 2%
  const config: ExclusiveFeeConfig = {
    ...p,
    platformFeePercent: FEE_PLATFORM_PERCENT,
    totalPercent:
      p.smallPrizePercent + FEE_PLATFORM_PERCENT + p.grandPoolPercent,
  };

  const smallPrizeCents = floorPct(f, config.smallPrizePercent);
  const platformFeeCents = floorPct(f, config.platformFeePercent);
  const grandPoolCents = floorPct(f, config.grandPoolPercent);
  return {
    faceCents: f,
    totalCents: smallPrizeCents + platformFeeCents + grandPoolCents,
    smallPrizeCents,
    platformFeeCents,
    sellerCommissionCents: 0,
    grandPoolCents,
    totalPercent: config.totalPercent,
    plan: config.plan,
    smallPrizePercent: config.smallPrizePercent,
    platformFeePercent: config.platformFeePercent,
    grandPoolPercent: config.grandPoolPercent,
  };
}

export function exclusiveRefundMaxCents(faceCents: number): number {
  return floorPct(Math.max(0, Math.round(faceCents)), EXCLUSIVE_REFUND_MAX_PERCENT);
}

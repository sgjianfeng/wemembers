/**
 * 默认开店包（Meow BBQ 试点定稿）
 *
 * - 每店赠送 S$100（无店账户时公司总额 = 100 × 门店数）
 * - A1 原价无门槛代金
 * - A2 原价门槛券：最低消费 = 券面 × 10（≈9 折心智）
 * - B 独享 15% 抽奖（3% 小奖 + 2% 平台 + 10% 大奖），档 50/100
 * - 入箱票 ballot：打印投箱，≠ 消费券
 */

import { FEE_PLATFORM_PERCENT, FEE_SMALL_PRIZE_PERCENT, FEE_GRAND_PERCENT } from "@/lib/activity-fees";

/** 每店默认赠送（分）S$100 */
export const DEFAULT_STORE_GIFT_CENTS = 10000;

/** A2：最低消费 = 券面 × 该倍数 */
export const FACE_VOUCHER_MIN_SPEND_MULTIPLIER = 10;

/** 入箱/独享默认档（SGD） */
export const BALLOT_DRAW_TIERS_SGD = [50, 100] as const;

/** 默认无门槛代金档 */
export const FACE_VOUCHER_OPEN_TIERS_SGD = [10, 20, 50, 100] as const;

/** 默认门槛代金档 */
export const FACE_VOUCHER_THRESHOLD_TIERS_SGD = [10, 20, 50, 100] as const;

/** 长期活动默认天数 */
export const DEFAULT_CAMPAIGN_DAYS = 365;

export function companyGiftForStoreCount(storeCount: number): number {
  const n = Math.max(1, Math.floor(storeCount) || 1);
  return n * DEFAULT_STORE_GIFT_CENTS;
}

/** 券面（分）→ 最低消费（分）；multiplier=0 表示无门槛 */
export function minSpendCentsFromFace(
  faceCents: number,
  multiplier: number = FACE_VOUCHER_MIN_SPEND_MULTIPLIER
): number {
  if (multiplier <= 0) return 0;
  const face = Math.max(0, Math.round(faceCents));
  return face * Math.round(multiplier);
}

/** 付额（分）→ 15% 独享中的大奖池贡献（10%） */
export function ballotGrandContributionCents(paidFaceCents: number): number {
  const face = Math.max(0, Math.round(paidFaceCents));
  return Math.floor((face * FEE_GRAND_PERCENT) / 100);
}

export function ballotFeeSplitLabel(paidFaceCents: number): string {
  const face = Math.max(0, Math.round(paidFaceCents));
  const small = Math.floor((face * FEE_SMALL_PRIZE_PERCENT) / 100);
  const plat = Math.floor((face * FEE_PLATFORM_PERCENT) / 100);
  const grand = Math.floor((face * FEE_GRAND_PERCENT) / 100);
  return `小奖 S$${(small / 100).toFixed(2)} + 平台 S$${(plat / 100).toFixed(2)} + 大奖 S$${(grand / 100).toFixed(2)}`;
}

export type DefaultPackKind =
  /** 统一折扣券模版：discountPercent 参数化（0 = 原价代金） */
  | "discount_voucher"
  /** @deprecated 用 discount_voucher + discountPercent 0；保留以兼容存量数据 */
  | "face_open"
  | "face_threshold"
  /** @deprecated 用 discount_voucher + discountPercent 10；保留以兼容存量数据 */
  | "discount_10"
  | "exclusive_ballot";

/**
 * 门店基础 / 长期券：不进首页热门，只在门店/店铺页买。
 * （原价代金、门槛券、9 折卡）
 */
export const BASE_CATALOG_PACKS: DefaultPackKind[] = [
  "discount_voucher",
  "face_open",
  "face_threshold",
  "discount_10",
];

export function isBaseCatalogPack(
  packKind: string | null | undefined
): boolean {
  return (
    packKind === "discount_voucher" ||
    packKind === "face_open" ||
    packKind === "face_threshold" ||
    packKind === "discount_10"
  );
}

export const DEFAULT_PACK_SLUGS = {
  faceOpen: "default-face-voucher-open",
  faceThreshold: "default-face-voucher-threshold",
  /** 折扣券（统一模版） */
  discountVoucher: "default-discount-voucher",
  /** 9 折优惠卡：付 90 得 100 */
  discount10: "default-discount-card-10",
  exclusiveBallot: "default-exclusive-ballot-15",
} as const;

/** 9 折优惠卡默认档（SGD）付 90% 得面值 */
export const DISCOUNT_CARD_TIERS_SGD = [10, 20, 50, 100, 200] as const;
/** 付 90 得 100 → 折扣 10% */
export const DISCOUNT_CARD_PERCENT = 10;

/** 折扣券折扣率边界 %：0 = 原价代金，上限 50 防误配 */
export const DISCOUNT_VOUCHER_PERCENT_MIN = 0;
export const DISCOUNT_VOUCHER_PERCENT_MAX = 50;

export function clampDiscountPercent(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0;
  return Math.min(
    DISCOUNT_VOUCHER_PERCENT_MAX,
    Math.max(DISCOUNT_VOUCHER_PERCENT_MIN, v)
  );
}

/**
 * 折扣券（统一模版）——「原价代金」与「9 折卡」本是同一模版的两个参数值：
 *   discountPercent 0  → 付 100 得 100（原价代金）
 *   discountPercent 10 → 付 90  得 100（9 折卡）
 *   discountPercent 20 → 付 80  得 100（8 折卡）
 *
 * `face_open` / `discount_10` 保留为向后兼容的别名（存量商品的 rulesSnapshot 里
 * 已固化了这两个 packKind，且业务 UI 有 12 处在匹配它们，不做破坏性重命名）。
 */
export function buildDiscountVoucherSnapshot(
  discountPercent: number = 0,
  enabledTiers: number[] = [...DISCOUNT_CARD_TIERS_SGD],
  opts: {
    packKind?: DefaultPackKind;
    minSpendMultiplier?: number;
    /** 购后 N 天有效；null/0 = 跟随活动截止 */
    validDays?: number | null;
  } = {}
) {
  return {
    templateId: "self_use_voucher" as const,
    kind: "voucher_discount" as const,
    allowDiscount: true,
    discountPercent: clampDiscountPercent(discountPercent),
    sellerCommissionPercent: 0,
    platformFeePercent: 0,
    prizePoolPercent: 0,
    shareSellingEnabled: false,
    campaignType: "voucher_sale",
    instantPoolRatio: 0,
    midPoolRatio: 0,
    grandPoolRatio: 0,
    enabledTiers: [...enabledTiers].sort((a, b) => a - b),
    prizePackId: "none" as const,
    minSpendMultiplier: opts.minSpendMultiplier ?? 0,
    productKind: "self_use" as const,
    exclusiveFeeTotalPercent: null,
    packKind: (opts.packKind ?? "discount_voucher") as DefaultPackKind,
    /**
     * 购后 N 天有效（`validity.ts` 的 entitlementValidDays）；
     * null = 跟随活动截止（旧行为，存量券不受影响）
     */
    validDays:
      opts.validDays != null && opts.validDays > 0
        ? Math.round(opts.validDays)
        : null,
    /** 长期券：首页热门不展示，进店可见 */
    listScope: "store" as const,
    snapshottedAt: new Date().toISOString(),
  };
}

/** @deprecated 折扣率 0 的折扣券。保留以兼容存量数据与既有 UI */
export function buildFaceOpenSnapshot(
  enabledTiers: number[] = [...FACE_VOUCHER_OPEN_TIERS_SGD]
) {
  return buildDiscountVoucherSnapshot(0, enabledTiers, {
    packKind: "face_open",
  });
}

/** @deprecated 折扣率 10 的折扣券（付 90 得 100）。保留以兼容存量数据与既有 UI */
export function buildDiscount10Snapshot(
  enabledTiers: number[] = [...DISCOUNT_CARD_TIERS_SGD]
) {
  return buildDiscountVoucherSnapshot(DISCOUNT_CARD_PERCENT, enabledTiers, {
    packKind: "discount_10",
  });
}

export function buildFaceThresholdSnapshot(
  enabledTiers: number[] = [...FACE_VOUCHER_THRESHOLD_TIERS_SGD],
  multiplier = FACE_VOUCHER_MIN_SPEND_MULTIPLIER
) {
  return {
    ...buildFaceOpenSnapshot(enabledTiers),
    minSpendMultiplier: multiplier,
    packKind: "face_threshold" as DefaultPackKind,
    listScope: "store" as const,
    snapshottedAt: new Date().toISOString(),
  };
}

export function buildExclusiveBallotSnapshot(
  enabledTiers: number[] = [...BALLOT_DRAW_TIERS_SGD]
) {
  return {
    templateId: "exclusive_draw_15" as const,
    kind: "draw" as const,
    allowDiscount: false,
    discountPercent: 0,
    sellerCommissionPercent: 0,
    platformFeePercent: 2,
    prizePoolPercent: 0,
    shareSellingEnabled: false,
    campaignType: "lucky_draw_v2",
    instantPoolRatio: 20,
    midPoolRatio: 0,
    grandPoolRatio: 80,
    enabledTiers: [...enabledTiers].sort((a, b) => a - b),
    prizePackId: "default_grand_v1" as const,
    exclusiveFeeTotalPercent: 15,
    exclusiveSmallPrizePercent: 3,
    exclusivePlatformFeePercent: 2,
    exclusiveGrandPoolPercent: 10,
    productKind: "self_use" as const,
    packKind: "exclusive_ballot" as DefaultPackKind,
    listScope: "hot" as const,
    /** 入箱票：打印投箱，与消费券分离 */
    ballotEnabled: true,
    snapshottedAt: new Date().toISOString(),
  };
}

export function tiersToVoucherTiersJson(
  amountsSgd: number[],
  opts?: { instantCap?: (sgd: number) => number }
) {
  return amountsSgd.map((sgd) => ({
    min: sgd,
    max: sgd,
    tier: sgd >= 100 ? "large" : sgd >= 50 ? "medium" : "small",
    instantPrizeCap: opts?.instantCap?.(sgd) ?? (sgd >= 100 ? 20 : sgd >= 50 ? 8 : 0),
  }));
}

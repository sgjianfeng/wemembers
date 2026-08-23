/**
 * 满赠（Spend & Get）—— 活动模版 4
 *
 * 顾客消费达到门槛 → 拿到一张**下次消费**用的额度券。本单不打折。
 *
 * ## 为什么它和 cashback 是同一种东西
 *
 * cashback 是连续的（消费 × 3%），满赠是阶梯的（满 S$120 → S$61）。
 * 两者发的都是**下次消费的额度**，都是商家的记账负债，都不是真金。
 * 所以它们必须共用同一套负债账：
 *
 *   发放 → Campaign.cashbackIssuedCents  += 面额
 *   核销 → Campaign.cashbackRedeemedCents += 面额
 *
 * 这一点以前是漏的：满赠发出去的 S$61 只创建 CustomerCoupon，
 * 不进任何负债账。结果是商家可以开一个满赠活动，绕开 cashback 活动上的
 * maxOutstandingCents 与欠费降级，无限量发额度。本模块就是补这个洞。
 *
 * ## 负债上限看的是商家，不是活动
 *
 * 每个活动都有自己的 maxOutstandingCents，但顾客手上的额度是**商家**要兑付的。
 * 只按活动查，商家再开一个活动就能重新开一条口子。所以 assertCanIssueGift
 * 汇总该商家名下全部活动的未核销额度。
 */
import type { Prisma } from "@prisma/client";
import {
  OWED_DEGRADE_CENTS,
  OWED_POINTS_ONLY_CENTS,
  outstandingPlatformFeeCents,
} from "@/lib/cashback";

type Db = Prisma.TransactionClient | typeof import("@/lib/db").prisma;

// ────────────────────────────────────────────────────────────
// 规则
// ────────────────────────────────────────────────────────────

export type SpendGetRules = {
  /** 消费门槛（分） */
  minSpendCents: number;
  /** 赠送额度（分） */
  giftCouponCents: number;
  /** 赠送券有效天数，自发放起算 */
  validDays: number;
  /** 权重参照档（分）—— 赠送大奖签的权重按它折算 */
  weightRefFaceCents: number;
  /** 赠送签相对购券签的权重系数（<1） */
  giftWeightFactor: number;
  /** true = 核销也受活动截止限制（取较早） */
  dualProtection: boolean;
};

export const DEFAULT_SPEND_GET_RULES: SpendGetRules = {
  minSpendCents: 12_000,
  giftCouponCents: 6_100,
  validDays: 30,
  weightRefFaceCents: 10_000,
  giftWeightFactor: 0.2,
  dualProtection: false,
};

/** 赠额占门槛的比例上限。超过这个数商家基本在亏本买回头客 */
export const MAX_GIFT_RATIO = 0.6;
/** 赠送券有效期边界（天） */
export const VALID_DAYS_MIN = 1;
export const VALID_DAYS_MAX = 365;

/**
 * 校验商家填的满赠参数。
 *
 * 门槛与赠额的比例是这里唯一真正重要的约束：满 100 送 80 看起来慷慨，
 * 但它等于把下一单直接送掉，且顾客会把两单都压到刚好过线。
 */
export function validateSpendGetRules(
  rules: Pick<SpendGetRules, "minSpendCents" | "giftCouponCents" | "validDays">
): { ok: true } | { ok: false; error: string } {
  const { minSpendCents, giftCouponCents, validDays } = rules;

  if (!Number.isFinite(minSpendCents) || minSpendCents <= 0) {
    return { ok: false, error: "消费门槛必须大于 0" };
  }
  if (!Number.isFinite(giftCouponCents) || giftCouponCents <= 0) {
    return { ok: false, error: "赠送额度必须大于 0" };
  }
  if (giftCouponCents >= minSpendCents) {
    return { ok: false, error: "赠送额度不能大于等于消费门槛" };
  }
  const ratio = giftCouponCents / minSpendCents;
  if (ratio > MAX_GIFT_RATIO) {
    return {
      ok: false,
      error: `赠送额度不得超过门槛的 ${Math.round(MAX_GIFT_RATIO * 100)}%（当前 ${Math.round(ratio * 100)}%）`,
    };
  }
  if (!Number.isFinite(validDays) || validDays < VALID_DAYS_MIN || validDays > VALID_DAYS_MAX) {
    return {
      ok: false,
      error: `赠送券有效期需在 ${VALID_DAYS_MIN} – ${VALID_DAYS_MAX} 天之间`,
    };
  }
  return { ok: true };
}

/** 满赠的名义成本率：赠额 / 门槛。用于和 cashback 的百分比费率对齐比较 */
export function nominalCostPercent(rules: Pick<SpendGetRules, "minSpendCents" | "giftCouponCents">): number {
  if (rules.minSpendCents <= 0) return 0;
  return (rules.giftCouponCents / rules.minSpendCents) * 100;
}

/** 从 rulesSnapshot 解析；缺失走默认。兼容旧的 `ndp` 键与新的 `spendGet` 键 */
export function parseSpendGetRules(
  rulesSnapshot: string | null | undefined
): SpendGetRules {
  const base = { ...DEFAULT_SPEND_GET_RULES };
  if (!rulesSnapshot) return base;
  let raw: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rulesSnapshot);
    raw = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return base;
  }
  // 旧数据写在 `ndp` 下；新数据写 `spendGet`；再退化到顶层
  const block =
    (raw.spendGet && typeof raw.spendGet === "object"
      ? (raw.spendGet as Record<string, unknown>)
      : null) ??
    (raw.ndp && typeof raw.ndp === "object"
      ? (raw.ndp as Record<string, unknown>)
      : null) ??
    raw;

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  const min = num(block.minSpendCents);
  if (min !== null) base.minSpendCents = Math.round(min);
  const gift = num(block.giftCouponCents);
  if (gift !== null) base.giftCouponCents = Math.round(gift);
  const days = num(block.validDays);
  if (days !== null) {
    base.validDays = Math.min(VALID_DAYS_MAX, Math.max(VALID_DAYS_MIN, Math.round(days)));
  }
  const ref = num(block.weightRefFaceCents);
  if (ref !== null) base.weightRefFaceCents = Math.round(ref);
  const factor = num(block.giftWeightFactor);
  if (factor !== null && factor > 0) base.giftWeightFactor = factor;
  if (typeof block.dualProtection === "boolean") {
    base.dualProtection = block.dualProtection;
  }
  return base;
}

// ────────────────────────────────────────────────────────────
// 负债账
// ────────────────────────────────────────────────────────────

/**
 * 是不是满赠活动。
 *
 * **这是活动类型问题，不是视觉问题。** 以前两者被 `isFestivalNdpCampaign`
 * 混在一起：判定「是国庆吗」既决定分享链接指向哪，又决定海报要不要套国旗装饰。
 * 结果每个满赠活动都被自动涂成新加坡国庆红。现在拆开：
 * 类型走这里，视觉走 `isFestivalRedCampaign`（只认商家显式选的主题色/标签）。
 */
export function isSpendGetCampaign(
  type?: string | null,
  tags?: string | null
): boolean {
  if (type === "holiday") return true;
  if (!tags) return false;
  // 存量数据兼容：迁移脚本跑完后 ndp/国庆 分支可删
  return /category:spend_get|slot:spend_get|\bndp\b|国庆|national-day/i.test(tags);
}

export class SpendGetError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "SpendGetError";
  }
}

export function spendGetErrorMessage(code: string, lang: "zh" | "en" = "zh"): string {
  const zh: Record<string, string> = {
    LIABILITY_CAP_REACHED:
      "未核销额度已达上限，暂停发放。请先让顾客来核销，或联系平台调整上限",
    OWED_FEE_BLOCKED: "平台费欠费过多，已暂停发放赠送额度。请先补缴",
  };
  const en: Record<string, string> = {
    LIABILITY_CAP_REACHED: "Outstanding credit cap reached — issuing paused",
    OWED_FEE_BLOCKED: "Platform fees overdue — issuing paused",
  };
  return (lang === "en" ? en : zh)[code] || code;
}

/**
 * 商家名下全部活动的未核销额度合计（分）。
 *
 * 顾客手上的额度是**商家**要兑付的，不是某个活动要兑付的。
 * 只按单个活动查，商家再开一个活动就能重新开一条口子。
 */
export async function businessOutstandingLiabilityCents(
  db: Db,
  businessId: string
): Promise<number> {
  const agg = await db.campaign.aggregate({
    where: { businessId },
    _sum: { cashbackIssuedCents: true, cashbackRedeemedCents: true },
  });
  const issued = agg._sum.cashbackIssuedCents ?? 0;
  const redeemed = agg._sum.cashbackRedeemedCents ?? 0;
  return Math.max(0, issued - redeemed);
}

/**
 * 发放前的闸门。
 *
 * 两道：
 * 1. 平台费欠费 —— 与 cashback 用同一组阈值。满赠是固定面额，没法像百分比那样
 *    「降级到 1%」，所以只有通过 / 不通过两种结果，阈值取较严的 OWED_DEGRADE_CENTS。
 * 2. 未核销额度上限 —— 按商家汇总，不按活动。
 *
 * @throws SpendGetError("OWED_FEE_BLOCKED" | "LIABILITY_CAP_REACHED")
 */
export async function assertCanIssueGift(
  db: Db,
  params: {
    businessId: string;
    giftCents: number;
    /** 活动上配置的上限；null = 不限 */
    maxOutstandingCents?: number | null;
  }
): Promise<{ outstandingBeforeCents: number; owedCents: number }> {
  const [owedCents, outstanding] = await Promise.all([
    outstandingPlatformFeeCents(db, params.businessId),
    businessOutstandingLiabilityCents(db, params.businessId),
  ]);

  if (owedCents >= OWED_DEGRADE_CENTS) {
    throw new SpendGetError("OWED_FEE_BLOCKED");
  }
  if (
    params.maxOutstandingCents != null &&
    outstanding + Math.max(0, params.giftCents) > params.maxOutstandingCents
  ) {
    throw new SpendGetError("LIABILITY_CAP_REACHED");
  }

  return { outstandingBeforeCents: outstanding, owedCents };
}

/** 发放：累加负债 */
export async function recordGiftIssued(
  db: Db,
  campaignId: string,
  giftCents: number
): Promise<void> {
  const amount = Math.max(0, Math.round(giftCents));
  if (amount <= 0) return;
  await db.campaign.update({
    where: { id: campaignId },
    data: { cashbackIssuedCents: { increment: amount } },
  });
}

/** 核销：冲减负债。与 cashback 额度券走的是同一对计数器 */
export async function recordGiftRedeemed(
  db: Db,
  campaignId: string,
  faceCents: number
): Promise<void> {
  const amount = Math.max(0, Math.round(faceCents));
  if (amount <= 0) return;
  await db.campaign.update({
    where: { id: campaignId },
    data: { cashbackRedeemedCents: { increment: amount } },
  });
}

export { OWED_DEGRADE_CENTS, OWED_POINTS_ONLY_CENTS };

/**
 * 结账参加大奖：按「本单 + 已有余额 + 可选档」推荐券面。
 *
 * 硬规则：balance + face ≥ bill（总余额够抵本单）
 * 推荐：优先最小 face 使 balance + face > bill；否则最小够付档
 */

export type FaceRecommendInput = {
  /** 本单金额（SGD） */
  billSgd: number;
  /** 已有可核销余额（SGD） */
  balanceSgd: number;
  /** 活动开放档位（SGD 整数） */
  tiers: number[];
};

export type FaceRecommendResult = {
  billSgd: number;
  balanceSgd: number;
  /** max(0, bill - balance) */
  needSgd: number;
  /** 不买新券即可抵本单 */
  canCoverWithoutPurchase: boolean;
  /** 买完后能抵本单的档 */
  affordable: number[];
  /** 买完仍不够的档 */
  insufficient: number[];
  /** 默认高亮档；余额已够时为 null */
  recommended: number | null;
  /** recommended 是否严格大于（多留一点余额） */
  recommendedStrictGreater: boolean;
};

function normalizeTiers(tiers: number[]): number[] {
  const set = new Set<number>();
  for (const t of tiers) {
    const n = Math.round(Number(t));
    if (Number.isFinite(n) && n > 0) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

function money(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

export function recommendFace(input: FaceRecommendInput): FaceRecommendResult {
  const billSgd = money(input.billSgd);
  const balanceSgd = money(input.balanceSgd);
  const tiers = normalizeTiers(input.tiers);
  const needSgd = money(Math.max(0, billSgd - balanceSgd));
  const canCoverWithoutPurchase = balanceSgd + 1e-9 >= billSgd;

  const affordable: number[] = [];
  const insufficient: number[] = [];
  for (const face of tiers) {
    if (balanceSgd + face + 1e-9 >= billSgd) affordable.push(face);
    else insufficient.push(face);
  }

  let recommended: number | null = null;
  let recommendedStrictGreater = false;

  if (!canCoverWithoutPurchase && affordable.length > 0) {
    const strict = affordable.filter((face) => balanceSgd + face > billSgd + 1e-9);
    if (strict.length > 0) {
      recommended = strict[0];
      recommendedStrictGreater = true;
    } else {
      recommended = affordable[0];
      recommendedStrictGreater = false;
    }
  }

  return {
    billSgd,
    balanceSgd,
    needSgd,
    canCoverWithoutPurchase,
    affordable,
    insufficient,
    recommended,
    recommendedStrictGreater,
  };
}

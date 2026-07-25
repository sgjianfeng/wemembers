/**
 * D-P1-4 / D-P1-6
 * productKind: self_use (先收款) | distribution (平台托管)
 * play: voucher (无抽奖) | draw (抽奖)
 * 展示名：自用 / 分发 / 独享 / 共赢
 */

export type ProductKind = "self_use" | "distribution";
export type PlayKind = "voucher" | "draw";

export function normalizeProductKind(raw: unknown): ProductKind {
  if (raw === "self_use" || raw === "self-use" || raw === "self") {
    return "self_use";
  }
  return "distribution";
}

export function isSelfUse(kind: unknown): boolean {
  return normalizeProductKind(kind) === "self_use";
}

export function isDistribution(kind: unknown): boolean {
  return normalizeProductKind(kind) === "distribution";
}

export function isDrawCampaignType(type: string | null | undefined): boolean {
  return type === "lucky_draw_v2" || type === "lucky_draw";
}

/** Resolve kind from voucher row + campaign (voucher.productKind wins if set). */
export function resolveProductKind(input: {
  productKind?: string | null;
  campaignProductKind?: string | null;
  campaignType?: string | null;
}): ProductKind {
  if (input.productKind) return normalizeProductKind(input.productKind);
  if (input.campaignProductKind) {
    return normalizeProductKind(input.campaignProductKind);
  }
  return "distribution";
}

/**
 * Display label for staff/customer:
 * self+draw=独享, dist+draw=共赢, self+voucher=自用, dist+voucher=分发
 */
export function productDisplayLabel(
  kind: ProductKind | string | null | undefined,
  isDraw: boolean,
  lang: "zh" | "en" = "zh"
): string {
  const k = normalizeProductKind(kind);
  if (lang === "en") {
    if (isDraw) return k === "self_use" ? "Exclusive draw" : "Co-win draw";
    return k === "self_use" ? "Self-use" : "Distribution";
  }
  if (isDraw) return k === "self_use" ? "独享券" : "共赢券";
  return k === "self_use" ? "自用券" : "分发券";
}

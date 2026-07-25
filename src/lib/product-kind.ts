/**
 * D-P1-4: 自用券 / 分发券
 * self_use — 集团内可跨店；售出即收款；核销只记门店、不入平台钱包
 * distribution — 平台托管；核销分账 T+1
 */

export type ProductKind = "self_use" | "distribution";

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
  // Legacy: all existing prepaid campaigns are distribution
  return "distribution";
}

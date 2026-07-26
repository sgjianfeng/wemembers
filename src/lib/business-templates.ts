/**
 * 企业自定义模版：从平台自用/独享模版拷贝后改参数
 */
import {
  FEE_PLATFORM_PERCENT,
  normalizeExclusiveFeeConfig,
  type ExclusiveFeeConfig,
} from "@/lib/activity-fees";
import {
  buildRulesSnapshot,
  getTemplate,
  isExclusiveTemplateId,
  isSelfUseVoucherTemplateId,
  type RulesSnapshot,
  type TemplateId,
} from "@/lib/templates";

export const COPYABLE_BASE_TEMPLATE_IDS: TemplateId[] = [
  "self_use_voucher",
  "exclusive_draw_15",
  "exclusive_draw_10",
];

export function isCopyableBaseTemplate(id: string): boolean {
  return COPYABLE_BASE_TEMPLATE_IDS.includes(id as TemplateId);
}

export type BusinessTemplateInput = {
  baseTemplateId: string;
  name: string;
  discountPercent?: number | null;
  exclusiveTotalPercent?: number | null;
  exclusiveSmallPrizePercent?: number | null;
  exclusiveGrandPoolPercent?: number | null;
  enabledTiers?: number[] | null;
};

export type NormalizedBusinessTemplate = {
  baseTemplateId: TemplateId;
  name: string;
  kind: string;
  productKind: "self_use";
  discountPercent: number | null;
  exclusiveTotalPercent: number | null;
  exclusiveSmallPrizePercent: number | null;
  exclusivePlatformFeePercent: number;
  exclusiveGrandPoolPercent: number | null;
  enabledTiersJson: string | null;
  exclusiveConfig: ExclusiveFeeConfig | null;
};

export function normalizeBusinessTemplateInput(
  input: BusinessTemplateInput
): NormalizedBusinessTemplate {
  const baseId = input.baseTemplateId as TemplateId;
  if (!isCopyableBaseTemplate(baseId)) {
    throw new Error("BASE_TEMPLATE_NOT_COPYABLE");
  }
  const tpl = getTemplate(baseId);
  if (!tpl) throw new Error("UNKNOWN_BASE_TEMPLATE");

  const name = (input.name || "").trim();
  if (!name || name.length > 80) throw new Error("INVALID_NAME");

  let discountPercent: number | null = null;
  let exclusiveConfig: ExclusiveFeeConfig | null = null;
  let exclusiveTotalPercent: number | null = null;
  let exclusiveSmallPrizePercent: number | null = null;
  let exclusiveGrandPoolPercent: number | null = null;

  if (isSelfUseVoucherTemplateId(baseId)) {
    const d =
      input.discountPercent != null
        ? Math.round(Number(input.discountPercent))
        : tpl.rules.discountPercentDefault;
    if (
      d < tpl.rules.discountPercentMin ||
      d > tpl.rules.discountPercentMax
    ) {
      throw new Error("DISCOUNT_OUT_OF_RANGE");
    }
    discountPercent = d;
  } else if (isExclusiveTemplateId(baseId)) {
    const plan =
      baseId === "exclusive_draw_10" ? "exclusive_10" : "exclusive_15";
    exclusiveConfig = normalizeExclusiveFeeConfig({
      plan,
      totalPercent: input.exclusiveTotalPercent,
      smallPrizePercent: input.exclusiveSmallPrizePercent,
      grandPoolPercent: input.exclusiveGrandPoolPercent,
    });
    // 平台费强制 2
    if (exclusiveConfig.platformFeePercent !== FEE_PLATFORM_PERCENT) {
      throw new Error("PLATFORM_FEE_LOCKED");
    }
    exclusiveTotalPercent = exclusiveConfig.totalPercent;
    exclusiveSmallPrizePercent = exclusiveConfig.smallPrizePercent;
    exclusiveGrandPoolPercent = exclusiveConfig.grandPoolPercent;
  } else {
    throw new Error("BASE_TEMPLATE_NOT_COPYABLE");
  }

  const defaultTiers = tpl.rules.tiers
    .filter((t) => t.enabledByDefault)
    .map((t) => t.amountSgd);
  const allowed = new Set(tpl.rules.tiers.map((t) => t.amountSgd));
  let tiers =
    Array.isArray(input.enabledTiers) && input.enabledTiers.length
      ? input.enabledTiers
          .map((a) => Math.round(Number(a)))
          .filter((a) => allowed.has(a))
      : defaultTiers;
  if (tiers.length === 0) tiers = defaultTiers;

  return {
    baseTemplateId: baseId,
    name,
    kind: tpl.rules.kind,
    productKind: "self_use",
    discountPercent,
    exclusiveTotalPercent,
    exclusiveSmallPrizePercent,
    exclusivePlatformFeePercent: FEE_PLATFORM_PERCENT,
    exclusiveGrandPoolPercent,
    enabledTiersJson: JSON.stringify(tiers),
    exclusiveConfig,
  };
}

export function parseEnabledTiersJson(
  raw: string | null | undefined
): number[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((a) => Math.round(Number(a)))
      .filter((a) => Number.isFinite(a) && a > 0);
  } catch {
    return [];
  }
}

/** 企业模版 → 活动 rulesSnapshot */
export function buildSnapshotFromBusinessTemplate(row: {
  baseTemplateId: string;
  discountPercent: number | null;
  exclusiveTotalPercent: number | null;
  exclusiveSmallPrizePercent: number | null;
  exclusivePlatformFeePercent: number | null;
  exclusiveGrandPoolPercent: number | null;
  enabledTiers: string | null;
}): RulesSnapshot {
  const baseId = row.baseTemplateId as TemplateId;
  const tiers = parseEnabledTiersJson(row.enabledTiers);
  const snapshot = buildRulesSnapshot({
    templateId: baseId,
    discountPercent: row.discountPercent ?? undefined,
    enabledTiers: tiers.length ? tiers : undefined,
    shareSellingEnabled: false,
  });

  snapshot.productKind = "self_use";

  if (isExclusiveTemplateId(baseId)) {
    const cfg = normalizeExclusiveFeeConfig({
      plan: baseId === "exclusive_draw_10" ? "exclusive_10" : "exclusive_15",
      totalPercent: row.exclusiveTotalPercent,
      smallPrizePercent: row.exclusiveSmallPrizePercent,
      grandPoolPercent: row.exclusiveGrandPoolPercent,
    });
    snapshot.exclusiveFeeTotalPercent = cfg.totalPercent;
    snapshot.exclusiveSmallPrizePercent = cfg.smallPrizePercent;
    snapshot.exclusivePlatformFeePercent = FEE_PLATFORM_PERCENT;
    snapshot.exclusiveGrandPoolPercent = cfg.grandPoolPercent;
    snapshot.platformFeePercent = FEE_PLATFORM_PERCENT;
  }

  return snapshot;
}

export function exclusiveConfigFromBusinessRow(row: {
  exclusiveTotalPercent: number | null;
  exclusiveSmallPrizePercent: number | null;
  exclusiveGrandPoolPercent: number | null;
  baseTemplateId?: string | null;
}): ExclusiveFeeConfig {
  return normalizeExclusiveFeeConfig({
    plan:
      row.baseTemplateId === "exclusive_draw_10"
        ? "exclusive_10"
        : "exclusive_15",
    totalPercent: row.exclusiveTotalPercent,
    smallPrizePercent: row.exclusiveSmallPrizePercent,
    grandPoolPercent: row.exclusiveGrandPoolPercent,
  });
}

export function feeErrorMessage(code: string, lang: "zh" | "en" = "zh"): string {
  const zh: Record<string, string> = {
    BASE_TEMPLATE_NOT_COPYABLE: "该模版不可拷贝（仅自用/独享）",
    UNKNOWN_BASE_TEMPLATE: "未知平台模版",
    INVALID_NAME: "请填写模版名称（1–80 字）",
    DISCOUNT_OUT_OF_RANGE: "折扣率超出允许范围",
    EXCLUSIVE_FEE_TOTAL_OUT_OF_RANGE: "总扣点须在 5%–30%",
    EXCLUSIVE_FEE_PART_OUT_OF_RANGE: "小奖/大奖比例须在 1%–25%",
    EXCLUSIVE_FEE_SPLIT_MISMATCH: "须满足：小奖% + 2%平台 + 大奖% = 总%",
    EXCLUSIVE_FEE_TOTAL_TOO_LOW: "总扣点过低，无法覆盖平台 2%",
    PLATFORM_FEE_LOCKED: "平台服务费固定 2%，不可修改",
  };
  const en: Record<string, string> = {
    BASE_TEMPLATE_NOT_COPYABLE: "Only self-use / exclusive templates can be copied",
    UNKNOWN_BASE_TEMPLATE: "Unknown platform template",
    INVALID_NAME: "Name required (1–80 chars)",
    DISCOUNT_OUT_OF_RANGE: "Discount out of range",
    EXCLUSIVE_FEE_TOTAL_OUT_OF_RANGE: "Total fee must be 5%–30%",
    EXCLUSIVE_FEE_PART_OUT_OF_RANGE: "Small/grand parts must be 1%–25%",
    EXCLUSIVE_FEE_SPLIT_MISMATCH: "Require: small + 2% platform + grand = total",
    EXCLUSIVE_FEE_TOTAL_TOO_LOW: "Total too low for 2% platform fee",
    PLATFORM_FEE_LOCKED: "Platform fee is fixed at 2%",
  };
  return (lang === "en" ? en : zh)[code] || code;
}

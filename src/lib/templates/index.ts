/**
 * Campaign / voucher templates (platform-supplied).
 *
 * Template = locked mechanics + economics (+ optional prizePackId).
 * Prize pack = default prizes & draw-style (see prize-packs.ts).
 * Stores only tweak allowed fields; rules are snapshotted on create.
 */

import {
  type PrizePackId,
  type PrizePackSnapshot,
  type CampaignGrandPrize,
  getPrizePack,
  snapshotPrizePack,
  normalizeCampaignGrandPrizes,
} from "@/lib/templates/prize-packs";
import {
  getExclusiveFeePercents,
  normalizeExclusiveFeeConfig,
  type ExclusiveFeeConfig,
  type ExclusiveFeePlan,
} from "@/lib/activity-fees";

export type {
  PrizePackId,
  PrizePackSnapshot,
  CampaignGrandPrize,
} from "@/lib/templates/prize-packs";
export {
  getPrizePack,
  PRIZE_PACK_DEFAULT_GRAND_V1,
  listPrizePackSummaries,
  normalizeCampaignGrandPrizes,
  GRAND_PRIZE_EDIT_LIMITS,
} from "./prize-pack-export";

export type TemplateKind = "voucher_discount" | "draw" | "share_packaging";

export type TemplateId =
  | "voucher_discount"
  | "draw_standard"
  | "share_boost"
  /** 自用代金：默认 10/20/50/100/200 · 9 折 */
  | "self_use_voucher"
  /** 独享抽奖标准 15% = 3+2+10 */
  | "exclusive_draw_15"
  /** 独享抽奖轻量 10% = 3+2+5 */
  | "exclusive_draw_10";

/** 独享模版 ID */
export const EXCLUSIVE_TEMPLATE_IDS: TemplateId[] = [
  "exclusive_draw_15",
  "exclusive_draw_10",
];

export function isExclusiveTemplateId(id: string | null | undefined): boolean {
  return id === "exclusive_draw_15" || id === "exclusive_draw_10";
}

export function isSelfUseVoucherTemplateId(
  id: string | null | undefined
): boolean {
  return id === "self_use_voucher";
}

export interface VoucherTierTemplate {
  amountSgd: number;
  tier: "small" | "medium" | "large";
  instantPrizeCapSgd: number;
  enabledByDefault: boolean;
}

export interface TemplateRules {
  kind: TemplateKind;
  allowDiscount: boolean;
  discountPercentDefault: number;
  discountPercentMin: number;
  discountPercentMax: number;
  sellerCommissionPercent: number;
  platformFeePercent: number;
  prizePoolPercent: number;
  shareSellingDefault: boolean;
  campaignType: string;
  /** Share of prize-pool contributions reserved for instant wins (0–100) */
  instantPoolRatio: number;
  /**
   * @deprecated Mid tier removed. Always 0; kept so old snapshots parse.
   * Deferred prizes use (100 − instantPoolRatio).
   */
  midPoolRatio: number;
  /** Deferred prize pool ratio (100 − instant). Default 90 for draw templates. */
  grandPoolRatio: number;
  tiers: VoucherTierTemplate[];
  /** Draw templates attach a prize pack; pure vouchers use "none" */
  prizePackId: PrizePackId;
  /**
   * 独享付款扣点总 %（15 或 10）；非独享为 null
   * 15 → 小奖3+服务费2+大奖10；10 → 小奖3+服务费2+大奖5
   */
  exclusiveFeeTotalPercent: number | null;
  /** 创建时默认 productKind */
  defaultProductKind: "self_use" | "distribution";
}

export interface CampaignTemplate {
  id: TemplateId;
  nameZh: string;
  nameEn: string;
  icon: string;
  taglineZh: string;
  taglineEn: string;
  baseTemplateId?: TemplateId;
  rules: TemplateRules;
  editable: Array<
    | "name"
    | "description"
    | "color"
    | "startDate"
    | "endDate"
    | "discountPercent"
    | "enabledTiers"
    | "partners"
    | "shareSelling"
    | "grandPrizes"
  >;
}

/** 抽奖默认三档 50 / 100 / 200（与 draw-v2 对齐） */
const DRAW_TIERS: VoucherTierTemplate[] = [
  { amountSgd: 50, tier: "small", instantPrizeCapSgd: 8, enabledByDefault: true },
  { amountSgd: 100, tier: "medium", instantPrizeCapSgd: 20, enabledByDefault: true },
  { amountSgd: 200, tier: "large", instantPrizeCapSgd: 40, enabledByDefault: true },
];

/**
 * 分发/分享代金档位：≥S$2（无抽奖）。
 * 也允许创建时传入列表外的整数面额（≥2），见 buildRulesSnapshot。
 */
const VOUCHER_TIERS: VoucherTierTemplate[] = [
  { amountSgd: 2, tier: "small", instantPrizeCapSgd: 0, enabledByDefault: false },
  { amountSgd: 5, tier: "small", instantPrizeCapSgd: 0, enabledByDefault: false },
  { amountSgd: 10, tier: "small", instantPrizeCapSgd: 0, enabledByDefault: true },
  { amountSgd: 20, tier: "small", instantPrizeCapSgd: 0, enabledByDefault: false },
  { amountSgd: 50, tier: "small", instantPrizeCapSgd: 0, enabledByDefault: false },
  { amountSgd: 100, tier: "medium", instantPrizeCapSgd: 0, enabledByDefault: false },
  { amountSgd: 200, tier: "large", instantPrizeCapSgd: 0, enabledByDefault: false },
];

/** 自用代金默认档：10 / 20 / 50 / 100 / 200 · 默认全开 */
const SELF_USE_VOUCHER_TIERS: VoucherTierTemplate[] = [
  { amountSgd: 10, tier: "small", instantPrizeCapSgd: 0, enabledByDefault: true },
  { amountSgd: 20, tier: "small", instantPrizeCapSgd: 0, enabledByDefault: true },
  { amountSgd: 50, tier: "medium", instantPrizeCapSgd: 0, enabledByDefault: true },
  { amountSgd: 100, tier: "medium", instantPrizeCapSgd: 0, enabledByDefault: true },
  { amountSgd: 200, tier: "large", instantPrizeCapSgd: 0, enabledByDefault: true },
];

/** 纯代金最低面额 SGD */
export const VOUCHER_TEMPLATE_MIN_FACE_SGD = 2;

/** Snapshot stored on Campaign at create time */
export interface RulesSnapshot {
  templateId: TemplateId;
  kind: TemplateKind;
  allowDiscount: boolean;
  discountPercent: number;
  sellerCommissionPercent: number;
  platformFeePercent: number;
  prizePoolPercent: number;
  shareSellingEnabled: boolean;
  campaignType: string;
  instantPoolRatio: number;
  /** @deprecated Always 0; mid tier folded into deferred (grand) pool */
  midPoolRatio: number;
  /** Deferred pool ratio (= 100 − instantPoolRatio) */
  grandPoolRatio: number;
  enabledTiers: number[];
  prizePackId: PrizePackId;
  prizePack?: PrizePackSnapshot | null;
  /**
   * Store-customizable deferred prizes (name/icon/target).
   * All prizes share one deferred pool; countdown algorithm is fixed.
   */
  grandPrizes?: CampaignGrandPrize[];
  /** 独享总扣点 %；非独享 null/undefined */
  exclusiveFeeTotalPercent?: number | null;
  /** 独享小奖 %（可自定义） */
  exclusiveSmallPrizePercent?: number | null;
  /** 独享平台服务费 %（固定 2） */
  exclusivePlatformFeePercent?: number | null;
  /** 独享大奖 %（可自定义） */
  exclusiveGrandPoolPercent?: number | null;
  /** 企业自定义模版 id（若有） */
  businessTemplateId?: string | null;
  productKind?: "self_use" | "distribution";
  /**
   * 原价代金最低消费倍数：0/缺省=无门槛；10=券面×10（A2）
   * 核销时账单金额须 ≥ 券面×倍数
   */
  minSpendMultiplier?: number | null;
  /** 是否启用入箱票（独享抽奖仪式） */
  ballotEnabled?: boolean | null;
  packKind?: string | null;
  snapshottedAt: string;
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: "voucher_discount",
    nameZh: "折扣代金券",
    nameEn: "Discount voucher",
    icon: "🏷️",
    taglineZh: "充 P 得 F（如 9 折充 90 得 100）· 核销按现金分账 · 可提现 · 无抽奖",
    taglineEn: "Pay P get F (e.g. pay 90 get 100) · redeem fees on cash · withdrawable · no draw",
    rules: {
      kind: "voucher_discount",
      allowDiscount: true,
      discountPercentDefault: 20,
      /** Floor above platform 1.5% + seller 5% = 6.5%; 8% leaves ~1.5pp buffer */
      discountPercentMin: 8,
      discountPercentMax: 30,
      sellerCommissionPercent: 5,
      platformFeePercent: 1.5,
      prizePoolPercent: 0,
      shareSellingDefault: true,
      campaignType: "voucher_sale",
      instantPoolRatio: 0,
      midPoolRatio: 0,
      grandPoolRatio: 0,
      tiers: VOUCHER_TIERS.map((t) => ({ ...t })),
      prizePackId: "none",
      exclusiveFeeTotalPercent: null,
      defaultProductKind: "distribution",
    },
    editable: [
      "name",
      "description",
      "color",
      "startDate",
      "endDate",
      "discountPercent",
      "enabledTiers",
      "partners",
      "shareSelling",
    ],
  },
  {
    id: "draw_standard",
    nameZh: "梦想大奖池",
    nameEn: "Dream grand prize pool",
    icon: "🎰",
    taglineZh: "即时必中小奖 · 余额全额可用 · 到店核销 20% 进奖池",
    taglineEn: "Instant wins · full balance · 20% of each redeem funds the prize pool",
    rules: {
      kind: "draw",
      allowDiscount: false,
      discountPercentDefault: 0,
      discountPercentMin: 0,
      discountPercentMax: 0,
      sellerCommissionPercent: 5,
      platformFeePercent: 1.5,
      /** Model A: no purchase-time pool skim; pool funded on redeem via campaign.budgetPercent */
      prizePoolPercent: 0,
      shareSellingDefault: true,
      campaignType: "lucky_draw_v2",
      instantPoolRatio: 20,
      midPoolRatio: 0,
      grandPoolRatio: 80,
      tiers: DRAW_TIERS.map((t) => ({ ...t })),
      /** Default prize pack; store may rename / retarget prizes */
      prizePackId: "default_grand_v1",
      exclusiveFeeTotalPercent: null,
      defaultProductKind: "distribution",
    },
    editable: [
      "name",
      "description",
      "color",
      "startDate",
      "endDate",
      "enabledTiers",
      "partners",
      "shareSelling",
      "grandPrizes",
    ],
  },
  {
    id: "share_boost",
    nameZh: "达人分享券",
    nameEn: "Influencer share voucher",
    icon: "🔗",
    taglineZh: "分享卖货 · 折扣 ≥8% · 佣金随核销 · 无抽奖",
    taglineEn: "Share selling · discount ≥8% · commission on redeem · no draw",
    baseTemplateId: "voucher_discount",
    rules: {
      kind: "share_packaging",
      allowDiscount: true,
      discountPercentDefault: 20,
      discountPercentMin: 8,
      discountPercentMax: 30,
      sellerCommissionPercent: 5,
      platformFeePercent: 1.5,
      prizePoolPercent: 0,
      shareSellingDefault: true,
      campaignType: "voucher_sale",
      instantPoolRatio: 0,
      midPoolRatio: 0,
      grandPoolRatio: 0,
      tiers: VOUCHER_TIERS.map((t) => ({ ...t })),
      prizePackId: "none",
      exclusiveFeeTotalPercent: null,
      defaultProductKind: "distribution",
    },
    editable: [
      "name",
      "description",
      "color",
      "startDate",
      "endDate",
      "discountPercent",
      "enabledTiers",
      "partners",
    ],
  },
  {
    id: "self_use_voucher",
    nameZh: "自用代金券",
    nameEn: "Self-use voucher",
    icon: "💳",
    taglineZh: "默认 10/20/50/100/200 · 9 折（付 90 得 100）· 集团内 · 无抽奖",
    taglineEn: "Faces 10–200 · 10% off · group only · no draw",
    rules: {
      kind: "voucher_discount",
      allowDiscount: true,
      discountPercentDefault: 10,
      discountPercentMin: 8,
      discountPercentMax: 20,
      sellerCommissionPercent: 0,
      platformFeePercent: 0,
      prizePoolPercent: 0,
      shareSellingDefault: false,
      campaignType: "voucher_sale",
      instantPoolRatio: 0,
      midPoolRatio: 0,
      grandPoolRatio: 0,
      tiers: SELF_USE_VOUCHER_TIERS.map((t) => ({ ...t })),
      prizePackId: "none",
      exclusiveFeeTotalPercent: null,
      defaultProductKind: "self_use",
    },
    editable: [
      "name",
      "description",
      "color",
      "startDate",
      "endDate",
      "discountPercent",
      "enabledTiers",
    ],
  },
  {
    id: "exclusive_draw_15",
    nameZh: "独享抽奖 · 标准 15%",
    nameEn: "Exclusive draw · 15%",
    icon: "🎯",
    taglineZh: "付款扣 15%（小奖3+服务费2+大奖10）· 档位 50/100/200 · 公司仅可开一个独享",
    taglineEn: "Pay-time 15% (3+2+10) · tiers 50/100/200 · one exclusive per company",
    rules: {
      kind: "draw",
      allowDiscount: false,
      discountPercentDefault: 0,
      discountPercentMin: 0,
      discountPercentMax: 0,
      sellerCommissionPercent: 0,
      platformFeePercent: 2,
      prizePoolPercent: 0,
      shareSellingDefault: false,
      campaignType: "lucky_draw_v2",
      instantPoolRatio: 20,
      midPoolRatio: 0,
      grandPoolRatio: 80,
      tiers: DRAW_TIERS.map((t) => ({ ...t })),
      prizePackId: "default_grand_v1",
      exclusiveFeeTotalPercent: 15,
      defaultProductKind: "self_use",
    },
    editable: [
      "name",
      "description",
      "color",
      "startDate",
      "endDate",
      "enabledTiers",
      "grandPrizes",
    ],
  },
  {
    id: "exclusive_draw_10",
    nameZh: "独享抽奖 · 轻量 10%",
    nameEn: "Exclusive draw · 10%",
    icon: "✨",
    taglineZh: "付款扣 10%（小奖3+服务费2+大奖5）· 档位 50/100/200 · 公司仅可开一个独享",
    taglineEn: "Pay-time 10% (3+2+5) · tiers 50/100/200 · one exclusive per company",
    rules: {
      kind: "draw",
      allowDiscount: false,
      discountPercentDefault: 0,
      discountPercentMin: 0,
      discountPercentMax: 0,
      sellerCommissionPercent: 0,
      platformFeePercent: 2,
      prizePoolPercent: 0,
      shareSellingDefault: false,
      campaignType: "lucky_draw_v2",
      instantPoolRatio: 20,
      midPoolRatio: 0,
      grandPoolRatio: 80,
      tiers: DRAW_TIERS.map((t) => ({ ...t })),
      prizePackId: "default_grand_v1",
      exclusiveFeeTotalPercent: 10,
      defaultProductKind: "self_use",
    },
    editable: [
      "name",
      "description",
      "color",
      "startDate",
      "endDate",
      "enabledTiers",
      "grandPrizes",
    ],
  },
];

export function getTemplate(id: string): CampaignTemplate | undefined {
  return CAMPAIGN_TEMPLATES.find((t) => t.id === id);
}

export function listTemplates(): CampaignTemplate[] {
  return CAMPAIGN_TEMPLATES;
}

export interface BuildSnapshotInput {
  templateId: TemplateId;
  discountPercent?: number;
  enabledTiers?: number[];
  shareSellingEnabled?: boolean;
  /** Optional store overrides for grand prize names/targets */
  grandPrizes?: Partial<CampaignGrandPrize>[];
}

export function buildRulesSnapshot(input: BuildSnapshotInput): RulesSnapshot {
  const tpl = getTemplate(input.templateId);
  if (!tpl) throw new Error(`Unknown template: ${input.templateId}`);

  const { rules } = tpl;
  let discountPercent = rules.discountPercentDefault;
  if (rules.allowDiscount && input.discountPercent != null) {
    discountPercent = Math.min(
      rules.discountPercentMax,
      Math.max(rules.discountPercentMin, Math.round(input.discountPercent))
    );
  }
  if (!rules.allowDiscount) discountPercent = 0;

  const defaultTiers = rules.tiers.filter((t) => t.enabledByDefault).map((t) => t.amountSgd);
  const allowed = new Set(rules.tiers.map((t) => t.amountSgd));
  let enabledTiers: number[];
  if (rules.kind === "voucher_discount") {
    // 代金：允许任意整数面额 ≥ S$2（不限于模板预置档）
    const raw = (input.enabledTiers ?? defaultTiers).map((a) => Math.round(Number(a)));
    enabledTiers = raw.filter(
      (a) => Number.isFinite(a) && a >= VOUCHER_TEMPLATE_MIN_FACE_SGD
    );
  } else {
    enabledTiers = (input.enabledTiers ?? defaultTiers).filter((a) => allowed.has(a));
  }
  if (enabledTiers.length === 0) enabledTiers = defaultTiers;

  const shareSellingEnabled =
    tpl.id === "share_boost"
      ? true
      : input.shareSellingEnabled ?? rules.shareSellingDefault;

  const prizePackId = rules.prizePackId;
  const prizePack = snapshotPrizePack(prizePackId);
  const grandPrizes =
    prizePackId !== "none"
      ? normalizeCampaignGrandPrizes(prizePackId, input.grandPrizes)
      : undefined;

  // Dual pool: draw templates use 20% small / 80% grand
  const instantPoolRatio =
    rules.kind === "draw"
      ? 20
      : Math.min(100, Math.max(0, Math.round(rules.instantPoolRatio)));
  const grandPoolRatio = 100 - instantPoolRatio;

  // Model A: draw templates never skim prize pool at purchase (redeem funds pool)
  // 独享例外：付款时扣点进池，不在 purchase split 的 prizePoolPercent 里
  const prizePoolPercent = rules.kind === "draw" ? 0 : rules.prizePoolPercent;

  // 自用代金：面额限制在模版档内（10/20/50/100/200）
  if (input.templateId === "self_use_voucher") {
    const allowedSelf = new Set(rules.tiers.map((t) => t.amountSgd));
    enabledTiers = enabledTiers.filter((a) => allowedSelf.has(a));
    if (enabledTiers.length === 0) {
      enabledTiers = rules.tiers
        .filter((t) => t.enabledByDefault)
        .map((t) => t.amountSgd);
    }
  }

  return {
    templateId: input.templateId,
    kind: rules.kind,
    allowDiscount: rules.allowDiscount,
    discountPercent,
    sellerCommissionPercent: rules.sellerCommissionPercent,
    platformFeePercent: rules.platformFeePercent,
    prizePoolPercent,
    shareSellingEnabled,
    campaignType: rules.campaignType,
    instantPoolRatio,
    midPoolRatio: 0,
    grandPoolRatio,
    enabledTiers: enabledTiers.sort((a, b) => a - b),
    prizePackId,
    prizePack,
    grandPrizes,
    exclusiveFeeTotalPercent: rules.exclusiveFeeTotalPercent,
    productKind: rules.defaultProductKind,
    snapshottedAt: new Date().toISOString(),
  };
}

/** 从活动 snapshot 解析独享费率档（兼容旧调用） */
export function exclusivePlanFromSnapshot(
  snapshot: RulesSnapshot | null | undefined
): ExclusiveFeePlan {
  return exclusiveConfigFromSnapshot(snapshot).plan;
}

/** 完整独享费率（支持企业自定义 total/small/grand，平台固定 2%） */
export function exclusiveConfigFromSnapshot(
  snapshot: RulesSnapshot | null | undefined
): ExclusiveFeeConfig {
  if (!snapshot) return getExclusiveFeePercents("exclusive_15");

  if (
    snapshot.exclusiveSmallPrizePercent != null ||
    snapshot.exclusiveGrandPoolPercent != null ||
    (snapshot.exclusiveFeeTotalPercent != null &&
      snapshot.exclusiveFeeTotalPercent !== 15 &&
      snapshot.exclusiveFeeTotalPercent !== 10)
  ) {
    return normalizeExclusiveFeeConfig({
      plan:
        snapshot.templateId === "exclusive_draw_10"
          ? "exclusive_10"
          : "exclusive_15",
      totalPercent: snapshot.exclusiveFeeTotalPercent,
      smallPrizePercent: snapshot.exclusiveSmallPrizePercent,
      grandPoolPercent: snapshot.exclusiveGrandPoolPercent,
    });
  }

  if (
    snapshot.exclusiveFeeTotalPercent === 10 ||
    snapshot.templateId === "exclusive_draw_10"
  ) {
    return getExclusiveFeePercents("exclusive_10");
  }
  return getExclusiveFeePercents("exclusive_15");
}

export function exclusivePlanFromCampaign(campaign: {
  templateId?: string | null;
  rulesSnapshot?: string | null;
  productKind?: string | null;
}): ExclusiveFeePlan {
  return exclusiveConfigFromCampaign(campaign).plan;
}

export function exclusiveConfigFromCampaign(campaign: {
  templateId?: string | null;
  rulesSnapshot?: string | null;
  productKind?: string | null;
}): ExclusiveFeeConfig {
  const snap = parseRulesSnapshot(campaign.rulesSnapshot);
  if (snap) return exclusiveConfigFromSnapshot(snap);
  if (campaign.templateId === "exclusive_draw_10") {
    return getExclusiveFeePercents("exclusive_10");
  }
  return getExclusiveFeePercents("exclusive_15");
}

export interface PurchaseSplit {
  faceCents: number;
  paidCents: number;
  discountCents: number;
  sellerCommissionCents: number;
  platformFeeCents: number;
  prizePoolCents: number;
  redeemReserveCents: number;
}

export function computePurchaseSplit(
  faceCents: number,
  snapshot: Pick<
    RulesSnapshot,
    | "discountPercent"
    | "sellerCommissionPercent"
    | "platformFeePercent"
    | "prizePoolPercent"
  >,
  hasSeller: boolean
): PurchaseSplit {
  if (faceCents <= 0) throw new Error("faceCents must be positive");

  const paidCents = Math.round(faceCents * (100 - snapshot.discountPercent) / 100);
  const discountCents = faceCents - paidCents;

  const sellerCommissionCents = hasSeller
    ? Math.floor(paidCents * snapshot.sellerCommissionPercent / 100)
    : 0;
  const platformFeeCents = Math.floor(paidCents * snapshot.platformFeePercent / 100);
  const prizePoolCents = Math.floor(paidCents * snapshot.prizePoolPercent / 100);
  const redeemReserveCents =
    paidCents - sellerCommissionCents - platformFeeCents - prizePoolCents;

  return {
    faceCents,
    paidCents,
    discountCents,
    sellerCommissionCents,
    platformFeeCents,
    prizePoolCents,
    redeemReserveCents,
  };
}

export function parseRulesSnapshot(raw: string | null | undefined): RulesSnapshot | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as RulesSnapshot;
    if (!o?.templateId || o.sellerCommissionPercent == null) return null;
    if (!o.prizePackId) {
      o.prizePackId = o.kind === "draw" ? "default_grand_v1" : "none";
    }
    // Model A migration: old draw snapshots had purchase-time 20% pool — force 0
    if (o.kind === "draw" || o.templateId === "draw_standard" || o.campaignType === "lucky_draw_v2") {
      o.prizePoolPercent = 0;
    }
    // 独享模版补全费率
    if (o.templateId === "exclusive_draw_10") {
      o.exclusiveFeeTotalPercent = o.exclusiveFeeTotalPercent ?? 10;
      o.productKind = "self_use";
    } else if (o.templateId === "exclusive_draw_15") {
      o.exclusiveFeeTotalPercent = o.exclusiveFeeTotalPercent ?? 15;
      o.productKind = "self_use";
    } else if (o.templateId === "self_use_voucher") {
      o.productKind = "self_use";
    }
    return o;
  } catch {
    return null;
  }
}

/**
 * Legacy campaigns without rulesSnapshot.
 * budgetPercent is the *redeem* fee rate (stored on Campaign), not purchase skim.
 * prizePoolPercent at purchase is always 0 (model A).
 */
export function legacyDrawSnapshot(_redeemFeePercent = 20): RulesSnapshot {
  const prizePackId: PrizePackId = "default_grand_v1";
  return {
    templateId: "draw_standard",
    kind: "draw",
    allowDiscount: false,
    discountPercent: 0,
    sellerCommissionPercent: 5,
    platformFeePercent: 1.5,
    prizePoolPercent: 0,
    shareSellingEnabled: true,
    campaignType: "lucky_draw_v2",
    instantPoolRatio: 20,
    midPoolRatio: 0,
    grandPoolRatio: 80,
    enabledTiers: [50, 100, 200],
    prizePackId,
    prizePack: snapshotPrizePack(prizePackId),
    grandPrizes: normalizeCampaignGrandPrizes(prizePackId),
    snapshottedAt: new Date(0).toISOString(),
  };
}

/** Whether this snapshot is a draw product (instant + deferred prizes). */
export function isDrawSnapshot(snapshot: Pick<RulesSnapshot, "kind" | "campaignType" | "prizePackId">): boolean {
  return (
    snapshot.kind === "draw" ||
    snapshot.campaignType === "lucky_draw_v2" ||
    (snapshot.prizePackId != null && snapshot.prizePackId !== "none")
  );
}

/** Resolve pack for UI / pool display from snapshot */
export function prizePackFromSnapshot(snapshot: RulesSnapshot | null) {
  if (!snapshot?.prizePackId) return getPrizePack("default_grand_v1");
  return getPrizePack(snapshot.prizePackId);
}

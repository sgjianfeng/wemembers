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
  | "share_boost";

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
 * 纯代金券档位：≥S$2（无抽奖）。与抽奖三档分离。
 * 也允许创建时传入列表外的整数面额（≥2），见 buildRulesSnapshot。
 */
const VOUCHER_TIERS: VoucherTierTemplate[] = [
  { amountSgd: 2, tier: "small", instantPrizeCapSgd: 0, enabledByDefault: false },
  { amountSgd: 5, tier: "small", instantPrizeCapSgd: 0, enabledByDefault: false },
  { amountSgd: 10, tier: "small", instantPrizeCapSgd: 0, enabledByDefault: true },
  { amountSgd: 50, tier: "small", instantPrizeCapSgd: 0, enabledByDefault: false },
  { amountSgd: 100, tier: "medium", instantPrizeCapSgd: 0, enabledByDefault: false },
  { amountSgd: 200, tier: "large", instantPrizeCapSgd: 0, enabledByDefault: false },
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
  const prizePoolPercent = rules.kind === "draw" ? 0 : rules.prizePoolPercent;

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
    snapshottedAt: new Date().toISOString(),
  };
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

/**
 * 国庆满赠活动（Spend & Get + 低权重大奖签）
 *
 * 顾客口径：
 * - 满 S$120 → 送 S$61 下次用 + 赠送 1 次大奖抽奖机会
 * - 购券（S$100 档）中奖机会约为赠送的 5 倍（赠送权重 = 100 购券 × 0.2）
 * - 无即时小奖
 *
 * 发放时钟：手机绑定成功 = issuedAt；S$61 自 issuedAt 起 30 天
 */
import type { Prisma } from "@prisma/client";
import { generateQrCode } from "@/lib/utils";
import { normalizePhoneLocal } from "@/lib/physical-tickets";
import {
  findOrCreateCustomerByPhone as findOrCreateCustomerByPhoneShared,
} from "@/lib/customer-by-phone";
import {
  calculateTierWeight,
  resolveTier,
} from "@/lib/draw-v2";
import { EXCLUSIVE_GIFT_WEIGHT_FACTOR } from "@/lib/exclusive-fees";
import { allocateShortCode } from "@/lib/voucher-short-code";
import {
  computeNdpGiftExpiry,
  buildTermsDatesView,
  type TermsDatesView,
} from "@/lib/validity";

export const NDP_MIN_SPEND_CENTS = 12_000; // S$120
export const NDP_GIFT_COUPON_CENTS = 6_100; // S$61
export const NDP_VALID_DAYS = 30;
/** 权重参照档：S$100 购券 */
export const NDP_WEIGHT_REF_FACE_CENTS = 10_000;
export const NDP_GIFT_WEIGHT_FACTOR = EXCLUSIVE_GIFT_WEIGHT_FACTOR; // 0.2
export const NDP_COUPON_TITLE_ZH = "国庆赠送券 S$61";
export const NDP_COUPON_TITLE_EN = "National Day Gift S$61";
/** 国庆默认不双重保护：活动截止不缩短已领 30 天 */
export const NDP_DUAL_PROTECTION_DEFAULT = false;

/**
 * 国庆活动默认截止：当年 8 月 31 日 23:59:59（新加坡 UTC+8）。
 * 若当前已过该日，则落到次年 8/31。
 */
export function defaultNdpActivityEnd(from: Date = new Date()): Date {
  const y = from.getUTCFullYear();
  // Aug 31 23:59:59.999 SGT = 15:59:59.999 UTC
  let end = new Date(Date.UTC(y, 7, 31, 15, 59, 59, 999));
  if (from.getTime() > end.getTime()) {
    end = new Date(Date.UTC(y + 1, 7, 31, 15, 59, 59, 999));
  }
  return end;
}

/** 国庆活动默认开始：当年 8 月 1 日 00:00 SGT（已过则次年） */
export function defaultNdpActivityStart(from: Date = new Date()): Date {
  const end = defaultNdpActivityEnd(from);
  const y = end.getUTCFullYear();
  // Aug 1 00:00:00 SGT = Jul 31 16:00 UTC
  return new Date(Date.UTC(y, 6, 31, 16, 0, 0, 0));
}

type Tx = Prisma.TransactionClient;

export type NdpRules = {
  minSpendCents: number;
  giftCouponCents: number;
  validDays: number;
  weightRefFaceCents: number;
  giftWeightFactor: number;
  /** true = 核销也受活动截止限制（取较早） */
  dualProtection: boolean;
};

export const DEFAULT_NDP_RULES: NdpRules = {
  minSpendCents: NDP_MIN_SPEND_CENTS,
  giftCouponCents: NDP_GIFT_COUPON_CENTS,
  validDays: NDP_VALID_DAYS,
  weightRefFaceCents: NDP_WEIGHT_REF_FACE_CENTS,
  giftWeightFactor: NDP_GIFT_WEIGHT_FACTOR,
  dualProtection: NDP_DUAL_PROTECTION_DEFAULT,
};

/** S$100 全余额持有时的购券权重（无核销） */
export function paidHundredDrawWeight(
  refFaceCents: number = NDP_WEIGHT_REF_FACE_CENTS
): number {
  const sgd = refFaceCents / 100;
  const tier = resolveTier(sgd)?.tier ?? "medium";
  return calculateTierWeight(refFaceCents, tier, refFaceCents, 0, 0);
}

/**
 * 赠送大奖签权重 = 参照购券权重 × giftFactor（默认 0.2 → 购券为赠送的 5 倍）
 * 使用 floor 且至少为 1，保证弱签仍可进池
 */
export function giftGrandDrawWeight(
  rules: Pick<NdpRules, "weightRefFaceCents" | "giftWeightFactor"> = DEFAULT_NDP_RULES
): number {
  const paid = paidHundredDrawWeight(rules.weightRefFaceCents);
  const factor =
    rules.giftWeightFactor > 0 ? rules.giftWeightFactor : NDP_GIFT_WEIGHT_FACTOR;
  return Math.max(1, Math.round(paid * factor));
}

/** 购券相对赠送的倍数（展示用，约 5） */
export function paidVsGiftWeightMultiple(
  rules: Pick<NdpRules, "weightRefFaceCents" | "giftWeightFactor"> = DEFAULT_NDP_RULES
): number {
  const gift = giftGrandDrawWeight(rules);
  const paid = paidHundredDrawWeight(rules.weightRefFaceCents);
  if (gift <= 0) return 0;
  return paid / gift;
}

/** @deprecated 使用 computeNdpGiftExpiry；保留简单加法兼容旧测试 */
export function expiresAtFromIssued(
  issuedAt: Date,
  validDays: number = NDP_VALID_DAYS
): Date {
  return computeNdpGiftExpiry({
    obtainedAt: issuedAt,
    validDays,
    activityEnd: new Date(issuedAt.getTime() + 365 * 864e5),
    dualProtection: false,
  }).expiresAt;
}

/** 国庆发放时计算有效至（相对优先，默认无双重保护） */
export function computeNdpExpiresAt(input: {
  obtainedAt: Date;
  validDays: number;
  activityEnd: Date;
  dualProtection?: boolean;
}) {
  return computeNdpGiftExpiry({
    obtainedAt: input.obtainedAt,
    validDays: input.validDays,
    activityEnd: input.activityEnd,
    dualProtection: input.dualProtection ?? NDP_DUAL_PROTECTION_DEFAULT,
  });
}

/** 国庆落地页 / 活动券 四行日期与条款 */
export function buildNdpTermsDatesView(campaign: {
  startDate: Date;
  endDate: Date;
  description?: string | null;
}, rules: NdpRules): TermsDatesView {
  const minSgd = (rules.minSpendCents / 100).toFixed(0);
  const giftSgd = (rules.giftCouponCents / 100).toFixed(0);
  return buildTermsDatesView({
    activityStart: campaign.startDate,
    activityEnd: campaign.endDate,
    entitlementValidDays: rules.validDays,
    dualProtection: rules.dualProtection,
    activityTermsZh: [
      `活动期内消费满 S$${minSgd} 可领赠送券 S$${giftSgd}`,
      "一桌一券（4 人以内），每桌限领一份",
      "不可与其他优惠、折扣或促销同时使用",
      "购券路径可获更高权重大奖资格；现金可走前台凭票",
      "活动结束后停止新领取；已领券按权益条款继续有效",
      "本公司保留调整活动规则、暂停或终止活动之权利；解释权归本公司",
      ...(campaign.description ? [campaign.description] : []),
    ],
    activityTermsEn: [
      `During activity, spend ≥ S$${minSgd} to claim S$${giftSgd} gift`,
      "One voucher per table (up to 4 guests)",
      "Cannot be combined with other offers, discounts, or promotions",
      "Buy voucher for higher draw weight; cash path via counter receipt",
      "No new claims after activity end; held gifts keep perk validity",
      "Merchant may adjust, suspend, or end the promo; final interpretation reserved",
    ],
    entitlementTermsZh: [
      `领券后 ${rules.validDays} 天内有效（有效至以到账页为准）`,
      rules.dualProtection
        ? "已开启双重保护：与活动截止取较早"
        : "活动截止不缩短已领券的有效天数",
      `面额 S$${giftSgd} · 下次消费使用 · 不可兑现 · 一次核销`,
      "不可与其他优惠叠加使用",
      "一桌一券（4 人以内）",
      "仅倒计时大奖 · 无即时小奖",
      "本公司有权在合理范围内调整使用规则",
    ],
    entitlementTermsEn: [
      `Valid ${rules.validDays} days from claim (see valid-until on perk)`,
      rules.dualProtection
        ? "Dual protection on: earlier of relative days vs activity end"
        : "Activity end does not shorten held gift validity",
      `Face S$${giftSgd} · next visit · non-cash · one-time redeem`,
      "Cannot stack with other promotions",
      "One voucher per table (≤4 guests)",
      "Grand countdown only · no small prizes",
      "Merchant may reasonably adjust redeem rules",
    ],
  });
}

/** 海报底部精简条款（台卡空间有限） */
export function ndpPosterTermsLine(
  lang: "zh" | "en" = "zh",
  rules: Pick<NdpRules, "validDays"> = DEFAULT_NDP_RULES
): string {
  if (lang === "en") {
    return `Valid ${rules.validDays}d after claim · no stacking · 1/table (≤4) · subject to change`;
  }
  return `领后${rules.validDays}天有效 · 不可叠优惠 · 一桌一券(≤4人) · 本店有权调整`;
}

export function buildReceiptFingerprint(input: {
  campaignId: string;
  storeId: string | null | undefined;
  phone: string;
  receiptAmountCents: number;
  receiptNote?: string | null;
  dayKey?: string;
}): string {
  const day =
    input.dayKey ||
    new Date().toISOString().slice(0, 10); // UTC date; fine for dedupe window
  const note = (input.receiptNote || "").trim().toLowerCase();
  const phone = normalizePhoneLocal(input.phone);
  return [
    input.campaignId,
    input.storeId || "",
    phone,
    input.receiptAmountCents,
    note,
    day,
  ].join("|");
}

export type NdpCampaignMeta = NdpRules & {
  enabled: boolean;
  /** 购券页 slug（活动页「购券冲大奖」） */
  buyVoucherSlug: string | null;
};

export function parseNdpMetaFromCampaign(campaign: {
  rulesSnapshot?: string | null;
  type?: string | null;
  tags?: string | null;
  name?: string | null;
}): NdpCampaignMeta {
  const rules = parseNdpRulesFromSnapshot(campaign.rulesSnapshot);
  let enabled = false;
  let buyVoucherSlug: string | null = null;

  if (campaign.type === "holiday") enabled = true;
  if (campaign.name && /国庆|national\s*day|ndp/i.test(campaign.name)) {
    enabled = true;
  }
  if (campaign.tags) {
    try {
      const tags = JSON.parse(campaign.tags) as unknown;
      if (Array.isArray(tags) && tags.some((t) => /ndp|national|国庆/i.test(String(t)))) {
        enabled = true;
      }
    } catch {
      if (/ndp|national|国庆/i.test(campaign.tags)) enabled = true;
    }
  }

  if (campaign.rulesSnapshot) {
    try {
      const raw = JSON.parse(campaign.rulesSnapshot) as Record<string, unknown>;
      const ndp =
        raw.ndp && typeof raw.ndp === "object"
          ? (raw.ndp as Record<string, unknown>)
          : null;
      if (ndp) {
        if (ndp.enabled === false) enabled = false;
        else if (ndp.enabled === true) enabled = true;
        else enabled = true; // 有 ndp 块即开启
        if (typeof ndp.buyVoucherSlug === "string" && ndp.buyVoucherSlug.trim()) {
          buyVoucherSlug = ndp.buyVoucherSlug.trim();
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { ...rules, enabled, buyVoucherSlug };
}

export function parseNdpRulesFromSnapshot(
  rulesSnapshot: string | null | undefined
): NdpRules {
  const base = { ...DEFAULT_NDP_RULES };
  if (!rulesSnapshot) return base;
  try {
    const raw = JSON.parse(rulesSnapshot) as Record<string, unknown>;
    const ndp =
      raw.ndp && typeof raw.ndp === "object"
        ? (raw.ndp as Record<string, unknown>)
        : raw;
    if (typeof ndp.minSpendCents === "number") {
      base.minSpendCents = Math.round(ndp.minSpendCents);
    }
    if (typeof ndp.giftCouponCents === "number") {
      base.giftCouponCents = Math.round(ndp.giftCouponCents);
    }
    if (typeof ndp.validDays === "number") {
      base.validDays = Math.max(1, Math.round(ndp.validDays));
    }
    if (typeof ndp.weightRefFaceCents === "number") {
      base.weightRefFaceCents = Math.round(ndp.weightRefFaceCents);
    }
    if (typeof ndp.giftWeightFactor === "number" && ndp.giftWeightFactor > 0) {
      base.giftWeightFactor = ndp.giftWeightFactor;
    }
    if (typeof ndp.dualProtection === "boolean") {
      base.dualProtection = ndp.dualProtection;
    }
  } catch {
    /* keep defaults */
  }
  return base;
}

/** 标准国庆 rulesSnapshot JSON */
export function buildNdpRulesSnapshot(extra?: {
  buyVoucherSlug?: string | null;
  enabled?: boolean;
  dualProtection?: boolean;
}): string {
  return JSON.stringify({
    ndp: {
      enabled: extra?.enabled !== false,
      minSpendCents: NDP_MIN_SPEND_CENTS,
      giftCouponCents: NDP_GIFT_COUPON_CENTS,
      validDays: NDP_VALID_DAYS,
      weightRefFaceCents: NDP_WEIGHT_REF_FACE_CENTS,
      giftWeightFactor: NDP_GIFT_WEIGHT_FACTOR,
      dualProtection:
        extra?.dualProtection ?? NDP_DUAL_PROTECTION_DEFAULT,
      buyVoucherSlug: extra?.buyVoucherSlug || null,
    },
  });
}

/** 确保活动下有一张 S$61 固定面额满赠券模版 */
export async function ensureNdpGiftCoupon(
  tx: Tx,
  params: {
    businessId: string;
    campaignId: string;
    giftCouponCents: number;
    /** 模版 validUntil 拉长，真实到期用 CustomerCoupon.expiresAt */
    templateValidUntil: Date;
  }
) {
  const existing = await tx.coupon.findFirst({
    where: {
      businessId: params.businessId,
      campaignId: params.campaignId,
      type: "fixed_amount",
      valueCents: params.giftCouponCents,
      status: { in: ["published", "draft"] },
    },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    if (existing.status !== "published") {
      return tx.coupon.update({
        where: { id: existing.id },
        data: {
          status: "published",
          validUntil: params.templateValidUntil,
          perCustomerLimit: 999,
        },
      });
    }
    return existing;
  }

  const coupon = await tx.coupon.create({
    data: {
      businessId: params.businessId,
      campaignId: params.campaignId,
      title: NDP_COUPON_TITLE_ZH,
      description:
        "国庆满赠 · 自领取绑定起 30 天有效 · 下次消费使用 · 不可兑现",
      type: "fixed_amount",
      valueCents: params.giftCouponCents,
      minSpendCents: 0,
      pointsRequired: 0,
      totalQuantity: null,
      remainingQuantity: null,
      validFrom: new Date(),
      validUntil: params.templateValidUntil,
      status: "published",
      isGiftable: false,
      perCustomerLimit: 999,
    },
  });
  await tx.campaign.update({
    where: { id: params.campaignId },
    data: { couponCount: { increment: 1 } },
  });
  return coupon;
}

/** 发券：优先找顾客账号（兼容 +65 / 本地号），不误伤同号企业/店员 */
export async function findOrCreateCustomerByPhone(
  tx: Tx,
  phoneRaw: string
): Promise<{ id: string; phone: string; created: boolean }> {
  return findOrCreateCustomerByPhoneShared(tx, phoneRaw);
}

export type IssueNdpGrantInput = {
  campaignId: string;
  businessId: string;
  storeId?: string | null;
  staffUserId?: string | null;
  phone: string;
  /** receipt | comp */
  channel: "receipt" | "comp";
  receiptAmountCents: number;
  receiptNote?: string | null;
  /** 跳过门槛（仅 channel=comp） */
  skipMinSpend?: boolean;
  productKind?: string;
};

export type IssueNdpGrantResult = {
  grantId: string;
  customerId: string;
  phone: string;
  issuedAt: string;
  expiresAt: string;
  giftCoupon: {
    customerCouponId: string;
    qrCode: string;
    valueCents: number;
    expiresAt: string;
  };
  drawEntry: {
    voucherId: string;
    shortCode: string | null;
    drawWeight: number;
    paidReferenceWeight: number;
    weightMultiple: number;
  };
  rules: NdpRules;
};

/**
 * 手机绑定后发放：S$61 CustomerCoupon + 零余额 gift 大奖 Voucher（无即时小奖）
 */
export async function issueNdpGrantDual(
  tx: Tx,
  input: IssueNdpGrantInput
): Promise<IssueNdpGrantResult> {
  const campaign = await tx.campaign.findFirst({
    where: { id: input.campaignId, businessId: input.businessId },
    select: {
      id: true,
      status: true,
      type: true,
      startDate: true,
      endDate: true,
      rulesSnapshot: true,
      productKind: true,
      name: true,
    },
  });
  if (!campaign) {
    throw new Error("CAMPAIGN_NOT_FOUND");
  }
  if (campaign.status === "ended" || campaign.status === "deleted") {
    throw new Error("CAMPAIGN_ENDED");
  }

  const rules = parseNdpRulesFromSnapshot(campaign.rulesSnapshot);
  const now = new Date();
  if (now < campaign.startDate || now > campaign.endDate) {
    throw new Error("CAMPAIGN_OUT_OF_WINDOW");
  }

  const isComp = input.channel === "comp";
  if (!isComp && !input.skipMinSpend) {
    if (input.receiptAmountCents < rules.minSpendCents) {
      throw new Error("BELOW_MIN_SPEND");
    }
  }

  const phoneUser = await findOrCreateCustomerByPhone(tx, input.phone);
  const fingerprint =
    input.channel === "receipt"
      ? buildReceiptFingerprint({
          campaignId: input.campaignId,
          storeId: input.storeId,
          phone: phoneUser.phone,
          receiptAmountCents: input.receiptAmountCents,
          receiptNote: input.receiptNote,
        })
      : `comp|${input.campaignId}|${phoneUser.phone}|${now.toISOString().slice(0, 13)}`;

  if (input.channel === "receipt" && fingerprint) {
    const dup = await tx.promoGrant.findFirst({
      where: {
        receiptFingerprint: fingerprint,
        status: { in: ["claimed", "pending"] },
      },
      select: { id: true },
    });
    if (dup) {
      throw new Error("DUPLICATE_RECEIPT");
    }
  }

  const issuedAt = now;
  const validity = computeNdpExpiresAt({
    obtainedAt: issuedAt,
    validDays: rules.validDays,
    activityEnd: campaign.endDate,
    dualProtection: rules.dualProtection,
  });
  const expiresAt = validity.expiresAt;
  // 模版 validUntil 至少覆盖本次发放 + 缓冲
  const templateUntil = new Date(expiresAt.getTime());
  templateUntil.setDate(templateUntil.getDate() + 365);

  const coupon = await ensureNdpGiftCoupon(tx, {
    businessId: input.businessId,
    campaignId: input.campaignId,
    giftCouponCents: rules.giftCouponCents,
    templateValidUntil: templateUntil,
  });

  const qrCode = generateQrCode();
  const claim = await tx.customerCoupon.create({
    data: {
      customerId: phoneUser.id,
      couponId: coupon.id,
      status: "available",
      qrCode,
      claimedAt: issuedAt,
      expiresAt,
      pointsSpent: 0,
    },
  });

  await tx.coupon.update({
    where: { id: coupon.id },
    data: {
      claimedCount: { increment: 1 },
      ...(coupon.remainingQuantity !== null
        ? { remainingQuantity: { decrement: 1 } }
        : {}),
    },
  });

  const paidWeight = paidHundredDrawWeight(rules.weightRefFaceCents);
  const drawWeight = giftGrandDrawWeight(rules);
  const refTier =
    resolveTier(rules.weightRefFaceCents / 100)?.tier ?? "medium";
  const shortCode = await allocateShortCode();
  const productKind = input.productKind || campaign.productKind || "self_use";

  const voucher = await tx.voucher.create({
    data: {
      shortCode,
      customerId: phoneUser.id,
      campaignId: input.campaignId,
      storeId: input.storeId || null,
      // 参照面额仅用于档位/展示；余额 0 = 不可当钱花，仅大奖资格
      amountCents: rules.weightRefFaceCents,
      paidCents: 0,
      balanceCents: 0,
      usedCents: 0,
      withdrawnCents: 0,
      prizePoolContribution: 0,
      drawWeight,
      tier: refTier,
      status: "active",
      productKind,
      paymentMethod: "free",
      issueReason: isComp ? "marketing" : "marketing",
      issueNote: isComp
        ? `国庆Comp赠送大奖签 · ${input.receiptNote || ""}`.slice(0, 500)
        : `国庆满赠大奖签 · 消费${(input.receiptAmountCents / 100).toFixed(2)}`.slice(
            0,
            500
          ),
      issuedById: input.staffUserId || null,
    },
  });

  // 不调用 awardInstantPrizeToVoucher — 无小奖

  await tx.campaign.update({
    where: { id: input.campaignId },
    data: {
      totalClaims: { increment: 1 },
      entryCount: { increment: 1 },
      totalTicketCount: { increment: 1 },
      ...(campaign.status === "draft" ? { status: "active" } : {}),
    },
  });

  await tx.membership.upsert({
    where: {
      businessId_customerId: {
        businessId: input.businessId,
        customerId: phoneUser.id,
      },
    },
    create: {
      businessId: input.businessId,
      customerId: phoneUser.id,
      points: 0,
    },
    update: {},
  });

  const grant = await tx.promoGrant.create({
    data: {
      campaignId: input.campaignId,
      businessId: input.businessId,
      storeId: input.storeId || null,
      staffUserId: input.staffUserId || null,
      phone: phoneUser.phone,
      customerId: phoneUser.id,
      channel: input.channel,
      receiptAmountCents: input.receiptAmountCents,
      receiptNote: input.receiptNote?.trim().slice(0, 200) || null,
      receiptFingerprint: fingerprint,
      status: "claimed",
      customerCouponId: claim.id,
      voucherId: voucher.id,
      issuedAt,
      expiresAt,
    },
  });

  const multiple = paidVsGiftWeightMultiple(rules);

  return {
    grantId: grant.id,
    customerId: phoneUser.id,
    phone: phoneUser.phone,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    giftCoupon: {
      customerCouponId: claim.id,
      qrCode: claim.qrCode,
      valueCents: rules.giftCouponCents,
      expiresAt: expiresAt.toISOString(),
    },
    drawEntry: {
      voucherId: voucher.id,
      shortCode: voucher.shortCode,
      drawWeight,
      paidReferenceWeight: paidWeight,
      weightMultiple: multiple,
    },
    rules,
  };
}

export function ndpErrorMessage(code: string, lang: "zh" | "en" = "zh"): string {
  const zh: Record<string, string> = {
    CAMPAIGN_NOT_FOUND: "活动不存在",
    CAMPAIGN_ENDED: "活动已结束",
    CAMPAIGN_OUT_OF_WINDOW: "不在活动时间内",
    BELOW_MIN_SPEND: `消费未满 S$${(NDP_MIN_SPEND_CENTS / 100).toFixed(0)}，无法发放`,
    DUPLICATE_RECEIPT: "此消费单今日已发过券，请勿重复发放",
    INVALID_PHONE: "请输入有效手机号",
    PHONE_NOT_CUSTOMER:
      "该手机号的 E.164 写法已是店员/企业账号；若另有顾客账号请用其常用号码格式，或换号发券",
    NO_CUSTOMER: "券未绑定顾客，无法发放国庆赠送券",
  };
  const en: Record<string, string> = {
    CAMPAIGN_NOT_FOUND: "Campaign not found",
    CAMPAIGN_ENDED: "Campaign ended",
    CAMPAIGN_OUT_OF_WINDOW: "Outside campaign window",
    BELOW_MIN_SPEND: `Spend must be at least S$${(NDP_MIN_SPEND_CENTS / 100).toFixed(0)}`,
    DUPLICATE_RECEIPT: "This receipt was already used today",
    INVALID_PHONE: "Invalid mobile number",
    PHONE_NOT_CUSTOMER: "Phone belongs to a non-customer account",
    NO_CUSTOMER: "Voucher has no customer — cannot issue NDP gift",
  };
  return (lang === "en" ? en : zh)[code] || code;
}

export type IssueNdpCouponOnlyResult = {
  grantId: string;
  customerCouponId: string;
  qrCode: string;
  valueCents: number;
  expiresAt: string;
  issuedAt: string;
};

/**
 * 购券核销达标：只发 S$61（抽奖已在购券时付费获得，不再发赠送弱签）
 */
export async function issueNdpGiftCouponOnly(
  tx: Tx,
  input: {
    campaignId: string;
    businessId: string;
    storeId?: string | null;
    staffUserId?: string | null;
    customerId: string;
    phone?: string | null;
    receiptAmountCents: number;
    /** 幂等键，如 redeem|{usageId} */
    fingerprint: string;
    channel?: "redeem" | "receipt";
  }
): Promise<IssueNdpCouponOnlyResult | null> {
  const campaign = await tx.campaign.findFirst({
    where: { id: input.campaignId, businessId: input.businessId },
    select: {
      id: true,
      status: true,
      type: true,
      startDate: true,
      endDate: true,
      rulesSnapshot: true,
      tags: true,
      name: true,
    },
  });
  if (!campaign) return null;

  const meta = parseNdpMetaFromCampaign(campaign);
  if (!meta.enabled) return null;
  if (campaign.status === "ended" || campaign.status === "deleted") return null;

  const now = new Date();
  if (now < campaign.startDate || now > campaign.endDate) return null;
  if (input.receiptAmountCents < meta.minSpendCents) return null;

  const dup = await tx.promoGrant.findFirst({
    where: {
      receiptFingerprint: input.fingerprint,
      status: { in: ["claimed", "pending"] },
    },
    select: { id: true },
  });
  if (dup) return null;

  const customer = await tx.user.findUnique({
    where: { id: input.customerId },
    select: { id: true, phone: true, role: true },
  });
  if (!customer || customer.role !== "customer") return null;

  const phone =
    normalizePhoneLocal(input.phone || customer.phone || "") ||
    `id:${customer.id.slice(-8)}`;

  const issuedAt = now;
  const validity = computeNdpExpiresAt({
    obtainedAt: issuedAt,
    validDays: meta.validDays,
    activityEnd: campaign.endDate,
    dualProtection: meta.dualProtection,
  });
  const expiresAt = validity.expiresAt;
  const templateUntil = new Date(expiresAt.getTime());
  templateUntil.setDate(templateUntil.getDate() + 365);

  const coupon = await ensureNdpGiftCoupon(tx, {
    businessId: input.businessId,
    campaignId: input.campaignId,
    giftCouponCents: meta.giftCouponCents,
    templateValidUntil: templateUntil,
  });

  const qrCode = generateQrCode();
  const claim = await tx.customerCoupon.create({
    data: {
      customerId: customer.id,
      couponId: coupon.id,
      status: "available",
      qrCode,
      claimedAt: issuedAt,
      expiresAt,
      pointsSpent: 0,
    },
  });

  await tx.coupon.update({
    where: { id: coupon.id },
    data: {
      claimedCount: { increment: 1 },
      ...(coupon.remainingQuantity !== null
        ? { remainingQuantity: { decrement: 1 } }
        : {}),
    },
  });

  await tx.membership.upsert({
    where: {
      businessId_customerId: {
        businessId: input.businessId,
        customerId: customer.id,
      },
    },
    create: {
      businessId: input.businessId,
      customerId: customer.id,
      points: 0,
    },
    update: {},
  });

  await tx.campaign.update({
    where: { id: input.campaignId },
    data: {
      totalClaims: { increment: 1 },
      ...(campaign.status === "draft" ? { status: "active" } : {}),
    },
  });

  const grant = await tx.promoGrant.create({
    data: {
      campaignId: input.campaignId,
      businessId: input.businessId,
      storeId: input.storeId || null,
      staffUserId: input.staffUserId || null,
      phone,
      customerId: customer.id,
      channel: input.channel || "redeem",
      receiptAmountCents: input.receiptAmountCents,
      receiptNote: "auto-redeem",
      receiptFingerprint: input.fingerprint,
      status: "claimed",
      customerCouponId: claim.id,
      voucherId: null,
      issuedAt,
      expiresAt,
    },
  });

  return {
    grantId: grant.id,
    customerCouponId: claim.id,
    qrCode: claim.qrCode,
    valueCents: meta.giftCouponCents,
    expiresAt: expiresAt.toISOString(),
    issuedAt: issuedAt.toISOString(),
  };
}

/**
 * 核销成功后尝试自动发 61。
 * - 优先用券所属活动的 NDP 配置
 * - 否则找企业下进行中的国庆/holiday 活动
 */
export async function maybeIssueNdpOnVoucherRedeem(
  tx: Tx,
  params: {
    voucherCampaign: {
      id: string;
      businessId: string;
      rulesSnapshot?: string | null;
      type?: string | null;
      tags?: string | null;
      name?: string | null;
      status?: string | null;
      startDate?: Date;
      endDate?: Date;
    };
    customerId: string;
    customerPhone?: string | null;
    storeId: string | null;
    staffUserId: string | null;
    redeemAmountCents: number;
    usageId: string;
  }
): Promise<IssueNdpCouponOnlyResult | null> {
  let campaignId = params.voucherCampaign.id;
  const direct = parseNdpMetaFromCampaign(params.voucherCampaign);

  if (!direct.enabled) {
    const fallback = await tx.campaign.findFirst({
      where: {
        businessId: params.voucherCampaign.businessId,
        status: { in: ["active", "draft"] },
        OR: [
          { type: "holiday" },
          { tags: { contains: "ndp" } },
          { name: { contains: "国庆" } },
          { rulesSnapshot: { contains: '"ndp"' } },
        ],
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!fallback) return null;
    campaignId = fallback.id;
  }

  try {
    return await issueNdpGiftCouponOnly(tx, {
      campaignId,
      businessId: params.voucherCampaign.businessId,
      storeId: params.storeId,
      staffUserId: params.staffUserId,
      customerId: params.customerId,
      phone: params.customerPhone,
      receiptAmountCents: params.redeemAmountCents,
      fingerprint: `redeem|${params.usageId}`,
      channel: "redeem",
    });
  } catch (e) {
    console.error("maybeIssueNdpOnVoucherRedeem", e);
    return null;
  }
}

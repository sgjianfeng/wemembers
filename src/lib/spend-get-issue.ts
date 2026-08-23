/**
 * 满赠活动（Spend & Get + 低权重大奖签）
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
  computeSpendGetGiftExpiry,
  buildTermsDatesView,
  type TermsDatesView,
} from "@/lib/validity";
import {
  assertCanIssueGift,
  parseSpendGetRules,
  SpendGetError,
  spendGetErrorMessage,
  type SpendGetRules,
} from "@/lib/spend-and-get";

export const SPEND_GET_MIN_SPEND_CENTS = 12_000; // S$120
export const SPEND_GET_GIFT_CENTS = 6_100; // S$61
export const SPEND_GET_VALID_DAYS = 30;
/** 权重参照档：S$100 购券 */
export const SPEND_GET_WEIGHT_REF_CENTS = 10_000;
export const SPEND_GET_GIFT_WEIGHT_FACTOR = EXCLUSIVE_GIFT_WEIGHT_FACTOR; // 0.2
/**
 * 赠券模版的标题/说明按**活动实际配置**生成。
 * 以前写死成「国庆赠送券 S$61 / 30 天」—— 商家把满赠改成满 200 送 80 之后，
 * 顾客券包里显示的仍是 S$61 和 30 天。
 */
export function spendGetCouponTitle(
  giftCents: number,
  lang: "zh" | "en" = "zh"
): string {
  const amount = `S$${(giftCents / 100).toFixed(giftCents % 100 === 0 ? 0 : 2)}`;
  return lang === "en" ? `Spend & get gift ${amount}` : `赠送券 ${amount}`;
}

export function spendGetCouponDescription(
  validDays: number,
  lang: "zh" | "en" = "zh"
): string {
  return lang === "en"
    ? `Spend & get · valid ${validDays} days from claim · use on your next visit · non-refundable`
    : `满赠 · 自领取绑定起 ${validDays} 天有效 · 下次消费使用 · 不可兑现`;
}
/** 满赠默认不双重保护：活动截止不缩短已领 30 天 */
export const SPEND_GET_DUAL_PROTECTION_DEFAULT = false;

/**
 * 满赠活动的默认窗口：从今天起 N 天。
 *
 * 这里以前写死成新加坡国庆的 8/1–8/31 —— 满赠是长期活动模版，
 * 不该默认落在某个节日的档期里。要做节日档期，商家自己改起止日期。
 */
export const SPEND_GET_DEFAULT_DAYS = 365;

export function defaultSpendGetActivityStart(from: Date = new Date()): Date {
  return new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 0, 0, 0, 0)
  );
}

export function defaultSpendGetActivityEnd(from: Date = new Date()): Date {
  const start = defaultSpendGetActivityStart(from);
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + SPEND_GET_DEFAULT_DAYS);
  end.setUTCHours(15, 59, 59, 999); // 当地 23:59:59 SGT
  return end;
}

type Tx = Prisma.TransactionClient;

export type { SpendGetRules };

export const DEFAULT_SPEND_GET_RULES: SpendGetRules = {
  minSpendCents: SPEND_GET_MIN_SPEND_CENTS,
  giftCouponCents: SPEND_GET_GIFT_CENTS,
  validDays: SPEND_GET_VALID_DAYS,
  weightRefFaceCents: SPEND_GET_WEIGHT_REF_CENTS,
  giftWeightFactor: SPEND_GET_GIFT_WEIGHT_FACTOR,
  dualProtection: SPEND_GET_DUAL_PROTECTION_DEFAULT,
};

/** S$100 全余额持有时的购券权重（无核销） */
export function paidHundredDrawWeight(
  refFaceCents: number = SPEND_GET_WEIGHT_REF_CENTS
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
  rules: Pick<SpendGetRules, "weightRefFaceCents" | "giftWeightFactor"> = DEFAULT_SPEND_GET_RULES
): number {
  const paid = paidHundredDrawWeight(rules.weightRefFaceCents);
  const factor =
    rules.giftWeightFactor > 0 ? rules.giftWeightFactor : SPEND_GET_GIFT_WEIGHT_FACTOR;
  return Math.max(1, Math.round(paid * factor));
}

/** 购券相对赠送的倍数（展示用，约 5） */
export function paidVsGiftWeightMultiple(
  rules: Pick<SpendGetRules, "weightRefFaceCents" | "giftWeightFactor"> = DEFAULT_SPEND_GET_RULES
): number {
  const gift = giftGrandDrawWeight(rules);
  const paid = paidHundredDrawWeight(rules.weightRefFaceCents);
  if (gift <= 0) return 0;
  return paid / gift;
}

/** @deprecated 使用 computeSpendGetGiftExpiry；保留简单加法兼容旧测试 */
export function expiresAtFromIssued(
  issuedAt: Date,
  validDays: number = SPEND_GET_VALID_DAYS
): Date {
  return computeSpendGetGiftExpiry({
    obtainedAt: issuedAt,
    validDays,
    activityEnd: new Date(issuedAt.getTime() + 365 * 864e5),
    dualProtection: false,
  }).expiresAt;
}

/** 满赠发放时计算有效至（相对优先，默认无双重保护） */
export function computeSpendGetExpiresAt(input: {
  obtainedAt: Date;
  validDays: number;
  activityEnd: Date;
  dualProtection?: boolean;
}) {
  return computeSpendGetGiftExpiry({
    obtainedAt: input.obtainedAt,
    validDays: input.validDays,
    activityEnd: input.activityEnd,
    dualProtection: input.dualProtection ?? SPEND_GET_DUAL_PROTECTION_DEFAULT,
  });
}

/** 满赠落地页 / 活动券 四行日期与条款 */
export function buildSpendGetTermsDatesView(campaign: {
  startDate: Date;
  endDate: Date;
  description?: string | null;
}, rules: SpendGetRules): TermsDatesView {
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
export function spendGetPosterTermsLine(
  lang: "zh" | "en" = "zh",
  rules: Pick<SpendGetRules, "validDays"> = DEFAULT_SPEND_GET_RULES
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

export type SpendGetCampaignMeta = SpendGetRules & {
  enabled: boolean;
  /** 购券页 slug（活动页「购券冲大奖」） */
  buyVoucherSlug: string | null;
};

export function parseSpendGetMetaFromCampaign(campaign: {
  rulesSnapshot?: string | null;
  type?: string | null;
  tags?: string | null;
  name?: string | null;
}): SpendGetCampaignMeta {
  const rules = parseSpendGetRules(campaign.rulesSnapshot);
  let enabled = false;
  let buyVoucherSlug: string | null = null;

  if (campaign.type === "holiday") enabled = true;
  if (campaign.name && /满赠/i.test(campaign.name)) {
    enabled = true;
  }
  if (campaign.tags) {
    try {
      const tags = JSON.parse(campaign.tags) as unknown;
      if (Array.isArray(tags) && tags.some((t) => /category:spend_get|slot:spend_get|ndp|国庆/i.test(String(t)))) {
        enabled = true;
      }
    } catch {
      if (/category:spend_get|slot:spend_get|ndp|国庆/i.test(campaign.tags)) enabled = true;
    }
  }

  if (campaign.rulesSnapshot) {
    try {
      const raw = JSON.parse(campaign.rulesSnapshot) as Record<string, unknown>;
      // 新数据写 spendGet，存量写 ndp —— 两个都认
      const block =
        (raw.spendGet && typeof raw.spendGet === "object"
          ? (raw.spendGet as Record<string, unknown>)
          : null) ??
        (raw.ndp && typeof raw.ndp === "object"
          ? (raw.ndp as Record<string, unknown>)
          : null);
      if (block) {
        if (block.enabled === false) enabled = false;
        else enabled = true; // 有规则块即开启
        if (typeof block.buyVoucherSlug === "string" && block.buyVoucherSlug.trim()) {
          buyVoucherSlug = block.buyVoucherSlug.trim();
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { ...rules, enabled, buyVoucherSlug };
}



/**
 * 满赠 rulesSnapshot JSON。不传参数时落满赠预设。
 *
 * 写 `spendGet` 键。存量活动写在 `ndp` 下，读取侧两个都认
 * （`parseSpendGetRules`），迁移脚本 `migrate-ndp-to-spend-get.ts` 负责把库里的改过来。
 */
export function buildSpendGetRulesSnapshot(extra?: {
  buyVoucherSlug?: string | null;
  enabled?: boolean;
  dualProtection?: boolean;
  minSpendCents?: number;
  giftCouponCents?: number;
  validDays?: number;
}): string {
  return JSON.stringify({
    spendGet: {
      enabled: extra?.enabled !== false,
      minSpendCents: extra?.minSpendCents ?? SPEND_GET_MIN_SPEND_CENTS,
      giftCouponCents: extra?.giftCouponCents ?? SPEND_GET_GIFT_CENTS,
      validDays: extra?.validDays ?? SPEND_GET_VALID_DAYS,
      weightRefFaceCents: SPEND_GET_WEIGHT_REF_CENTS,
      giftWeightFactor: SPEND_GET_GIFT_WEIGHT_FACTOR,
      dualProtection:
        extra?.dualProtection ?? SPEND_GET_DUAL_PROTECTION_DEFAULT,
      buyVoucherSlug: extra?.buyVoucherSlug || null,
    },
  });
}

/** 确保活动下有一张 S$61 固定面额满赠券模版 */
export async function ensureSpendGetGiftCoupon(
  tx: Tx,
  params: {
    businessId: string;
    campaignId: string;
    giftCouponCents: number;
    validDays: number;
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
    // origin 是后加的字段，老模版要补标记，否则核销时冲减不到负债；
    // 顺带把标题/说明刷成当前配置（商家改了满多少送多少要跟着变）
    const title = spendGetCouponTitle(params.giftCouponCents);
    const description = spendGetCouponDescription(params.validDays);
    if (
      existing.status !== "published" ||
      existing.origin !== "spend_get" ||
      existing.title !== title ||
      existing.description !== description
    ) {
      return tx.coupon.update({
        where: { id: existing.id },
        data: {
          status: "published",
          validUntil: params.templateValidUntil,
          perCustomerLimit: 999,
          origin: "spend_get",
          title,
          description,
        },
      });
    }
    return existing;
  }

  const coupon = await tx.coupon.create({
    data: {
      businessId: params.businessId,
      campaignId: params.campaignId,
      title: spendGetCouponTitle(params.giftCouponCents),
      description: spendGetCouponDescription(params.validDays),
      type: "fixed_amount",
      valueCents: params.giftCouponCents,
      minSpendCents: 0,
      pointsRequired: 0,
      // 满赠券：核销时要冲减商家负债，靠这个标记识别
      origin: "spend_get",
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

export type IssueSpendGetGrantInput = {
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

export type IssueSpendGetGrantResult = {
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
  rules: SpendGetRules;
};

/**
 * 手机绑定后发放：S$61 CustomerCoupon + 零余额 gift 大奖 Voucher（无即时小奖）
 */
export async function issueSpendGetGrant(
  tx: Tx,
  input: IssueSpendGetGrantInput
): Promise<IssueSpendGetGrantResult> {
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
      maxOutstandingCents: true,
    },
  });
  if (!campaign) {
    throw new Error("CAMPAIGN_NOT_FOUND");
  }
  if (campaign.status === "ended" || campaign.status === "deleted") {
    throw new Error("CAMPAIGN_ENDED");
  }

  const rules = parseSpendGetRules(campaign.rulesSnapshot);
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

  // 满赠发的是下次消费的额度 —— 和 cashback 同一种负债，走同一道闸门。
  // 不加这道，商家只要另开一个满赠活动就能绕开 cashback 上的负债上限。
  await assertCanIssueGift(tx, {
    businessId: input.businessId,
    giftCents: rules.giftCouponCents,
    maxOutstandingCents: campaign.maxOutstandingCents,
  });

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
  const validity = computeSpendGetExpiresAt({
    obtainedAt: issuedAt,
    validDays: rules.validDays,
    activityEnd: campaign.endDate,
    dualProtection: rules.dualProtection,
  });
  const expiresAt = validity.expiresAt;
  // 模版 validUntil 至少覆盖本次发放 + 缓冲
  const templateUntil = new Date(expiresAt.getTime());
  templateUntil.setDate(templateUntil.getDate() + 365);

  const coupon = await ensureSpendGetGiftCoupon(tx, {
    businessId: input.businessId,
    campaignId: input.campaignId,
    giftCouponCents: rules.giftCouponCents,
    validDays: rules.validDays,
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
      // 标记为大奖签：余额页/核销台勿当预付余额展示
      issueReason: "spend_get_draw_entry",
      issueNote: isComp
        ? `满赠Comp赠送大奖签 · ${input.receiptNote || ""}`.slice(0, 500)
        : `满赠大奖签 · 消费${(input.receiptAmountCents / 100).toFixed(2)}`.slice(
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
      // 满赠额度记入商家负债，与 cashback 共用同一对计数器
      cashbackIssuedCents: { increment: rules.giftCouponCents },
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

export function spendGetIssueErrorMessage(code: string, lang: "zh" | "en" = "zh"): string {
  const zh: Record<string, string> = {
    CAMPAIGN_NOT_FOUND: "活动不存在",
    CAMPAIGN_ENDED: "活动已结束",
    CAMPAIGN_OUT_OF_WINDOW: "不在活动时间内",
    BELOW_MIN_SPEND: "消费未达活动门槛，无法发放",
    DUPLICATE_RECEIPT: "此消费单今日已发过券，请勿重复发放",
    INVALID_PHONE: "请输入有效手机号",
    PHONE_NOT_CUSTOMER:
      "该手机号的 E.164 写法已是店员/企业账号；若另有顾客账号请用其常用号码格式，或换号发券",
    NO_CUSTOMER: "券未绑定顾客，无法发放赠送券",
  };
  const en: Record<string, string> = {
    CAMPAIGN_NOT_FOUND: "Campaign not found",
    CAMPAIGN_ENDED: "Campaign ended",
    CAMPAIGN_OUT_OF_WINDOW: "Outside campaign window",
    BELOW_MIN_SPEND: "Spend is below the campaign threshold",
    DUPLICATE_RECEIPT: "This receipt was already used today",
    INVALID_PHONE: "Invalid mobile number",
    PHONE_NOT_CUSTOMER: "Phone belongs to a non-customer account",
    NO_CUSTOMER: "Voucher has no customer — cannot issue spend & get gift",
  };
  return (lang === "en" ? en : zh)[code] || code;
}

export type IssueSpendGetGiftOnlyResult = {
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
export async function issueSpendGetGiftOnly(
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
): Promise<IssueSpendGetGiftOnlyResult | null> {
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
      maxOutstandingCents: true,
    },
  });
  if (!campaign) return null;

  const meta = parseSpendGetMetaFromCampaign(campaign);
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

  // 负债闸门。本函数是核销后的尽力而为钩子，失败返回 null 而不是抛错 ——
  // 顾客的核销已经成功，不能因为发不出赠券把整笔核销回滚。
  try {
    await assertCanIssueGift(tx, {
      businessId: input.businessId,
      giftCents: meta.giftCouponCents,
      maxOutstandingCents: campaign.maxOutstandingCents,
    });
  } catch (e) {
    if (e instanceof SpendGetError) {
      console.warn(
        `满赠发放已暂停 business=${input.businessId} 原因=${spendGetErrorMessage(e.code)}`
      );
      return null;
    }
    throw e;
  }

  const customer = await tx.user.findUnique({
    where: { id: input.customerId },
    select: { id: true, phone: true, role: true },
  });
  if (!customer || customer.role !== "customer") return null;

  const phone =
    normalizePhoneLocal(input.phone || customer.phone || "") ||
    `id:${customer.id.slice(-8)}`;

  const issuedAt = now;
  const validity = computeSpendGetExpiresAt({
    obtainedAt: issuedAt,
    validDays: meta.validDays,
    activityEnd: campaign.endDate,
    dualProtection: meta.dualProtection,
  });
  const expiresAt = validity.expiresAt;
  const templateUntil = new Date(expiresAt.getTime());
  templateUntil.setDate(templateUntil.getDate() + 365);

  const coupon = await ensureSpendGetGiftCoupon(tx, {
    businessId: input.businessId,
    campaignId: input.campaignId,
    giftCouponCents: meta.giftCouponCents,
    validDays: meta.validDays,
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
      // 满赠额度记入商家负债，与 cashback 共用同一对计数器
      cashbackIssuedCents: { increment: meta.giftCouponCents },
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
 * - 优先用券所属活动的满赠配置
 * - 否则找企业下进行中的满赠/holiday 活动
 */
export async function maybeIssueSpendGetOnVoucherRedeem(
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
): Promise<IssueSpendGetGiftOnlyResult | null> {
  let campaignId = params.voucherCampaign.id;
  const direct = parseSpendGetMetaFromCampaign(params.voucherCampaign);

  if (!direct.enabled) {
    const fallback = await tx.campaign.findFirst({
      where: {
        businessId: params.voucherCampaign.businessId,
        status: { in: ["active", "draft"] },
        OR: [
          { type: "holiday" },
          { tags: { contains: "spend_get" } },
          { name: { contains: "满赠" } },
          { rulesSnapshot: { contains: '"spend_get"' } },
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
    return await issueSpendGetGiftOnly(tx, {
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
    console.error("maybeIssueSpendGetOnVoucherRedeem", e);
    return null;
  }
}

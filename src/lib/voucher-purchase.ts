/**
 * Shared voucher purchase fulfillment (post-payment or direct test purchase).
 */
import { prisma } from "@/lib/db";
import { resolveTier, calculateTierWeight } from "@/lib/draw-v2";
import {
  computePurchaseSplit,
  isDrawSnapshot,
  legacyDrawSnapshot,
  parseRulesSnapshot,
  type RulesSnapshot,
} from "@/lib/templates";
import { applyRedeemSplit } from "@/lib/apply-redeem-split";
import { resolvePurchaseSellerId } from "@/lib/seller";

export interface FulfillVoucherInput {
  customerId: string;
  campaignId: string;
  /** 券产品 id（新路径） */
  productId?: string | null;
  /** Face amount in SGD (e.g. 50) */
  amountSgd: number;
  spendNowSgd?: number;
  sellerId?: string | null;
  /** Stripe Checkout session id — idempotency key */
  stripeSessionId?: string | null;
}

export interface FulfillVoucherResult {
  voucher: {
    id: string;
    shortCode: string | null;
    amountSgd: string;
    paidSgd: string;
    balanceSgd: string;
    tier: string;
    drawWeight: number;
    sellerCommissionSgd: string;
    stripeSessionId: string | null;
    productKind: "self_use" | "distribution";
  };
  split: {
    faceCents: number;
    paidCents: number;
    discountCents: number;
    sellerCommissionCents: number;
    platformFeeCents: number;
    prizePoolCents: number;
    redeemReserveCents: number;
  };
  instantPrize: { name: string; icon: string; valueSgd: string } | null;
  grandPoolEntry: boolean;
  alreadyFulfilled?: boolean;
}

export class VoucherPurchaseError extends Error {
  constructor(
    message: string,
    public status: number = 400
  ) {
    super(message);
    this.name = "VoucherPurchaseError";
  }
}

/**
 * Create voucher + optional instant draw after payment is confirmed.
 * Idempotent when stripeSessionId is set and already used.
 */
export async function fulfillVoucherPurchase(
  input: FulfillVoucherInput
): Promise<FulfillVoucherResult> {
  const faceSgdRaw = Number(input.amountSgd || 0);
  // 券面须为正整数 SGD
  if (!Number.isFinite(faceSgdRaw) || faceSgdRaw <= 0 || Math.abs(faceSgdRaw - Math.round(faceSgdRaw)) > 1e-9) {
    throw new VoucherPurchaseError("券面须为正整数金额");
  }
  const faceSgd = Math.round(faceSgdRaw);
  const faceCents = faceSgd * 100;
  const spendNowCents = Math.round((input.spendNowSgd || 0) * 100);

  if (faceCents <= 0 || spendNowCents < 0) {
    throw new VoucherPurchaseError("金额无效");
  }

  if (input.stripeSessionId) {
    const existing = await prisma.voucher.findUnique({
      where: { stripeSessionId: input.stripeSessionId },
      include: { draws: { where: { drawType: "instant" }, take: 1 } },
    });
    if (existing) {
      return formatExisting(existing);
    }
  }

  const campaign = await prisma.campaign.findFirst({
    where: {
      id: input.campaignId,
      status: "active",
      type: { in: ["lucky_draw_v2", "voucher_sale"] },
    },
  });
  if (!campaign || new Date() < campaign.startDate || new Date() > campaign.endDate) {
    throw new VoucherPurchaseError("活动不可用", 404);
  }

  const snapshot =
    parseRulesSnapshot(campaign.rulesSnapshot) ||
    legacyDrawSnapshot(campaign.budgetPercent || 20);

  if (snapshot.enabledTiers?.length) {
    if (!snapshot.enabledTiers.includes(faceSgd)) {
      throw new VoucherPurchaseError("该面额未开放");
    }
  }

  const isDraw = isDrawSnapshot(snapshot) || campaign.type === "lucky_draw_v2";
  // 代金最低 S$2；抽奖仍走档位 ladder
  if (!isDraw && faceSgd < 2) {
    throw new VoucherPurchaseError("代金券面额至少 S$2");
  }

  const tier = resolveTier(faceSgd);
  if (!tier) throw new VoucherPurchaseError("无效券面金额");

  const productKind: "self_use" | "distribution" =
    (campaign as { productKind?: string }).productKind === "self_use"
      ? "self_use"
      : "distribution";
  const isExclusive = productKind === "self_use" && isDraw;
  const isCowin = productKind === "distribution" && isDraw;

  const resolvedSellerId = await resolvePurchaseSellerId({
    shareSellingEnabled: snapshot.shareSellingEnabled,
    customerId: input.customerId,
    sellerId: input.sellerId,
  });

  // 共赢：卖家必有（人或店归因）
  if (isCowin && !resolvedSellerId) {
    throw new VoucherPurchaseError(
      "共赢券须通过带卖家的链接/店码购买（人或店）",
      400
    );
  }

  const split = computePurchaseSplit(faceCents, snapshot, Boolean(resolvedSellerId));

  // Draw + 代金: 余额均按券面 F 入账；实付 P 记 paidCents（代金可 P<F）
  const creditCents = faceCents;
  // 抽奖：旧规则最多先花 80%；代金：可先花全部（无「最少留 20%」）
  if (isDraw && spendNowCents > creditCents * 0.8) {
    throw new VoucherPurchaseError("余额不能低于可用额度的 20%");
  }
  if (!isDraw && spendNowCents > creditCents) {
    throw new VoucherPurchaseError("本次消费不能超过可花余额");
  }
  let balanceCents = creditCents - spendNowCents;

  const weight = isDraw
    ? calculateTierWeight(faceCents, tier.tier, balanceCents, 0, spendNowCents)
    : 0;
  const redeemFeePercent =
    campaign.budgetPercent && campaign.budgetPercent > 0
      ? campaign.budgetPercent
      : 20;
  const productMode = isDraw ? "draw" : "voucher";

  const { allocateShortCode } = await import("@/lib/voucher-short-code");
  const shortCode = await allocateShortCode();

  let productId = input.productId || null;
  if (!productId) {
    const linked = await prisma.voucherProduct.findFirst({
      where: { mirrorCampaignId: campaign.id },
      select: { id: true },
    });
    productId = linked?.id || null;
  }

  let voucher;
  try {
    voucher = await prisma.voucher.create({
      data: {
        customerId: input.customerId,
        campaignId: campaign.id,
        productId,
        sellerId: resolvedSellerId,
        stripeSessionId: input.stripeSessionId || null,
        amountCents: creditCents, // face F
        paidCents: split.paidCents, // cash P
        sellerCommissionCents: 0,
        platformFeeCents: 0,
        usedCents: spendNowCents,
        balanceCents,
        prizePoolContribution: 0,
        drawWeight: weight,
        tier: tier.tier,
        shortCode,
        productKind,
        paymentMethod: "stripe",
      },
    });
  } catch (e: unknown) {
    // Race: another webhook fulfilled the same session
    if (input.stripeSessionId) {
      const again = await prisma.voucher.findUnique({
        where: { stripeSessionId: input.stripeSessionId },
        include: { draws: { where: { drawType: "instant" }, take: 1 } },
      });
      if (again) return formatExisting(again);
    }
    throw e;
  }

  // 独享：付款即从支付切 15%/10% 进小奖池+大奖池+服务费记账（不扣企业代币）
  if (isExclusive) {
    const { applyExclusiveOnlineSaleFees } = await import(
      "@/lib/exclusive-fees"
    );
    const { exclusiveConfigFromCampaign } = await import("@/lib/templates");
    const feeConfig = exclusiveConfigFromCampaign(campaign);
    await prisma.$transaction(async (tx) => {
      await applyExclusiveOnlineSaleFees(tx, {
        campaignId: campaign.id,
        faceCents: creditCents,
        feeConfig,
      });
    });
  }

  // Immediate spend at purchase
  if (spendNowCents > 0) {
    const store = await prisma.store.findFirst({
      where: { businessId: campaign.businessId },
      orderBy: { createdAt: "asc" },
    });
    if (store) {
      if (productKind === "self_use") {
        // 自用/独享：核销不进平台钱包
        await prisma.voucherUsage.create({
          data: {
            voucherId: voucher.id,
            storeId: store.id,
            amountCents: spendNowCents,
            feeCents: 0,
            storeIncome: 0,
          },
        });
      } else {
        await applyRedeemSplit({
          voucherId: voucher.id,
          campaignId: campaign.id,
          amountCents: spendNowCents,
          storeId: store.id,
          redeemerBusinessId: campaign.businessId,
          issuerBusinessId: campaign.businessId,
          budgetPercent: redeemFeePercent,
          sellerCommissionPercent: snapshot.sellerCommissionPercent,
          platformFeePercent: snapshot.platformFeePercent,
          sellerId: resolvedSellerId,
          label: isDraw ? "购券即用" : "购券即用·代金券",
          mode: productMode,
          faceCents: creditCents,
          paidCents: split.paidCents,
          recomputeWeight: isDraw
            ? {
                amountCents: creditCents,
                tier: tier.tier,
                balanceCents,
                usedCents: spendNowCents,
              }
            : undefined,
        });
      }
    }
  }

  let instantPrize: FulfillVoucherResult["instantPrize"] = null;

  if (isDraw) {
    // 重读池（独享已注入 3%）→ 抽小奖并加进可花余额（直观模式）
    const campPool = await prisma.campaign.findUnique({
      where: { id: campaign.id },
      select: { instantPoolCents: true },
    });
    const { awardInstantPrizeToVoucher } = await import("@/lib/instant-prize");
    const awarded = await awardInstantPrizeToVoucher(prisma, {
      voucherId: voucher.id,
      campaignId: campaign.id,
      tier,
      weightAtTime: weight,
      instantPoolCents:
        campPool?.instantPoolCents || campaign.instantPoolCents || 0,
      recomputeWeight: true,
    });
    instantPrize = {
      name: awarded.prize.name,
      icon: awarded.prize.icon,
      valueSgd: (awarded.prize.valueCents / 100).toFixed(2),
    };
    // 返回余额含小奖
    balanceCents = awarded.balanceAfterCents;

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        entryCount: { increment: 1 },
        totalTicketCount: { increment: 1 },
      },
    });
  } else {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { totalClaims: { increment: 1 } },
    });
  }

  // Re-read accrued commission if spendNow paid any
  const after = await prisma.voucher.findUnique({
    where: { id: voucher.id },
    select: { sellerCommissionCents: true, platformFeeCents: true, prizePoolContribution: true },
  });

  return {
    voucher: {
      id: voucher.id,
      shortCode: voucher.shortCode,
      amountSgd: (creditCents / 100).toFixed(2),
      paidSgd: (split.paidCents / 100).toFixed(2),
      balanceSgd: (balanceCents / 100).toFixed(2),
      tier: voucher.tier,
      drawWeight: weight,
      // Accrued so far (0 if no spend yet)
      sellerCommissionSgd: ((after?.sellerCommissionCents ?? 0) / 100).toFixed(2),
      stripeSessionId: voucher.stripeSessionId,
      productKind,
    },
    split: {
      faceCents: split.faceCents,
      paidCents: split.paidCents,
      discountCents: split.discountCents,
      sellerCommissionCents: after?.sellerCommissionCents ?? 0,
      platformFeeCents: after?.platformFeeCents ?? 0,
      prizePoolCents: after?.prizePoolContribution ?? 0,
      redeemReserveCents: split.paidCents,
    },
    instantPrize,
    // 独享/共赢均可进大奖进度；独享已在付款注入 10%
    grandPoolEntry: isDraw,
  };
}

function formatExisting(existing: {
  id: string;
  shortCode?: string | null;
  amountCents: number;
  paidCents: number;
  balanceCents: number;
  tier: string;
  drawWeight: number;
  sellerCommissionCents: number;
  stripeSessionId: string | null;
  prizePoolContribution: number;
  platformFeeCents: number;
  productKind?: string | null;
  draws?: { prizeName: string | null; prizeIcon: string | null; valueCents: number | null }[];
}): FulfillVoucherResult {
  const draw = existing.draws?.[0];
  const productKind =
    existing.productKind === "self_use" ? "self_use" : "distribution";
  return {
    alreadyFulfilled: true,
    voucher: {
      id: existing.id,
      shortCode: existing.shortCode ?? null,
      amountSgd: (existing.amountCents / 100).toFixed(2),
      paidSgd: (existing.paidCents / 100).toFixed(2),
      balanceSgd: (existing.balanceCents / 100).toFixed(2),
      tier: existing.tier,
      drawWeight: existing.drawWeight,
      sellerCommissionSgd: (existing.sellerCommissionCents / 100).toFixed(2),
      stripeSessionId: existing.stripeSessionId,
      productKind,
    },
    split: {
      faceCents: existing.amountCents,
      paidCents: existing.paidCents,
      discountCents: Math.max(0, existing.amountCents - existing.paidCents),
      sellerCommissionCents: existing.sellerCommissionCents,
      platformFeeCents: existing.platformFeeCents,
      prizePoolCents: existing.prizePoolContribution,
      redeemReserveCents:
        existing.paidCents -
        existing.sellerCommissionCents -
        existing.platformFeeCents -
        existing.prizePoolContribution,
    },
    instantPrize: draw
      ? {
          name: draw.prizeName || "",
          icon: draw.prizeIcon || "🎁",
          valueSgd: ((draw.valueCents || 0) / 100).toFixed(2),
        }
      : null,
    grandPoolEntry: existing.drawWeight > 0 || ["small", "medium", "large"].includes(existing.tier),
  };
}

/** Quote paid amount for checkout line item */
export async function quoteVoucherPaidCents(
  campaignId: string,
  amountSgd: number,
  hasSeller: boolean
): Promise<{ paidCents: number; faceCents: number; snapshot: RulesSnapshot; campaignName: string }> {
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      status: "active",
      type: { in: ["lucky_draw_v2", "voucher_sale"] },
    },
  });
  if (!campaign || new Date() < campaign.startDate || new Date() > campaign.endDate) {
    throw new VoucherPurchaseError("活动不可用", 404);
  }
  const snapshot =
    parseRulesSnapshot(campaign.rulesSnapshot) ||
    legacyDrawSnapshot(campaign.budgetPercent || 20);
  if (!Number.isFinite(amountSgd) || amountSgd <= 0 || Math.abs(amountSgd - Math.round(amountSgd)) > 1e-9) {
    throw new VoucherPurchaseError("券面须为正整数金额");
  }
  const faceSgd = Math.round(amountSgd);
  const faceCents = faceSgd * 100;
  if (snapshot.enabledTiers?.length) {
    if (!snapshot.enabledTiers.includes(faceSgd)) {
      throw new VoucherPurchaseError("该面额未开放");
    }
  }
  if (!isDrawSnapshot(snapshot) && faceSgd < 2) {
    throw new VoucherPurchaseError("代金券面额至少 S$2");
  }
  const split = computePurchaseSplit(faceCents, snapshot, hasSeller);
  return {
    paidCents: split.paidCents,
    faceCents,
    snapshot,
    campaignName: campaign.name,
  };
}

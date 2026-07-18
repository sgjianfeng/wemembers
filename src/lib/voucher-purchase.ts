/**
 * Shared voucher purchase fulfillment (post-payment or direct test purchase).
 */
import { prisma } from "@/lib/db";
import { drawInstantV2, resolveTier, calculateTierWeight } from "@/lib/draw-v2";
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
    amountSgd: string;
    paidSgd: string;
    balanceSgd: string;
    tier: string;
    drawWeight: number;
    sellerCommissionSgd: string;
    stripeSessionId: string | null;
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
  const faceCents = Math.round((input.amountSgd || 0) * 100);
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
    const amountSgdInt = Math.round(faceCents / 100);
    if (!snapshot.enabledTiers.includes(amountSgdInt)) {
      throw new VoucherPurchaseError("该面额未开放");
    }
  }

  const tier = resolveTier(input.amountSgd);
  if (!tier) throw new VoucherPurchaseError("无效券面金额");

  const resolvedSellerId = await resolvePurchaseSellerId({
    shareSellingEnabled: snapshot.shareSellingEnabled,
    customerId: input.customerId,
    sellerId: input.sellerId,
  });
  const split = computePurchaseSplit(faceCents, snapshot, Boolean(resolvedSellerId));

  const isDraw = isDrawSnapshot(snapshot) || campaign.type === "lucky_draw_v2";
  // Draw: balance = face. Promo voucher: balance = paid (avoid over-issuance on discount).
  const creditCents = isDraw ? faceCents : split.paidCents;
  if (spendNowCents > creditCents * 0.8) {
    throw new VoucherPurchaseError("余额不能低于可用额度的 20%");
  }
  const balanceCents = creditCents - spendNowCents;

  const weight = isDraw
    ? calculateTierWeight(faceCents, tier.tier, balanceCents, 0, spendNowCents)
    : 0;
  // Redeem pot % (draw → leftover funds pool; voucher → leftover to store)
  const redeemFeePercent =
    campaign.budgetPercent && campaign.budgetPercent > 0
      ? campaign.budgetPercent
      : 20;
  const productMode = isDraw ? "draw" : "voucher";

  let voucher;
  try {
    voucher = await prisma.voucher.create({
      data: {
        customerId: input.customerId,
        campaignId: campaign.id,
        sellerId: resolvedSellerId,
        stripeSessionId: input.stripeSessionId || null,
        amountCents: creditCents, // face for draw; paid for discount voucher
        paidCents: split.paidCents,
        // Accrued on redeem only (model A) — start at 0
        sellerCommissionCents: 0,
        platformFeeCents: 0,
        usedCents: spendNowCents,
        balanceCents,
        prizePoolContribution: 0,
        drawWeight: weight,
        tier: tier.tier,
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

  // Immediate spend at purchase = same redeem economics (seller/platform/pool from 20% pot)
  if (spendNowCents > 0) {
    const store = await prisma.store.findFirst({
      where: { businessId: campaign.businessId },
      orderBy: { createdAt: "asc" },
    });
    if (store) {
      await applyRedeemSplit({
        voucherId: voucher.id,
        campaignId: campaign.id,
        amountCents: spendNowCents,
        storeId: store.id,
        redeemerBusinessId: campaign.businessId,
        budgetPercent: redeemFeePercent,
        sellerCommissionPercent: snapshot.sellerCommissionPercent,
        platformFeePercent: snapshot.platformFeePercent,
        sellerId: resolvedSellerId,
        label: isDraw ? "购券即用" : "购券即用·代金券",
        mode: productMode,
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

  // Seller commission is NOT paid at pure purchase — only when balance is spent (above / redeem API)

  let instantPrize: FulfillVoucherResult["instantPrize"] = null;

  if (isDraw) {
    const instantResult = drawInstantV2(tier, campaign.instantPoolCents || 0);
    await prisma.voucherDraw.create({
      data: {
        voucherId: voucher.id,
        drawType: "instant",
        won: true,
        prizeName: instantResult.prize.name,
        prizeIcon: instantResult.prize.icon,
        valueCents: instantResult.prize.valueCents,
        weightAtTime: weight,
      },
    });
    instantPrize = {
      name: instantResult.prize.name,
      icon: instantResult.prize.icon,
      valueSgd: (instantResult.prize.valueCents / 100).toFixed(2),
    };

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
      amountSgd: (creditCents / 100).toFixed(2),
      paidSgd: (split.paidCents / 100).toFixed(2),
      balanceSgd: (balanceCents / 100).toFixed(2),
      tier: voucher.tier,
      drawWeight: weight,
      // Accrued so far (0 if no spend yet)
      sellerCommissionSgd: ((after?.sellerCommissionCents ?? 0) / 100).toFixed(2),
      stripeSessionId: voucher.stripeSessionId,
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
    // All draw face tiers (50/100/200) enter the grand pool
    grandPoolEntry: isDraw,
  };
}

function formatExisting(existing: {
  id: string;
  amountCents: number;
  paidCents: number;
  balanceCents: number;
  tier: string;
  drawWeight: number;
  sellerCommissionCents: number;
  stripeSessionId: string | null;
  prizePoolContribution: number;
  platformFeeCents: number;
  draws?: { prizeName: string | null; prizeIcon: string | null; valueCents: number | null }[];
}): FulfillVoucherResult {
  const draw = existing.draws?.[0];
  return {
    alreadyFulfilled: true,
    voucher: {
      id: existing.id,
      amountSgd: (existing.amountCents / 100).toFixed(2),
      paidSgd: (existing.paidCents / 100).toFixed(2),
      balanceSgd: (existing.balanceCents / 100).toFixed(2),
      tier: existing.tier,
      drawWeight: existing.drawWeight,
      sellerCommissionSgd: (existing.sellerCommissionCents / 100).toFixed(2),
      stripeSessionId: existing.stripeSessionId,
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
  const faceCents = Math.round(amountSgd * 100);
  if (snapshot.enabledTiers?.length) {
    const amountSgdInt = Math.round(faceCents / 100);
    if (!snapshot.enabledTiers.includes(amountSgdInt)) {
      throw new VoucherPurchaseError("该面额未开放");
    }
  }
  const split = computePurchaseSplit(faceCents, snapshot, hasSeller);
  return {
    paidCents: split.paidCents,
    faceCents,
    snapshot,
    campaignName: campaign.name,
  };
}

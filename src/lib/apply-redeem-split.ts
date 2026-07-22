/**
 * Apply redeem split:
 * - draw: Model A pot (store 80% + pot → seller/platform/prize pool)
 * - voucher: cash-equivalent C=R×P/F; platform 1.5% + seller 5% on C
 */
import { prisma } from "@/lib/db";
import { grantBusinessIncomeHold } from "@/lib/tokens";
import {
  splitRedeemAmount,
  resolveSellerRewardRecipient,
  type ProductMode,
  type RedeemSplit,
} from "@/lib/redeem-economics";
import { calculateTierWeight, splitPoolFunding } from "@/lib/draw-v2";

export interface ApplyRedeemSplitArgs {
  voucherId: string;
  campaignId: string;
  /** Face amount being redeemed (user balance units) */
  amountCents: number;
  storeId: string;
  redeemerBusinessId: string;
  /** Issuing campaign business — for seller reward when cross-store */
  issuerBusinessId?: string;
  budgetPercent: number;
  sellerCommissionPercent: number;
  platformFeePercent: number;
  /** Promo attribution on voucher (optional) */
  sellerId: string | null;
  label: string;
  mode?: ProductMode;
  /** Voucher face & paid (for C = R×P/F). Required for accurate voucher split. */
  faceCents?: number;
  paidCents?: number;
  recomputeWeight?: {
    amountCents: number;
    tier: "small" | "medium" | "large";
    balanceCents: number;
    usedCents: number;
    shareBoosts?: number;
  };
}

export async function applyRedeemSplit(args: ApplyRedeemSplitArgs): Promise<{
  split: RedeemSplit;
  usageId: string;
  storeWallet: { balanceAfter: number; frozenAfter: number };
  sellerRewardRecipientId: string | null;
}> {
  const mode: ProductMode = args.mode === "voucher" ? "voucher" : "draw";
  const issuerBusinessId = args.issuerBusinessId || args.redeemerBusinessId;

  const sellerRewardRecipientId =
    mode === "voucher"
      ? resolveSellerRewardRecipient({
          voucherSellerId: args.sellerId,
          redeemerBusinessId: args.redeemerBusinessId,
          issuerBusinessId,
        })
      : args.sellerId || null;

  const split = splitRedeemAmount({
    amountCents: args.amountCents,
    budgetPercent: args.budgetPercent,
    sellerCommissionPercent: args.sellerCommissionPercent,
    platformFeePercent: args.platformFeePercent,
    // draw: only pay seller cut if attributed; voucher: always compute 5%, pay to recipient
    hasSeller:
      mode === "voucher" ? true : Boolean(args.sellerId),
    mode,
    faceCents: args.faceCents,
    paidCents: args.paidCents,
  });

  const usage = await prisma.voucherUsage.create({
    data: {
      voucherId: args.voucherId,
      storeId: args.storeId,
      amountCents: split.amountCents,
      feeCents: split.potCents,
      storeIncome: split.storeIncomeCents,
    },
  });

  const weightUpdate =
    mode === "draw" && args.recomputeWeight != null
      ? {
          drawWeight: calculateTierWeight(
            args.recomputeWeight.amountCents,
            args.recomputeWeight.tier,
            args.recomputeWeight.balanceCents,
            args.recomputeWeight.shareBoosts ?? 0,
            args.recomputeWeight.usedCents
          ),
        }
      : mode === "voucher"
        ? { drawWeight: 0 }
        : {};

  await prisma.voucher.update({
    where: { id: args.voucherId },
    data: {
      prizePoolContribution: { increment: split.prizePoolCents },
      sellerCommissionCents: { increment: split.sellerCommissionCents },
      platformFeeCents: { increment: split.platformFeeCents },
      ...weightUpdate,
    },
  });

  if (mode === "draw" && split.prizePoolCents > 0) {
    const { smallCents, grandCents } = splitPoolFunding(split.prizePoolCents);
    await prisma.campaign.update({
      where: { id: args.campaignId },
      data: {
        ...(smallCents > 0 ? { instantPoolCents: { increment: smallCents } } : {}),
        ...(grandCents > 0 ? { grandPoolCents: { increment: grandCents } } : {}),
      },
    });
  }

  // Store income (cash after fees). If seller reward goes to same business, still
  // grant storeIncome separately; seller grant below may also hit same business.
  const storeWallet = await grantBusinessIncomeHold(
    args.redeemerBusinessId,
    split.storeIncomeCents,
    "voucher_redeem_income",
    mode === "voucher"
      ? `${args.label} · 面额 S$${(split.redeemFaceCents / 100).toFixed(2)} · 现金当量 S$${(split.cashCents / 100).toFixed(2)} · 实收 S$${(split.storeIncomeCents / 100).toFixed(2)}`
      : `${args.label} · 消费 S$${(split.amountCents / 100).toFixed(2)} · 实收 S$${(split.storeIncomeCents / 100).toFixed(2)}`,
    usage.id
  );

  if (sellerRewardRecipientId && split.sellerCommissionCents > 0) {
    const sameAsStore = sellerRewardRecipientId === args.redeemerBusinessId;
    await grantBusinessIncomeHold(
      sellerRewardRecipientId,
      split.sellerCommissionCents,
      "seller_commission",
      sameAsStore
        ? `卖券奖励（本店回己）· S$${(split.sellerCommissionCents / 100).toFixed(2)}`
        : `卖券佣金（随核销）· S$${(split.sellerCommissionCents / 100).toFixed(2)}`,
      usage.id
    );
  }

  if (split.platformFeeCents > 0) {
    const platformEmail = process.env.PLATFORM_ACCOUNT_EMAIL?.trim();
    if (platformEmail) {
      const platform = await prisma.user.findFirst({
        where: { email: platformEmail },
        select: { id: true },
      });
      if (platform) {
        await grantBusinessIncomeHold(
          platform.id,
          split.platformFeeCents,
          "platform_fee",
          `平台费（随核销）· S$${(split.platformFeeCents / 100).toFixed(2)}`,
          usage.id
        );
      }
    }
  }

  return {
    split,
    usageId: usage.id,
    storeWallet: {
      balanceAfter: storeWallet.balanceAfter,
      frozenAfter: storeWallet.frozenAfter,
    },
    sellerRewardRecipientId,
  };
}

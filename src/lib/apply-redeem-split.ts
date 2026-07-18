/**
 * Apply model-A redeem split: store 80% + pot 20% (seller / platform / prize pool).
 * Prize pool portion is cut 20% small / 80% grand.
 */
import { prisma } from "@/lib/db";
import { grantBusinessIncomeHold } from "@/lib/tokens";
import {
  splitRedeemAmount,
  type ProductMode,
  type RedeemSplit,
} from "@/lib/redeem-economics";
import { calculateTierWeight, splitPoolFunding } from "@/lib/draw-v2";

export interface ApplyRedeemSplitArgs {
  voucherId: string;
  campaignId: string;
  amountCents: number;
  storeId: string;
  redeemerBusinessId: string;
  budgetPercent: number;
  sellerCommissionPercent: number;
  platformFeePercent: number;
  sellerId: string | null;
  label: string;
  /** draw funds prize pool; voucher returns leftover pot to store */
  mode?: ProductMode;
  /** After redeem, new balance/used for weight (draw only) */
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
}> {
  const mode: ProductMode = args.mode === "voucher" ? "voucher" : "draw";
  const split = splitRedeemAmount({
    amountCents: args.amountCents,
    budgetPercent: args.budgetPercent,
    sellerCommissionPercent: args.sellerCommissionPercent,
    platformFeePercent: args.platformFeePercent,
    hasSeller: Boolean(args.sellerId),
    mode,
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

  // Prize pool funding only for draw products
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

  const storeWallet = await grantBusinessIncomeHold(
    args.redeemerBusinessId,
    split.storeIncomeCents,
    "voucher_redeem_income",
    `${args.label} · 消费 S$${(split.amountCents / 100).toFixed(2)} · 实收 S$${(split.storeIncomeCents / 100).toFixed(2)}`,
    usage.id
  );

  if (args.sellerId && split.sellerCommissionCents > 0) {
    await grantBusinessIncomeHold(
      args.sellerId,
      split.sellerCommissionCents,
      "seller_commission",
      `卖券佣金（随核销）· S$${(split.sellerCommissionCents / 100).toFixed(2)}`,
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
  };
}

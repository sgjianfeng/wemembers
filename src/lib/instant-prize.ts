/**
 * 即时小奖
 * - 真钱路径（realPrizeFunding）：中奖金额加进可花余额（直观模式）
 * - gift 路径：只记中奖结果，门店兑付，不进余额
 */
import type { Prisma } from "@prisma/client";
import {
  drawInstantV2,
  type InstantPrizeV2,
  type VoucherTierConfig,
  calculateTierWeight,
} from "@/lib/draw-v2";

type Tx = Prisma.TransactionClient | typeof import("@/lib/db").prisma;

export type InstantAwardResult = {
  prize: InstantPrizeV2;
  balanceAfterCents: number;
  amountCents: number;
  creditedCents: number;
  /** store = 门店兑付；balance = 已入可花余额 */
  fulfillment: "balance" | "store";
};

export async function awardInstantPrizeToVoucher(
  db: Tx,
  params: {
    voucherId: string;
    campaignId: string;
    tier: VoucherTierConfig;
    weightAtTime: number;
    instantPoolCents: number;
    recomputeWeight?: boolean;
    /**
     * true（默认）：直观模式，奖额加余额并从即时池扣
     * false：仅展示/记录，门店兑，不改余额、不扣池
     */
    creditToBalance?: boolean;
    /** 创建后把 drawWeight 乘以此系数（gift 路径 0.2） */
    weightFactor?: number;
  }
): Promise<InstantAwardResult> {
  const creditToBalance = params.creditToBalance !== false;
  const weightFactor =
    params.weightFactor != null && params.weightFactor > 0
      ? params.weightFactor
      : 1;

  const { prize } = drawInstantV2(params.tier, params.instantPoolCents);
  const credit = Math.max(0, Math.round(prize.valueCents));

  await db.voucherDraw.create({
    data: {
      voucherId: params.voucherId,
      drawType: "instant",
      won: true,
      prizeName: prize.name,
      prizeIcon: prize.icon,
      valueCents: prize.valueCents,
      weightAtTime: params.weightAtTime,
    },
  });

  const before = await db.voucher.findUnique({
    where: { id: params.voucherId },
    select: {
      balanceCents: true,
      amountCents: true,
      usedCents: true,
      tier: true,
      drawWeight: true,
    },
  });
  if (!before) {
    throw new Error("VOUCHER_NOT_FOUND");
  }

  const creditedCents = creditToBalance ? credit : 0;
  const balanceAfter = before.balanceCents + creditedCents;

  let drawWeight = before.drawWeight;
  if (weightFactor !== 1 && drawWeight > 0) {
    drawWeight = Math.max(1, Math.round(drawWeight * weightFactor));
  }
  if (params.recomputeWeight && creditedCents > 0 && before.drawWeight > 0) {
    const t = (before.tier as "small" | "medium" | "large") || "medium";
    drawWeight = calculateTierWeight(
      before.amountCents,
      t,
      balanceAfter,
      0,
      before.usedCents
    );
    if (weightFactor !== 1) {
      drawWeight = Math.max(1, Math.round(drawWeight * weightFactor));
    }
  } else if (weightFactor !== 1 && !params.recomputeWeight) {
    // already scaled above from before.drawWeight
  }

  const needWeightUpdate =
    weightFactor !== 1 || (params.recomputeWeight && creditedCents > 0);

  await db.voucher.update({
    where: { id: params.voucherId },
    data: {
      ...(creditedCents > 0 ? { balanceCents: balanceAfter } : {}),
      ...(needWeightUpdate ? { drawWeight } : {}),
    },
  });

  // 仅真钱入账时从即时池扣减
  if (creditToBalance && credit > 0) {
    const camp = await db.campaign.findUnique({
      where: { id: params.campaignId },
      select: { instantPoolCents: true },
    });
    const dec = Math.min(credit, Math.max(0, camp?.instantPoolCents ?? 0));
    if (dec > 0) {
      await db.campaign.update({
        where: { id: params.campaignId },
        data: { instantPoolCents: { decrement: dec } },
      });
    }
  }

  return {
    prize,
    balanceAfterCents: balanceAfter,
    amountCents: before.amountCents,
    creditedCents,
    fulfillment: creditToBalance ? "balance" : "store",
  };
}

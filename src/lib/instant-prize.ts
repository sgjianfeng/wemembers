/**
 * 即时小奖：抽奖 + 直观模式入账（中奖金额加进该券可花余额）
 */
import type { Prisma } from "@prisma/client";
import {
  drawInstantV2,
  type InstantPrizeV2,
  type VoucherTierConfig,
} from "@/lib/draw-v2";
import { calculateTierWeight } from "@/lib/draw-v2";

type Tx = Prisma.TransactionClient | typeof import("@/lib/db").prisma;

export type InstantAwardResult = {
  prize: InstantPrizeV2;
  balanceAfterCents: number;
  amountCents: number;
  creditedCents: number;
};

/**
 * 抽即时奖 → 写 VoucherDraw → balance += 奖额
 * 并尽量从活动 instantPoolCents 扣减（与 3% 小奖计提对应）
 */
export async function awardInstantPrizeToVoucher(
  db: Tx,
  params: {
    voucherId: string;
    campaignId: string;
    tier: VoucherTierConfig;
    weightAtTime: number;
    instantPoolCents: number;
    /** 是否重算大奖权重（余额变了） */
    recomputeWeight?: boolean;
  }
): Promise<InstantAwardResult> {
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

  const balanceAfter = before.balanceCents + credit;
  let drawWeight = before.drawWeight;
  if (params.recomputeWeight && before.drawWeight > 0) {
    const t = (before.tier as "small" | "medium" | "large") || "medium";
    drawWeight = calculateTierWeight(
      before.amountCents,
      t,
      balanceAfter,
      0,
      before.usedCents
    );
  }

  await db.voucher.update({
    where: { id: params.voucherId },
    data: {
      balanceCents: balanceAfter,
      ...(params.recomputeWeight ? { drawWeight } : {}),
    },
  });

  // 小奖池扣减（有多少扣多少，不强求覆盖全部奖额）
  if (credit > 0) {
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
    creditedCents: credit,
  };
}

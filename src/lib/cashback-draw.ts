/**
 * 活动 2 抽奖：即时奖并入消费额度 + 大奖逐档解锁
 *
 * ## 双池
 * 计提的 drawCents 按 instantPoolRatio 切成即时池与大奖池（默认 35/65）。
 * - 即时池：当场开奖，奖额**并入顾客的消费额度券**（金额小、性质与 cashback 相同，
 *   单列只会让钱包碎片化）
 * - 大奖池：累积，达到档位目标才解锁；中奖发**独立奖励券**（可分期多张）
 *
 * ## 逐档解锁
 * 奖品按 targetCents 升序排阶梯，进度条永远指向**下一个未发放**的档位。
 * 池子一次跨越多档时不同时解锁，仍按顺序逐档发放——否则奖池被瞬间掏空。
 * 抽出后 `grandPoolCents -= valueCents`（不清零），余额继续养池。
 */
import type { Prisma } from "@prisma/client";
import {
  calibrateBarbellPack,
  drawCreditPrize,
  instantEvCents,
  type CreditPrize,
} from "@/lib/templates/cashback-prizes";

type Tx = Prisma.TransactionClient;

export type GrandTier = {
  id: string;
  name: string;
  icon: string;
  /** 解锁门槛：池子累到这个数才能抽 */
  targetCents: number;
  /** 奖品面额：抽出后从池中扣除 */
  valueCents: number;
};

/**
 * 活动 2 默认大奖阶梯（纯额度，面额挂客单价）。
 * 震撼阈值 ≈ 100 × 客单价；目标 > 价值（约 30% 兑付率），抽出后余额继续养池。
 */
export function defaultGrandTiers(avgTicketCents: number): GrandTier[] {
  const t = Math.max(500, Math.round(avgTicketCents));
  const mk = (
    id: string,
    name: string,
    icon: string,
    mult: number
  ): GrandTier => {
    const value = Math.round((t * mult) / 100) * 100;
    return {
      id,
      name,
      icon,
      valueCents: value,
      // 目标 = 价值 / 0.3，保证抽出后池中仍有余额支撑小奖与下一档
      targetCents: Math.round(value / 0.3 / 100) * 100,
    };
  };
  return [
    mk("grand_10x", "10 倍回馈", "🎁", 10),
    mk("grand_30x", "30 倍回馈", "🏆", 30),
    mk("grand_100x", "全年免单", "👑", 100),
  ];
}

export function parseAwardedIds(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export type GrandUnlock = {
  /** 下一个未发放的档位（进度条指向它）；全部发完为 null */
  nextTier: GrandTier | null;
  /** 已达门槛、本次可发放 */
  unlocked: GrandTier | null;
  progressPercent: number;
};

/**
 * 逐档解锁判定。
 * 只看**下一个未发放**的档位——即使池子已跨过更高档，也不越级发放。
 */
export function resolveGrandUnlock(input: {
  grandPoolCents: number;
  tiers: GrandTier[];
  awardedIds: string[];
}): GrandUnlock {
  const pool = Math.max(0, input.grandPoolCents);
  const awarded = new Set(input.awardedIds);
  const pending = [...input.tiers]
    .filter((t) => !awarded.has(t.id))
    .sort((a, b) => a.targetCents - b.targetCents);

  const nextTier = pending[0] ?? null;
  if (!nextTier) {
    return { nextTier: null, unlocked: null, progressPercent: 100 };
  }
  const progressPercent =
    nextTier.targetCents > 0
      ? Math.min(100, Math.round((pool / nextTier.targetCents) * 100))
      : 0;

  return {
    nextTier,
    unlocked: pool >= nextTier.targetCents ? nextTier : null,
    progressPercent,
  };
}

/** 大奖券分期：拆成 N 张等额券，余数落最后一张 */
export function splitInstalments(
  valueCents: number,
  instalments: number
): number[] {
  const total = Math.max(0, Math.round(valueCents));
  const n = Math.max(1, Math.round(instalments));
  if (n === 1 || total === 0) return [total];
  const each = Math.floor(total / n);
  const out = Array(n).fill(each);
  out[n - 1] = total - each * (n - 1);
  return out.filter((x) => x > 0);
}

export type InstantAward = {
  prize: CreditPrize;
  /** 目标 EV 不可达时为 true——商家在超发 */
  overspending: boolean;
  overspendCents: number;
};

/**
 * 开一次即时奖。
 * 奖包按本笔消费的实际 EV 现算，不用固定奖包——固定奖包在"每笔消费抽一次"
 * 的场景下会亏穿（现有购券奖包 EV 是 S$3.66/次，差 20 倍）。
 */
export function drawInstantCredit(input: {
  amountCents: number;
  drawPercent: number;
  instantPoolRatio: number;
  rng?: () => number;
}): InstantAward {
  const ev = instantEvCents({
    avgTicketCents: input.amountCents,
    drawPercent: input.drawPercent,
    instantPoolRatio: input.instantPoolRatio,
  });
  const pack = calibrateBarbellPack(ev);
  return {
    prize: drawCreditPrize(pack.prizes, input.rng),
    overspending: !pack.feasible,
    overspendCents: pack.overspendCents,
  };
}

/**
 * 把即时奖并入顾客的消费额度券，并记一笔 VoucherDraw。
 * 额度券本身 origin=cashback / feeExempt=true，加钱不改变这些属性。
 */
export async function creditInstantPrize(
  tx: Tx,
  args: {
    voucherId: string;
    campaignId: string;
    prize: CreditPrize;
    at?: Date;
  }
): Promise<void> {
  const now = args.at ?? new Date();
  const value = Math.max(0, Math.round(args.prize.valueCents));
  if (value <= 0) return;

  await tx.voucher.update({
    where: { id: args.voucherId },
    data: {
      amountCents: { increment: value },
      balanceCents: { increment: value },
      lastActivityAt: now,
    },
  });
  await tx.voucherDraw.create({
    data: {
      voucherId: args.voucherId,
      drawType: "instant",
      won: true,
      prizeId: args.prize.id,
      prizeName: args.prize.nameZh,
      prizeIcon: args.prize.icon,
      valueCents: value,
    },
  });
  await tx.campaign.update({
    where: { id: args.campaignId },
    data: {
      instantPoolCents: { decrement: value },
      // 即时奖也是发出去的额度，计入负债
      cashbackIssuedCents: { increment: value },
    },
  });
}

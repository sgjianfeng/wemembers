// src/lib/draw-v2.ts
// V2 购券抽奖算法：100% 即时中奖 + 分层权重 + 预测倒计时

export interface VoucherTierConfig {
  min: number;            // 券面最低金额 (SGD)
  max: number;            // 券面最高金额 (SGD)
  tier: "small" | "medium" | "large";
  instantPrizeCap: number; // 即时奖品上限 (SGD)
}

export interface InstantPrizeV2 {
  name: string;
  icon: string;
  valueCents: number;
  weight: number;
}

export interface PoolCountdown {
  prizeKey: string;         // stable id for freeze map
  prizeName: string;
  prizeIcon: string;
  targetCents: number;
  currentCents: number;
  progress: number;         // 0-100
  daysPredicted: number;    // 预计天数
  velocityPerDay: number;   // 日均增速 (cents)
  accelerating: boolean;    // 是否在加速
}

/** Per-prize pool state for countdown. Algorithm is fixed; labels/targets come from config. */
export interface PoolConfigEntry {
  targetCents: number;
  currentCents: number;
  /** Store-customizable display name (falls back to GRAND_PRIZE_TARGETS) */
  displayName?: string;
  icon?: string;
}

/** Small (instant) prize pool share of redeem-funded pool funds */
export const SMALL_POOL_RATIO = 20;
/** Deferred grand prize pool share */
export const GRAND_POOL_RATIO = 80;

/**
 * Dual-pool allocation: small/instant + deferred grand.
 * Default 20% small / 80% deferred. Withdraw-only funds should go only to small (not via this).
 */
export function allocatePrizePools(
  totalPoolCents: number,
  instantPoolRatio: number = SMALL_POOL_RATIO
): {
  instantPoolCents: number;
  deferredPoolCents: number;
  instantRatio: number;
  deferredRatio: number;
} {
  const total = Math.max(0, Math.round(totalPoolCents));
  let instantRatio = Number.isFinite(instantPoolRatio)
    ? Math.round(instantPoolRatio)
    : SMALL_POOL_RATIO;
  instantRatio = Math.min(100, Math.max(0, instantRatio));
  const instantPoolCents = Math.floor((total * instantRatio) / 100);
  return {
    instantPoolCents,
    deferredPoolCents: total - instantPoolCents,
    instantRatio,
    deferredRatio: 100 - instantRatio,
  };
}

/** Split redeem-funded pool cents into small + grand (20/80). */
export function splitPoolFunding(
  prizePoolCents: number,
  smallRatio: number = SMALL_POOL_RATIO
): { smallCents: number; grandCents: number } {
  const total = Math.max(0, Math.round(prizePoolCents));
  const ratio = Math.min(100, Math.max(0, Math.round(smallRatio)));
  const smallCents = Math.floor((total * ratio) / 100);
  return { smallCents, grandCents: total - smallCents };
}

/** Split deferred pool across prizes by each prize's target weight (same formula for all). */
export function allocateDeferredToPrizes(
  deferredPoolCents: number,
  prizes: Array<{ id: string; targetCents: number; name: string; icon?: string }>
): Record<string, PoolConfigEntry> {
  const totalTarget = prizes.reduce((sum, p) => sum + Math.max(0, p.targetCents), 0);
  const poolConfigs: Record<string, PoolConfigEntry> = {};
  for (const p of prizes) {
    const target = Math.max(0, p.targetCents);
    const allocated =
      totalTarget > 0 ? Math.floor(deferredPoolCents * (target / totalTarget)) : 0;
    poolConfigs[p.id] = {
      targetCents: target,
      currentCents: Math.min(allocated, target || allocated),
      displayName: p.name,
      icon: p.icon,
    };
  }
  return poolConfigs;
}

/**
 * Three face values only (SGD): 50 / 100 / 200
 * - small (50): entry · grand 1× · instant cap S$8
 * - medium (100): main · grand 2× · instant cap S$20
 * - large (200): boost · grand 3× · instant cap S$40
 */
export const DEFAULT_VOUCHER_TIERS: VoucherTierConfig[] = [
  { min: 50, max: 50, tier: "small", instantPrizeCap: 8 },
  { min: 100, max: 100, tier: "medium", instantPrizeCap: 20 },
  { min: 200, max: 200, tier: "large", instantPrizeCap: 40 },
];

export const FIXED_VOUCHER_AMOUNTS = [50, 100, 200] as const;

// Grand prize targets (in cents) — ladder: iPad → iPhone → BYD
export const GRAND_PRIZE_TARGETS = {
  iPad: { targetCents: 300000, displayName: "iPad", icon: "📲", valueCents: 80000 },
  iPhone: { targetCents: 500000, displayName: "iPhone", icon: "📱", valueCents: 150000 },
  BYD: { targetCents: 66700000, displayName: "BYD", icon: "🚗", valueCents: 20000000 },
};

const INSTANT_PRIZES: InstantPrizeV2[] = [
  { name: "S$30 代金券", icon: "💰", valueCents: 3000, weight: 3 },
  { name: "S$20 代金券", icon: "💵", valueCents: 2000, weight: 6 },
  { name: "S$10 代金券", icon: "💵", valueCents: 1000, weight: 14 },
  { name: "S$5 代金券",  icon: "🎫", valueCents: 500,  weight: 8 },
  { name: "S$2 代金券",  icon: "🎟", valueCents: 200,  weight: 15 },
  { name: "S$1 代金券",  icon: "☕", valueCents: 100,  weight: 35 },
  { name: "S$0.50 代金券", icon: "🍬", valueCents: 50, weight: 50 },
];

/**
 * 即时抽奖 V2：100% 中奖率，奖品上限由券面档位决定
 */
export function drawInstantV2(
  tier: VoucherTierConfig,
  instantPoolCents: number
): { won: true; prize: InstantPrizeV2 } {
  const maxPrize = tier.instantPrizeCap * 100; // convert SGD to cents
  const available = INSTANT_PRIZES.filter((p) => p.valueCents <= maxPrize);

  // 100% win: noWinWeight = 0
  const totalWeight = available.reduce((s, p) => s + p.weight, 0);
  let rand = Math.random() * totalWeight;

  for (const prize of available) {
    rand -= prize.weight;
    if (rand <= 0) return { won: true, prize };
  }

  // Fallback: return smallest prize
  const smallest = available[available.length - 1];
  return { won: true, prize: smallest };
}

/** Holding balance weight (low — discourages buy-and-idle / withdraw gaming) */
export const W_BALANCE = 0.2;
/** Redeemed amount weight multipliers by face tier: 50→1×, 100→2×, 200→3× */
export const REDEEM_WEIGHT_MULT: Record<"small" | "medium" | "large", number> = {
  small: 1,
  medium: 2,
  large: 3,
};

/**
 * 大奖池权重（模型 A + 可提现）— 三档均进大奖池
 * - 已核销 usedCents: small 1× / medium 2× / large 3×
 * - 未消费余额 balanceCents: 0.2×
 * - 分享: 每次 +1× 券面
 * 提现后 balance=0 → 权重仅剩已核销部分；全额提现无核销则 0
 */
export function calculateTierWeight(
  amountCents: number,
  tier: "small" | "medium" | "large",
  balanceCents: number = 0,
  shareBoosts: number = 0,
  usedCents: number = 0
): number {
  const bal = Math.max(0, balanceCents);
  const used = Math.max(0, usedCents);
  const redeemMult = REDEEM_WEIGHT_MULT[tier] ?? 1;
  const redeemWeight = used * redeemMult;
  const balanceWeight = bal * W_BALANCE;
  const shareWeight = shareBoosts * Math.max(0, amountCents);
  return Math.round(redeemWeight + balanceWeight + shareWeight);
}

/**
 * 判断券面金额属于哪个档位
 */
export function resolveTier(amountSgd: number): VoucherTierConfig | null {
  // amountSgd is in SGD
  for (const t of DEFAULT_VOUCHER_TIERS) {
    if (amountSgd >= t.min && amountSgd <= t.max) return t;
  }
  // Fallback: map nearest known ladder
  if (amountSgd >= 200) return DEFAULT_VOUCHER_TIERS[2];
  if (amountSgd >= 100) return DEFAULT_VOUCHER_TIERS[1];
  if (amountSgd >= 50) return DEFAULT_VOUCHER_TIERS[0];
  return null;
}

/**
 * 预计开奖倒计时（算法固定，与奖品名称无关）
 * 公式：剩余天数 = (目标 - 当前) / 日均增速
 * 只加速不减速：如果本次计算天数 > 上次展示天数，返回上次的结果
 *
 * 店家可改 displayName / icon / targetCents；不可改公式本身。
 */
export function estimatePoolCountdown(
  poolConfigs: Record<string, PoolConfigEntry>,
  dailyAvgVelocity: number,
  previousEstimates?: Record<string, number>
): PoolCountdown[] {
  if (dailyAvgVelocity <= 0) dailyAvgVelocity = 1; // 避免除以零

  const results: PoolCountdown[] = [];

  for (const [key, config] of Object.entries(poolConfigs)) {
    const { targetCents, currentCents } = config;
    if (!targetCents || targetCents <= 0) continue;

    const prizeMeta = GRAND_PRIZE_TARGETS[key as keyof typeof GRAND_PRIZE_TARGETS];
    const displayName = (config.displayName || prizeMeta?.displayName || "").trim();
    if (!displayName) continue;
    const icon = config.icon || prizeMeta?.icon || "🎁";

    const remaining = Math.max(0, targetCents - currentCents);
    const rawDays = remaining / dailyAvgVelocity;
    const rawProgress = Math.min(100, Math.round((currentCents / targetCents) * 100));

    // 只加速不减速
    let daysPredicted = Math.ceil(rawDays);
    let accelerating = false;
    const prev = previousEstimates?.[key];
    if (prev !== undefined) {
      if (daysPredicted < prev) {
        accelerating = true;
      } else {
        daysPredicted = prev; // freeze at optimistic estimate
      }
    }

    results.push({
      prizeKey: key,
      prizeName: displayName,
      prizeIcon: icon,
      targetCents,
      currentCents,
      progress: rawProgress,
      daysPredicted: Math.max(0, daysPredicted),
      velocityPerDay: dailyAvgVelocity,
      accelerating,
    });
  }

  return results;
}

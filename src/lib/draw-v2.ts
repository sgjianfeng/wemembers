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
  prizeName: string;
  targetCents: number;
  currentCents: number;
  progress: number;         // 0-100
  daysPredicted: number;    // 预计天数
  velocityPerDay: number;   // 日均增速 (cents)
  accelerating: boolean;    // 是否在加速
}

export const DEFAULT_VOUCHER_TIERS: VoucherTierConfig[] = [
  { min: 20, max: 20, tier: "small", instantPrizeCap: 2 },
  { min: 50, max: 50, tier: "medium", instantPrizeCap: 8 },
  { min: 100, max: 100, tier: "large", instantPrizeCap: 20 },
  { min: 200, max: 200, tier: "large", instantPrizeCap: 20 },
];

export const FIXED_VOUCHER_AMOUNTS = [20, 50, 100, 200] as const;

// Grand prize targets (in cents)
export const GRAND_PRIZE_TARGETS = {
  iPhone: { targetCents: 500000, displayName: "iPhone", icon: "📱", valueCents: 150000 },
  MacBook: { targetCents: 1000000, displayName: "MacBook", icon: "💻", valueCents: 300000 },
  BYD: { targetCents: 66700000, displayName: "BYD", icon: "🚗", valueCents: 20000000 },
};

const INSTANT_PRIZES: InstantPrizeV2[] = [
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

/**
 * 计算大奖池权重
 * small: 不参与大奖池
 * medium: 1× 券面金额
 * large: 2× 券面金额
 * balanceCents: 储值金额，统一按 2× 加成 (medium & large)
 * 分享加权由 share-boost API 处理
 */
export function calculateTierWeight(
  amountCents: number,
  tier: "small" | "medium" | "large",
  balanceCents: number = 0,
  shareBoosts: number = 0
): number {
  if (tier === "small") return 0;
  const baseWeight = tier === "large" ? amountCents * 2 : amountCents;
  const balanceWeight = balanceCents * 2; // unified 2× for medium & large
  return baseWeight + balanceWeight + shareBoosts * amountCents;
}

/**
 * 判断券面金额属于哪个档位
 */
export function resolveTier(amountSgd: number): VoucherTierConfig | null {
  // amountSgd is in SGD
  for (const t of DEFAULT_VOUCHER_TIERS) {
    if (amountSgd >= t.min && amountSgd <= t.max) return t;
  }
  // Fallback: find highest available tier for amount >= 10000
  if (amountSgd > 9999) return DEFAULT_VOUCHER_TIERS[2];
  return null;
}

/**
 * 预计开奖倒计时
 * 公式：剩余天数 = (目标 - 当前) / 7日均速
 * 只加速不减速：如果本次计算天数 > 上次展示天数，返回上次的结果
 */
export function estimatePoolCountdown(
  poolConfigs: Record<string, { targetCents: number; currentCents: number }>,
  dailyAvgVelocity: number,
  previousEstimates?: Record<string, number>
): PoolCountdown[] {
  if (dailyAvgVelocity <= 0) dailyAvgVelocity = 1; // 避免除以零

  const results: PoolCountdown[] = [];

  for (const [key, config] of Object.entries(poolConfigs)) {
    const { targetCents, currentCents } = config;
    const prizeMeta = GRAND_PRIZE_TARGETS[key as keyof typeof GRAND_PRIZE_TARGETS];
    if (!prizeMeta) continue;

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
      prizeName: prizeMeta.displayName,
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

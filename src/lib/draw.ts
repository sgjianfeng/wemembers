// 即时抽奖算法

interface InstantPrize {
  name: string;
  icon: string;
  valueCents: number;
  weight: number; // 概率权重
}

// 即时奖池天花板：最大可中奖 = 即时池 × 10%
export function getMaxInstantPrize(instantPoolCents: number): number {
  return Math.round(instantPoolCents * 0.1);
}

// 获取当前可用的即时奖品
export function getAvailableInstantPrizes(instantPoolCents: number): InstantPrize[] {
  const maxPrize = getMaxInstantPrize(instantPoolCents);
  const poolSgd = instantPoolCents / 100;

  const allPrizes: InstantPrize[] = [
    { name: "S$200 代金券", icon: "💵", valueCents: 20000, weight: 5 },
    { name: "S$100 代金券", icon: "💵", valueCents: 10000, weight: 10 },
    { name: "S$50 代金券",  icon: "🎫", valueCents: 5000,  weight: 20 },
    { name: "S$20 代金券",  icon: "🎟", valueCents: 2000,  weight: 30 },
    { name: "S$10 代金券",  icon: "🎟", valueCents: 1000,  weight: 50 },
    { name: "S$5 代金券",   icon: "☕", valueCents: 500,   weight: 70 },
  ];

  return allPrizes.filter((p) => p.valueCents <= maxPrize);
}

// 即时抽奖：加权随机
export function drawInstant(
  instantPoolCents: number
): { won: boolean; prize: InstantPrize | null } {
  const prizes = getAvailableInstantPrizes(instantPoolCents);
  if (prizes.length === 0) return { won: false, prize: null };

  // 未中奖权重 = 奖池越大越小
  const poolSgd = instantPoolCents / 100;
  const noWinWeight = Math.max(30, 100 - Math.min(70, poolSgd / 1000));

  const totalWeight = prizes.reduce((s, p) => s + p.weight, 0) + noWinWeight;
  let rand = Math.random() * totalWeight;

  // 先检查未中奖
  rand -= noWinWeight;
  if (rand <= 0) return { won: false, prize: null };

  // 检查各档奖品
  for (const prize of prizes) {
    rand -= prize.weight;
    if (rand <= 0) return { won: true, prize };
  }

  return { won: false, prize: null };
}

// 大奖池总规模预估
export function getGrandPoolEstimate(totalSpendCents: number, budgetPercent: number = 20): {
  grandPoolCents: number;
  instantPoolCents: number;
  progress: number;  // 0-100
  bydUnlocked: boolean;
} {
  const grandPoolCents = Math.round(totalSpendCents * budgetPercent / 100);
  const instantPoolCents = Math.round(grandPoolCents * 0.1);
  const bydTarget = 20000000; // S$200,000 in cents
  const progress = Math.min(100, Math.round((grandPoolCents / bydTarget) * 100));

  return {
    grandPoolCents,
    instantPoolCents,
    progress,
    bydUnlocked: grandPoolCents >= bydTarget,
  };
}

/**
 * 活动 2 奖包 `cashback_credit_v1` —— 纯额度奖
 *
 * 活动 2 的奖池是**记账额度**，不是现金，因此奖品只能是抵扣额度，
 * 不得承诺任何需要真金采购的实物（实物大奖归活动 3）。
 *
 * ## 为什么不能复用 PRIZE_PACK_DEFAULT_GRAND_V1
 *
 * 那个奖包即时奖加权期望是 S$3.66/次，因为它假设「买 S$50–200 券才抽一次」。
 * 活动 2 是**每笔消费抽一次**：客单 S$25 × 抽奖 2% × 即时占比 35% = S$0.175/次，
 * 差 20 倍，直接套用会亏穿。所以奖品必须按实际 EV 现算。
 *
 * ## 标定公式
 *
 *   EV = 客单价 × drawPercent × instantPoolRatio / 100
 *
 * 给定 EV，固定尾部（大额低频）的权重与倍数，反解基础档权重使加权均值恰好等于 EV：
 *
 *   (w₁·v₁ + S) / (w₁ + W) = EV     →     w₁ = (EV·W − S) / (v₁ − EV)
 *
 * 其中 S、W 是尾部各档的加权和与权重和。因 v₁ < EV 且 S > EV·W，w₁ 恒为正。
 *
 * ## 爆点在大奖池，不在即时池
 *
 * 若把 S$188 级爆点塞进即时池，为了把均值压回 EV，基础档概率会被推到 95%+，
 * 体感变成「几乎永远是最小奖」。正确做法是即时池只做高频小确幸（4 档），
 * 真正的爆点由**累积的大奖池**承担——这正是 35/65 双池结构的意义。
 */

export type CreditPrize = {
  /** 稳定 id，用于逐档解锁判定与统计 */
  id: string;
  nameZh: string;
  nameEn: string;
  icon: string;
  valueCents: number;
  weight: number;
};

export type CalibratedPack = {
  evCents: number;
  prizes: CreditPrize[];
  /** 各档中奖概率 %（展示给商家看，避免"以为人人中大奖"） */
  distribution: Array<{ id: string; valueCents: number; percent: number }>;
  /** 实际加权均值。feasible 时与 evCents 一致（取整误差 ≤1 分） */
  actualEvCents: number;
  /**
   * 目标 EV 是否可达。
   *
   * EV ≤ 最小奖额时无解——「每笔必中」且「最小奖 S$0.20」两个约束下，
   * 单次期望不可能低于 S$0.20。此时任何奖包都会**超发**：
   * 例如目标 S$0.18 实际会变成 S$0.33，商家每笔多掏 80%。
   *
   * 这不是可以四舍五入过去的误差，调用方必须先用累计门槛把 EV 顶上去
   * （`suggestedThresholdCents`），否则不得启用抽奖。
   */
  feasible: boolean;
  /** 不可达时每笔的超发金额（分） */
  overspendCents: number;
};

/** 即时奖最小面额：低于此值体感是侮辱 */
export const MIN_INSTANT_PRIZE_CENTS = 20;
/** EV 低于此值必须启用累计门槛（见 shouldRequireThreshold） */
export const MIN_VIABLE_EV_CENTS = 30;

/** 基础档相对 EV 的倍数 */
const BASE_MULTIPLIER = 0.5;
/** 尾部档：倍数 + 权重（大额低频） */
const TAIL: Array<{ mult: number; weight: number; icon: string }> = [
  { mult: 2, weight: 25, icon: "🎫" },
  { mult: 5, weight: 10, icon: "💵" },
  { mult: 20, weight: 2, icon: "💰" },
];

/** 取整到好看的面额：<S$1 到 5 分，<S$5 到 1 角，<S$20 到 5 角，其余到元 */
export function roundNiceCents(cents: number): number {
  const c = Math.max(0, Math.round(cents));
  if (c < 100) return Math.max(5, Math.round(c / 5) * 5);
  if (c < 500) return Math.round(c / 10) * 10;
  if (c < 2000) return Math.round(c / 50) * 50;
  return Math.round(c / 100) * 100;
}

/** 每笔即时奖期望：客单价 × 抽奖% × 即时池占比% */
export function instantEvCents(input: {
  avgTicketCents: number;
  drawPercent: number;
  instantPoolRatio: number;
}): number {
  const ev =
    (Math.max(0, input.avgTicketCents) *
      Math.max(0, input.drawPercent) *
      Math.max(0, input.instantPoolRatio)) /
    10_000;
  return Math.round(ev);
}

/** EV 太低时必须改用「累计满 N 元抽一次」，否则单次奖额不成体统 */
export function shouldRequireThreshold(evCents: number): boolean {
  return evCents < MIN_VIABLE_EV_CENTS;
}

/** 为把 EV 顶到可用水平，需要的累计消费门槛（分） */
export function suggestedThresholdCents(input: {
  avgTicketCents: number;
  drawPercent: number;
  instantPoolRatio: number;
}): number {
  const ev = instantEvCents(input);
  if (ev <= 0 || !shouldRequireThreshold(ev)) return 0;
  const factor = Math.ceil(MIN_VIABLE_EV_CENTS / ev);
  return roundNiceCents(input.avgTicketCents * factor);
}

/**
 * 按目标 EV 生成杠铃型即时奖包。
 * 基础档权重由公式反解，保证加权均值等于 EV。
 */
export function calibrateBarbellPack(evCents: number): CalibratedPack {
  const ev = Math.max(1, Math.round(evCents));

  const baseValue = Math.max(
    MIN_INSTANT_PRIZE_CENTS,
    roundNiceCents(ev * BASE_MULTIPLIER)
  );

  // EV 打不住最小奖额：无解。退化成单档最小奖并如实报告超发，
  // 绝不靠"多给点"糊过去——那是商家每笔真金白银的损失。
  if (baseValue >= ev) {
    const only: CreditPrize = {
      id: "credit_base",
      nameZh: `S$${(MIN_INSTANT_PRIZE_CENTS / 100).toFixed(2)} 抵扣`,
      nameEn: `S$${(MIN_INSTANT_PRIZE_CENTS / 100).toFixed(2)} credit`,
      icon: "🍬",
      valueCents: MIN_INSTANT_PRIZE_CENTS,
      weight: 100,
    };
    return {
      evCents: ev,
      prizes: [only],
      distribution: [
        { id: only.id, valueCents: only.valueCents, percent: 100 },
      ],
      actualEvCents: MIN_INSTANT_PRIZE_CENTS,
      feasible: false,
      overspendCents: MIN_INSTANT_PRIZE_CENTS - ev,
    };
  }
  const tail = TAIL.map((t, i) => ({
    id: `credit_t${i + 2}`,
    valueCents: roundNiceCents(ev * t.mult),
    weight: t.weight,
    icon: t.icon,
  })).filter((t) => t.valueCents > baseValue);

  const W = tail.reduce((s, t) => s + t.weight, 0);
  const S = tail.reduce((s, t) => s + t.weight * t.valueCents, 0);

  // w₁ = (EV·W − S) / (v₁ − EV)；此处 v₁ < EV 已由上方分支保证，故分母为负；
  // 尾部平均高于 EV 时分子亦为负 → w₁ > 0
  const denom = baseValue - ev;
  const baseWeight =
    tail.length === 0 ? 100 : Math.max(1, Math.round((ev * W - S) / denom));

  const prizes: CreditPrize[] = [
    {
      id: "credit_base",
      nameZh: `S$${(baseValue / 100).toFixed(2)} 抵扣`,
      nameEn: `S$${(baseValue / 100).toFixed(2)} credit`,
      icon: "🍬",
      valueCents: baseValue,
      weight: baseWeight,
    },
    ...tail.map((t) => ({
      id: t.id,
      nameZh: `S$${(t.valueCents / 100).toFixed(2)} 抵扣`,
      nameEn: `S$${(t.valueCents / 100).toFixed(2)} credit`,
      icon: t.icon,
      valueCents: t.valueCents,
      weight: t.weight,
    })),
  ];

  const totalWeight = prizes.reduce((s, p) => s + p.weight, 0);
  const actualEvCents = Math.round(
    prizes.reduce((s, p) => s + p.weight * p.valueCents, 0) / totalWeight
  );

  return {
    evCents: ev,
    prizes,
    distribution: prizes.map((p) => ({
      id: p.id,
      valueCents: p.valueCents,
      percent: Number(((p.weight / totalWeight) * 100).toFixed(2)),
    })),
    actualEvCents,
    feasible: true,
    overspendCents: Math.max(0, actualEvCents - ev),
  };
}

/** 加权抽一个即时奖 */
export function drawCreditPrize(
  prizes: CreditPrize[],
  rng: () => number = Math.random
): CreditPrize {
  const total = prizes.reduce((s, p) => s + p.weight, 0);
  if (total <= 0) return prizes[0];
  let r = rng() * total;
  for (const p of prizes) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return prizes[prizes.length - 1];
}

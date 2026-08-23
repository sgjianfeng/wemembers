import { prisma } from "@/lib/db";

export const DEFAULT_TIER_CONFIGS = [
  { tier: "regular", name: "普通会员", pointsRequired: 0, color: "#94A3B8", benefits: "[]", cashbackBonusPercent: 0 },
  { tier: "silver", name: "银卡会员", pointsRequired: 500, color: "#64748B", benefits: "[]", cashbackBonusPercent: 0 },
  { tier: "gold", name: "金卡会员", pointsRequired: 2000, color: "#F59E0B", benefits: "[]", cashbackBonusPercent: 0 },
  { tier: "platinum", name: "铂金会员", pointsRequired: 10000, color: "#8B5CF6", benefits: "[]", cashbackBonusPercent: 0 },
] as const;

/** 单档返现加成上限（百分点）。加成是商家负债，必须有天花板 */
export const TIER_BONUS_PERCENT_MAX = 5;

/** 领券扣积分等场景的可预期错误 */
export class PointsError extends Error {
  constructor(public code: "INSUFFICIENT" | "NO_MEMBERSHIP") {
    super(code);
    this.name = "PointsError";
  }
}

export async function getTierConfigs(businessId: string) {
  const configs = await prisma.membershipTierConfig.findMany({
    where: { businessId },
    orderBy: { pointsRequired: "asc" },
  });
  if (configs.length === 4) return configs;

  const existingTiers = new Set(configs.map((c) => c.tier));
  return [
    ...configs,
    ...DEFAULT_TIER_CONFIGS.filter((d) => !existingTiers.has(d.tier)).map((d) => ({
      id: "",
      businessId,
      ...d,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  ].sort((a, b) => a.pointsRequired - b.pointsRequired);
}

export function calculateTier(
  points: number,
  configs: { tier: string; pointsRequired: number }[]
): string {
  const sorted = [...configs].sort((a, b) => b.pointsRequired - a.pointsRequired);
  for (const c of sorted) {
    if (points >= c.pointsRequired) return c.tier;
  }
  return "regular";
}

export function getNextTier(
  points: number,
  configs: { tier: string; pointsRequired: number; name: string }[]
): { tier: string; name: string; pointsNeeded: number; progress: number } | null {
  const sorted = [...configs].sort((a, b) => a.pointsRequired - b.pointsRequired);
  for (const cfg of sorted) {
    if (points < cfg.pointsRequired) {
      const prev = sorted
        .filter((c) => c.pointsRequired <= points)
        .sort((a, b) => b.pointsRequired - a.pointsRequired)[0];
      const prevMin = prev?.pointsRequired ?? 0;
      const needed = cfg.pointsRequired - points;
      const range = cfg.pointsRequired - prevMin;
      return {
        tier: cfg.tier,
        name: cfg.name,
        pointsNeeded: needed,
        progress: range > 0 ? Math.round(((points - prevMin) / range) * 100) : 100,
      };
    }
  }
  return null;
}

export async function addPointsLog(params: {
  membershipId: string;
  storeId?: string;
  amount: number;
  type: string;
  reason: string;
}): Promise<number> {
  const membership = await prisma.membership.findUnique({
    where: { id: params.membershipId },
    select: { points: true },
  });
  if (!membership) throw new Error("Membership not found");

  const balanceAfter = membership.points + params.amount;

  await prisma.pointsLog.create({
    data: {
      membershipId: params.membershipId,
      storeId: params.storeId || null,
      amount: params.amount,
      type: params.type,
      reason: params.reason,
      balanceAfter,
    },
  });

  return balanceAfter;
}

/**
 * 复算等级。
 *
 * **依据是 lifetimePoints（累计获得），不是 points（可花余额）。**
 * 顾客花积分领券不应该掉级——那是把「花钱」惩罚成「降级」，
 * 也会让等级随余额来回抖动。
 */
export async function checkAndUpgradeTier(
  membershipId: string,
  businessId: string
): Promise<string | null> {
  const [membership, configs] = await Promise.all([
    prisma.membership.findUnique({
      where: { id: membershipId },
      select: { lifetimePoints: true, tier: true },
    }),
    getTierConfigs(businessId),
  ]);

  if (!membership) return null;

  const newTier = calculateTier(membership.lifetimePoints, configs);
  if (newTier !== membership.tier) {
    await prisma.membership.update({
      where: { id: membershipId },
      data: { tier: newTier },
    });
    return newTier;
  }

  return null;
}

// ────────────────────────────────────────────────────────────
// 品牌积分：发放 / 扣减
//
// 资金红线：**积分是发放它的那个品牌的负债，只能在该品牌内使用。**
// 平台层的 User.pointsBalance 不是可花货币（见 §串账修复），
// 任何「扣积分换东西」的路径都必须走下面两个函数，不能直接改 User.pointsBalance，
// 否则 A 商家发的分会变成 B 商家的成本。
// ────────────────────────────────────────────────────────────

/** 顾客在某品牌的可花积分。没有会员关系时为 0 */
export async function getBrandPoints(
  businessId: string,
  customerId: string
): Promise<number> {
  const m = await prisma.membership.findUnique({
    where: { businessId_customerId: { businessId, customerId } },
    select: { points: true },
  });
  return m?.points ?? 0;
}

/**
 * 品牌内发积分：points 与 lifetimePoints 同增，写流水，复算等级。
 * 没有会员关系时自动开卡。
 */
export async function grantBrandPoints(params: {
  businessId: string;
  customerId: string;
  amount: number;
  type: string;
  reason: string;
  storeId?: string | null;
}): Promise<{ balanceAfter: number; newTier: string | null }> {
  const amount = Math.round(params.amount);
  if (amount <= 0) {
    return { balanceAfter: await getBrandPoints(params.businessId, params.customerId), newTier: null };
  }

  const membership = await prisma.membership.upsert({
    where: {
      businessId_customerId: {
        businessId: params.businessId,
        customerId: params.customerId,
      },
    },
    create: {
      businessId: params.businessId,
      customerId: params.customerId,
      points: amount,
      lifetimePoints: amount,
    },
    update: {
      points: { increment: amount },
      lifetimePoints: { increment: amount },
    },
    select: { id: true, points: true },
  });

  await prisma.pointsLog.create({
    data: {
      membershipId: membership.id,
      storeId: params.storeId || null,
      amount,
      type: params.type,
      reason: params.reason,
      balanceAfter: membership.points,
    },
  });

  const newTier = await checkAndUpgradeTier(membership.id, params.businessId);
  return { balanceAfter: membership.points, newTier };
}

/**
 * 品牌内扣积分：只减 points，**不动 lifetimePoints**（所以不会掉级）。
 *
 * 扣减用条件 updateMany 做，`points: { gte: amount }` 让「查余额」和「扣余额」
 * 落在同一条语句里——并发领券时不会扣成负数。
 *
 * @throws PointsError("NO_MEMBERSHIP" | "INSUFFICIENT")
 */
export async function spendBrandPoints(params: {
  businessId: string;
  customerId: string;
  amount: number;
  type: string;
  reason: string;
  storeId?: string | null;
}): Promise<{ balanceAfter: number }> {
  const amount = Math.round(params.amount);

  const membership = await prisma.membership.findUnique({
    where: {
      businessId_customerId: {
        businessId: params.businessId,
        customerId: params.customerId,
      },
    },
    select: { id: true, points: true },
  });

  if (amount <= 0) {
    if (!membership) throw new PointsError("NO_MEMBERSHIP");
    return { balanceAfter: membership.points };
  }
  if (!membership) throw new PointsError("NO_MEMBERSHIP");

  const hit = await prisma.membership.updateMany({
    where: { id: membership.id, points: { gte: amount } },
    data: { points: { decrement: amount } },
  });
  if (hit.count === 0) throw new PointsError("INSUFFICIENT");

  const balanceAfter = membership.points - amount;

  await prisma.pointsLog.create({
    data: {
      membershipId: membership.id,
      storeId: params.storeId || null,
      amount: -amount,
      type: params.type,
      reason: params.reason,
      balanceAfter,
    },
  });

  return { balanceAfter };
}

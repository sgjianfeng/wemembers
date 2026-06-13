import { prisma } from "@/lib/db";

export const DEFAULT_TIER_CONFIGS = [
  { tier: "regular", name: "普通会员", pointsRequired: 0, color: "#94A3B8", benefits: "[]" },
  { tier: "silver", name: "银卡会员", pointsRequired: 500, color: "#64748B", benefits: "[]" },
  { tier: "gold", name: "金卡会员", pointsRequired: 2000, color: "#F59E0B", benefits: "[]" },
  { tier: "platinum", name: "铂金会员", pointsRequired: 10000, color: "#8B5CF6", benefits: "[]" },
] as const;

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

export async function checkAndUpgradeTier(
  membershipId: string,
  businessId: string
): Promise<string | null> {
  const [membership, configs] = await Promise.all([
    prisma.membership.findUnique({
      where: { id: membershipId },
      select: { points: true, tier: true },
    }),
    getTierConfigs(businessId),
  ]);

  if (!membership) return null;

  const newTier = calculateTier(membership.points, configs);
  if (newTier !== membership.tier) {
    await prisma.membership.update({
      where: { id: membershipId },
      data: { tier: newTier },
    });
    return newTier;
  }

  return null;
}

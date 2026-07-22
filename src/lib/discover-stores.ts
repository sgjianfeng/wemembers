import { prisma } from "@/lib/db";

export type DiscoverStoreItem = {
  businessId: string;
  businessName: string;
  businessSlug: string | null;
  businessLogo: string | null;
  businessCategory: string | null;
  campaignCount: number;
  couponCount: number;
  storeCount: number;
  memberCount: number;
  /** Simple popularity score for sorting */
  score: number;
};

/**
 * Lightweight "hot stores" ranking for consumer discover.
 * Score = active campaigns×3 + open coupons×2 + members + physical store count.
 */
export async function listHotStores(limit = 50): Promise<DiscoverStoreItem[]> {
  const businesses = await prisma.user.findMany({
    where: {
      role: "business",
      status: "active",
      businessName: { not: null },
    },
    select: {
      id: true,
      businessName: true,
      businessSlug: true,
      businessLogo: true,
      businessCategory: true,
      _count: {
        select: {
          memberships: true,
          managedStores: true,
        },
      },
    },
    take: 120,
  });

  if (businesses.length === 0) return [];

  const ids = businesses.map((b) => b.id);
  const now = new Date();

  const [campaignCounts, couponCounts] = await Promise.all([
    prisma.campaign.groupBy({
      by: ["businessId"],
      where: {
        businessId: { in: ids },
        status: "active",
        endDate: { gt: now },
      },
      _count: { id: true },
    }),
    prisma.coupon.groupBy({
      by: ["businessId"],
      where: {
        businessId: { in: ids },
        status: "published",
        validUntil: { gt: now },
      },
      _count: { id: true },
    }),
  ]);

  const campMap = new Map(
    campaignCounts.map((r) => [r.businessId, r._count.id])
  );
  const coupMap = new Map(couponCounts.map((r) => [r.businessId, r._count.id]));

  const items: DiscoverStoreItem[] = businesses.map((b) => {
    const campaignCount = campMap.get(b.id) || 0;
    const couponCount = coupMap.get(b.id) || 0;
    const memberCount = b._count.memberships;
    const storeCount = b._count.managedStores;
    const score =
      campaignCount * 3 + couponCount * 2 + memberCount + storeCount;
    return {
      businessId: b.id,
      businessName: b.businessName || "—",
      businessSlug: b.businessSlug,
      businessLogo: b.businessLogo,
      businessCategory: b.businessCategory,
      campaignCount,
      couponCount,
      storeCount,
      memberCount,
      score,
    };
  });

  // Prefer businesses that have something to show; still list others lower
  items.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.businessName.localeCompare(b.businessName);
  });

  return items.slice(0, limit);
}

export function storeHref(item: {
  businessSlug: string | null;
  businessId: string;
}): string {
  // Shop pages need a slug; without one, fall back to membership card path
  if (item.businessSlug) return `/shop/${item.businessSlug}`;
  return `/card`;
}

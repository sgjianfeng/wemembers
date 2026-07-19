/**
 * Seller attribution (店家 or 推广人).
 * Only eligible sellers may receive commission via voucher.sellerId.
 */
import { prisma } from "@/lib/db";

export type SellerKind = "business" | "promoter" | null;

export interface EligibleSeller {
  userId: string;
  kind: "business" | "promoter";
  displayName: string;
}

/**
 * business 账号，或已激活推广人的 customer，可作为分享卖家。
 */
export async function getEligibleSeller(
  userId: string | null | undefined
): Promise<EligibleSeller | null> {
  if (!userId || typeof userId !== "string") return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      status: true,
      displayName: true,
      businessName: true,
      promoterAccount: { select: { isActive: true } },
    },
  });

  if (!user || user.status !== "active") return null;

  if (user.role === "business") {
    return {
      userId: user.id,
      kind: "business",
      displayName: user.businessName || user.displayName || "商家",
    };
  }

  // 店员：可作活动分发归因（专属活动卡）
  if (user.role === "staff" && user.status === "active") {
    return {
      userId: user.id,
      kind: "promoter", // 佣金路径与推广人共用 sellerId
      displayName: user.displayName || "店员",
    };
  }

  // Promoter: customer (or any non-business) with active PromoterAccount
  if (user.promoterAccount?.isActive) {
    return {
      userId: user.id,
      kind: "promoter",
      displayName: user.displayName || "推广人",
    };
  }

  return null;
}

/**
 * Resolve seller for a purchase.
 * - shareSelling must be on
 * - seller must be eligible (business | active promoter)
 * - self-purchase: no attribution (blocks self-commission)
 */
export async function resolvePurchaseSellerId(opts: {
  shareSellingEnabled: boolean;
  customerId: string;
  sellerId?: string | null;
}): Promise<string | null> {
  if (!opts.shareSellingEnabled) return null;
  const raw = opts.sellerId?.trim();
  if (!raw) return null;
  // Anti-fraud: cannot be your own seller on self-buy
  if (raw === opts.customerId) return null;

  const eligible = await getEligibleSeller(raw);
  return eligible?.userId ?? null;
}

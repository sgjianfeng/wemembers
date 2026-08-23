/**
 * 顾客侧「品牌卡」—— 把一个顾客的全部资产按品牌聚合
 *
 * ## 为什么按品牌，不按活动
 *
 * 活动是**商家**的组织单位。顾客没有「我参加了某活动」这个心智：
 * - 消费返是规则型活动，顾客从没「参加」过，他只是消费后扫了个码
 * - 顾客想的是「我在 Meow BBQ 有 2 块 7 能花」，活动名对他没有信息量
 * - 同一家店的三笔钱（购券余额 / 抵扣额度 / 中奖券）分属三个活动，
 *   但**在同一家店都能花** —— 按活动分组是把一件事拆成三件
 *
 * ## 为什么合并券包与余额
 *
 * 券包（CustomerCoupon）与余额（Voucher）是两种**存储形式**，是数据库的分法。
 * 顾客要回答的是「我在这家店有什么」，跑两个 tab 才能拼出答案。
 */
import { prisma } from "@/lib/db";
import { isSpendableBalanceVoucher } from "@/lib/voucher-classification";

/** 顾客侧只用两个词：能抵钱的叫「余额」，一次性的叫「优惠券」 */
export type BrandCard = {
  businessId: string;
  businessName: string;
  businessSlug: string | null;
  businessLogo: string | null;
  /** 会员关系；仅有券无会员关系时为 null */
  membership: {
    points: number;
    tier: string;
    visitsCount: number;
    isFavorite: boolean;
  } | null;
  /** 购券余额：顾客付过钱，可提现 */
  purchaseCents: number;
  /** 消费抵扣额度：消费返 + 即时小奖，不可提现 */
  cashbackCents: number;
  /** 中奖奖励券：不可提现，每张独立有效期 */
  prizeCents: number;
  /** 三者合计 —— 顾客在这家店「能花多少」 */
  spendableCents: number;
  /** 一次性权益券张数（满减 / 折扣 / 赠品） */
  couponCount: number;
  /** 有余额的券张数 */
  voucherCount: number;
};

const ORIGIN_BUCKET: Record<string, "purchase" | "cashback" | "prize"> = {
  purchase: "purchase",
  cashback: "cashback",
  prize: "prize",
  // gift / promo 等历史来源按购券余额处理（它们过去就是这么展示的）
};

/** 排序：能花的钱多的在前，其次常去的，最后按名字 */
function sortCards(a: BrandCard, b: BrandCard): number {
  if (a.membership?.isFavorite !== b.membership?.isFavorite) {
    return a.membership?.isFavorite ? -1 : 1;
  }
  if (b.spendableCents !== a.spendableCents) {
    return b.spendableCents - a.spendableCents;
  }
  const av = a.membership?.visitsCount ?? 0;
  const bv = b.membership?.visitsCount ?? 0;
  if (bv !== av) return bv - av;
  return a.businessName.localeCompare(b.businessName);
}

export async function getCustomerBrandCards(
  customerId: string
): Promise<BrandCard[]> {
  const [memberships, vouchers, coupons] = await Promise.all([
    prisma.membership.findMany({
      where: { customerId },
      include: {
        business: {
          select: {
            id: true,
            businessName: true,
            businessSlug: true,
            businessLogo: true,
          },
        },
      },
    }),
    prisma.voucher.findMany({
      where: { customerId, status: "active" },
      select: {
        balanceCents: true,
        paidCents: true,
        usedCents: true,
        drawWeight: true,
        paymentMethod: true,
        issueReason: true,
        issueNote: true,
        status: true,
        origin: true,
        campaign: {
          select: {
            business: {
              select: {
                id: true,
                businessName: true,
                businessSlug: true,
                businessLogo: true,
              },
            },
          },
        },
      },
    }),
    prisma.customerCoupon.findMany({
      // CustomerCoupon 的可用态是 "available"（不是 Voucher 的 "active"）；
      // 过期由 expiresAt / coupon.validUntil 决定，这里一并排除已过期的
      where: {
        customerId,
        status: "available",
        OR: [
          { expiresAt: null, coupon: { validUntil: { gte: new Date() } } },
          { expiresAt: { gte: new Date() } },
        ],
      },
      select: {
        coupon: {
          select: {
            validUntil: true,
            business: {
              select: {
                id: true,
                businessName: true,
                businessSlug: true,
                businessLogo: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const byId = new Map<string, BrandCard>();

  const ensure = (b: {
    id: string;
    businessName: string | null;
    businessSlug: string | null;
    businessLogo: string | null;
  }): BrandCard => {
    let card = byId.get(b.id);
    if (!card) {
      card = {
        businessId: b.id,
        businessName: b.businessName || "未命名商家",
        businessSlug: b.businessSlug,
        businessLogo: b.businessLogo,
        membership: null,
        purchaseCents: 0,
        cashbackCents: 0,
        prizeCents: 0,
        spendableCents: 0,
        couponCount: 0,
        voucherCount: 0,
      };
      byId.set(b.id, card);
    }
    return card;
  };

  for (const m of memberships) {
    const card = ensure(m.business);
    card.membership = {
      points: m.points,
      tier: m.tier,
      visitsCount: m.visitsCount,
      isFavorite: m.isFavorite,
    };
  }

  for (const v of vouchers) {
    const biz = v.campaign?.business;
    if (!biz) continue;
    // 零余额的「大奖签」不是钱，不能进余额
    if (!isSpendableBalanceVoucher(v)) continue;
    const card = ensure(biz);
    const bucket = ORIGIN_BUCKET[v.origin] ?? "purchase";
    if (bucket === "cashback") card.cashbackCents += v.balanceCents;
    else if (bucket === "prize") card.prizeCents += v.balanceCents;
    else card.purchaseCents += v.balanceCents;
    card.voucherCount += 1;
  }

  for (const cc of coupons) {
    const biz = cc.coupon?.business;
    if (!biz) continue;
    ensure(biz).couponCount += 1;
  }

  const cards = Array.from(byId.values());
  for (const c of cards) {
    c.spendableCents = c.purchaseCents + c.cashbackCents + c.prizeCents;
  }
  return cards.sort(sortCards);
}

/** 单个品牌的卡（详情页用）；无任何关系时返回 null */
export async function getCustomerBrandCard(
  customerId: string,
  businessId: string
): Promise<BrandCard | null> {
  const cards = await getCustomerBrandCards(customerId);
  return cards.find((c) => c.businessId === businessId) ?? null;
}

/** 全部品牌合计 —— 顾客总资产 */
export function totalSpendableCents(cards: BrandCard[]): number {
  return cards.reduce((sum, c) => sum + c.spendableCents, 0);
}

/**
 * 品牌卡聚合：顾客的资产按品牌合并，而不是按活动或存储形式
 */
import { prisma } from "./setup";
import {
  getCustomerBrandCards,
  getCustomerBrandCard,
  totalSpendableCents,
} from "@/lib/customer-brand-cards";

describe("getCustomerBrandCards", () => {
  let custId: string;
  let bizA: string;
  let bizB: string;
  let campA: string;
  let campB: string;

  beforeAll(async () => {
    const stamp = `bc-${Date.now()}`;
    const cust = await prisma.user.create({
      data: { role: "customer", phone: `9${Date.now()}`.slice(0, 11) },
    });
    custId = cust.id;

    const mk = async (suffix: string, name: string) => {
      const b = await prisma.user.create({
        data: {
          role: "business",
          email: `${stamp}-${suffix}@test.local`,
          businessName: name,
          businessSlug: `${stamp}-${suffix}`,
        },
      });
      const c = await prisma.campaign.create({
        data: {
          businessId: b.id,
          name: `${name} 活动`,
          type: "voucher_sale",
          status: "active",
          startDate: new Date(Date.now() - 86400_000),
          endDate: new Date(Date.now() + 86400_000 * 30),
        },
      });
      return { bizId: b.id, campId: c.id };
    };

    const A = await mk("a", "Meow BBQ");
    const B = await mk("b", "Coffee Co");
    bizA = A.bizId; campA = A.campId;
    bizB = B.bizId; campB = B.campId;

    const voucher = (
      campaignId: string,
      origin: string,
      balanceCents: number,
      paidCents = 0
    ) =>
      prisma.voucher.create({
        data: {
          customerId: custId,
          campaignId,
          amountCents: balanceCents,
          paidCents,
          balanceCents,
          prizePoolContribution: 0,
          drawWeight: 0,
          tier: "small",
          origin,
          feeExempt: origin !== "purchase",
        },
      });

    // A 店：三种来源都有
    await voucher(campA, "purchase", 5_000, 4_500);
    await voucher(campA, "cashback", 240);
    await voucher(campA, "cashback", 30);
    await voucher(campA, "prize", 1_000);
    // B 店：只有购券余额
    await voucher(campB, "purchase", 1_500, 1_500);

    // 零余额「大奖签」——不是钱，不能计入
    await prisma.voucher.create({
      data: {
        customerId: custId,
        campaignId: campA,
        amountCents: 0,
        paidCents: 0,
        balanceCents: 0,
        prizePoolContribution: 0,
        drawWeight: 20,
        tier: "small",
        paymentMethod: "free",
        issueReason: "marketing",
      },
    });

    // A 店会员关系
    await prisma.membership.create({
      data: {
        businessId: bizA,
        customerId: custId,
        points: 320,
        visitsCount: 4,
        tier: "gold",
      },
    });

    // A 店一张权益券
    const coupon = await prisma.coupon.create({
      data: {
        businessId: bizA,
        title: "满100减20",
        type: "fixed_amount",
        valueCents: 2_000,
        validFrom: new Date(Date.now() - 86400_000),
        validUntil: new Date(Date.now() + 86400_000 * 30),
        status: "published",
      },
    });
    await prisma.customerCoupon.create({
      data: { customerId: custId, couponId: coupon.id, qrCode: `qr-${stamp}` },
    });
  });

  test("按品牌聚合，不按活动或存储形式", async () => {
    const cards = await getCustomerBrandCards(custId);
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.businessName).sort()).toEqual([
      "Coffee Co",
      "Meow BBQ",
    ]);
  });

  test("同一品牌的三种余额合并成一个「可用」", async () => {
    const a = await getCustomerBrandCard(custId, bizA);
    expect(a!.purchaseCents).toBe(5_000);
    expect(a!.cashbackCents).toBe(270); // 240 + 30，两张券合一
    expect(a!.prizeCents).toBe(1_000);
    expect(a!.spendableCents).toBe(6_270);
  });

  test("零余额大奖签不计入余额", async () => {
    const a = await getCustomerBrandCard(custId, bizA);
    // 4 张有余额的券（2 张 cashback + 1 purchase + 1 prize），大奖签被排除
    expect(a!.voucherCount).toBe(4);
  });

  test("会员关系与权益券挂在同一张卡上", async () => {
    const a = await getCustomerBrandCard(custId, bizA);
    expect(a!.membership?.points).toBe(320);
    expect(a!.membership?.tier).toBe("gold");
    expect(a!.couponCount).toBe(1);
  });

  test("无会员关系但有券的品牌也出卡", async () => {
    const b = await getCustomerBrandCard(custId, bizB);
    expect(b!.membership).toBeNull();
    expect(b!.spendableCents).toBe(1_500);
  });

  test("排序：可用金额多的在前", async () => {
    const cards = await getCustomerBrandCards(custId);
    expect(cards[0].businessId).toBe(bizA);
  });

  test("总资产 = 各品牌之和", async () => {
    const cards = await getCustomerBrandCards(custId);
    expect(totalSpendableCents(cards)).toBe(6_270 + 1_500);
  });

  test("无任何关系的顾客返回空", async () => {
    const empty = await prisma.user.create({ data: { role: "customer" } });
    expect(await getCustomerBrandCards(empty.id)).toEqual([]);
    expect(await getCustomerBrandCard(empty.id, bizA)).toBeNull();
  });
});

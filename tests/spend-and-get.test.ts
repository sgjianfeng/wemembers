/**
 * 满赠（Spend & Get）—— 规则校验 + 负债账。
 *
 * 核心断言：满赠发出去的额度和 cashback 发出去的额度是**同一种负债**，
 * 走同一对计数器，受同一道闸门。以前满赠不记账，商家另开一个满赠活动
 * 就能绕开 cashback 上的负债上限。
 */
import { describe, test, expect } from "@jest/globals";
import { prisma } from "./setup";
import {
  validateSpendGetRules,
  parseSpendGetRules,
  nominalCostPercent,
  businessOutstandingLiabilityCents,
  assertCanIssueGift,
  recordGiftIssued,
  recordGiftRedeemed,
  SpendGetError,
  DEFAULT_SPEND_GET_RULES,
  MAX_GIFT_RATIO,
} from "@/lib/spend-and-get";

describe("满赠规则校验", () => {
  const ok = { minSpendCents: 12_000, giftCouponCents: 6_100, validDays: 30 };

  test("默认满赠预设合法", () => {
    expect(validateSpendGetRules(ok).ok).toBe(true);
  });

  test("赠额不得大于等于门槛", () => {
    const r = validateSpendGetRules({ ...ok, giftCouponCents: 12_000 });
    expect(r.ok).toBe(false);
  });

  test("赠额不得超过门槛的 60%", () => {
    // 满 100 送 80 = 直接把下一单送掉
    const r = validateSpendGetRules({
      minSpendCents: 10_000,
      giftCouponCents: 8_000,
      validDays: 30,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(String(Math.round(MAX_GIFT_RATIO * 100)));
  });

  test("刚好 60% 通过", () => {
    expect(
      validateSpendGetRules({
        minSpendCents: 10_000,
        giftCouponCents: 6_000,
        validDays: 30,
      }).ok
    ).toBe(true);
  });

  test("有效期越界被拒", () => {
    expect(validateSpendGetRules({ ...ok, validDays: 0 }).ok).toBe(false);
    expect(validateSpendGetRules({ ...ok, validDays: 400 }).ok).toBe(false);
  });

  test("门槛或赠额为 0 被拒", () => {
    expect(validateSpendGetRules({ ...ok, minSpendCents: 0 }).ok).toBe(false);
    expect(validateSpendGetRules({ ...ok, giftCouponCents: 0 }).ok).toBe(false);
  });

  test("名义成本率 = 赠额 / 门槛", () => {
    expect(nominalCostPercent({ minSpendCents: 12_000, giftCouponCents: 6_100 }))
      .toBeCloseTo(50.83, 1);
  });
});

describe("parseSpendGetRules", () => {
  test("空快照走默认", () => {
    expect(parseSpendGetRules(null)).toEqual(DEFAULT_SPEND_GET_RULES);
  });

  test("认旧的 ndp 键 —— 线上存量活动是这个结构", () => {
    const r = parseSpendGetRules(
      JSON.stringify({ ndp: { minSpendCents: 20_000, giftCouponCents: 5_000 } })
    );
    expect(r.minSpendCents).toBe(20_000);
    expect(r.giftCouponCents).toBe(5_000);
  });

  test("认新的 spendGet 键，且优先于 ndp", () => {
    const r = parseSpendGetRules(
      JSON.stringify({
        spendGet: { minSpendCents: 8_000 },
        ndp: { minSpendCents: 20_000 },
      })
    );
    expect(r.minSpendCents).toBe(8_000);
  });

  test("有效期被夹在 [1, 365]", () => {
    expect(parseSpendGetRules(JSON.stringify({ ndp: { validDays: 9999 } })).validDays).toBe(365);
    expect(parseSpendGetRules(JSON.stringify({ ndp: { validDays: -5 } })).validDays).toBe(1);
  });

  test("坏 JSON 不崩", () => {
    expect(parseSpendGetRules("{oops").minSpendCents).toBe(
      DEFAULT_SPEND_GET_RULES.minSpendCents
    );
  });
});

describe("负债账", () => {
  async function makeBiz(name: string) {
    const stamp = `sg-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const biz = await prisma.user.create({
      data: { role: "business", email: `${stamp}@test.local`, businessName: name, businessSlug: stamp },
    });
    return biz;
  }

  async function makeCampaign(businessId: string, over: Record<string, unknown> = {}) {
    return prisma.campaign.create({
      data: {
        businessId,
        name: "满赠",
        type: "holiday",
        status: "active",
        startDate: new Date(Date.now() - 86400_000),
        endDate: new Date(Date.now() + 86400_000 * 90),
        productKind: "self_use",
        ...over,
      },
    });
  }

  test("未核销额度按**商家**汇总，跨活动相加", async () => {
    const biz = await makeBiz("Agg");
    const a = await makeCampaign(biz.id, { name: "满赠 A" });
    const b = await makeCampaign(biz.id, { name: "消费返 B", type: "cashback" });

    await recordGiftIssued(prisma, a.id, 6_100);
    await recordGiftIssued(prisma, b.id, 3_000);
    expect(await businessOutstandingLiabilityCents(prisma, biz.id)).toBe(9_100);

    await recordGiftRedeemed(prisma, a.id, 6_100);
    expect(await businessOutstandingLiabilityCents(prisma, biz.id)).toBe(3_000);
  });

  test("核销冲减不会把负债做成负数", async () => {
    const biz = await makeBiz("Neg");
    const c = await makeCampaign(biz.id);
    await recordGiftIssued(prisma, c.id, 1_000);
    await recordGiftRedeemed(prisma, c.id, 5_000);
    expect(await businessOutstandingLiabilityCents(prisma, biz.id)).toBe(0);
  });

  test("上限内放行", async () => {
    const biz = await makeBiz("Cap OK");
    const c = await makeCampaign(biz.id, { maxOutstandingCents: 50_000 });
    await recordGiftIssued(prisma, c.id, 10_000);
    const r = await assertCanIssueGift(prisma, {
      businessId: biz.id,
      giftCents: 6_100,
      maxOutstandingCents: 50_000,
    });
    expect(r.outstandingBeforeCents).toBe(10_000);
  });

  test("超上限拒发", async () => {
    const biz = await makeBiz("Cap Hit");
    const c = await makeCampaign(biz.id, { maxOutstandingCents: 10_000 });
    await recordGiftIssued(prisma, c.id, 9_000);
    await expect(
      assertCanIssueGift(prisma, {
        businessId: biz.id,
        giftCents: 6_100,
        maxOutstandingCents: 10_000,
      })
    ).rejects.toMatchObject({ code: "LIABILITY_CAP_REACHED" });
  });

  test("**另开一个活动绕不过上限** —— 上限看商家不看活动", async () => {
    const biz = await makeBiz("Bypass");
    const cashback = await makeCampaign(biz.id, {
      name: "消费返",
      type: "cashback",
      maxOutstandingCents: 10_000,
    });
    await recordGiftIssued(prisma, cashback.id, 9_500);

    // 商家另开一个满赠活动，配同样的上限，想重新开一条口子
    const spendGet = await makeCampaign(biz.id, {
      name: "满赠",
      maxOutstandingCents: 10_000,
    });
    await expect(
      assertCanIssueGift(prisma, {
        businessId: biz.id,
        giftCents: 6_100,
        maxOutstandingCents: 10_000,
      })
    ).rejects.toBeInstanceOf(SpendGetError);
    // 新活动自己一分没发，但商家总负债已经顶到上限
    const sg = await prisma.campaign.findUnique({ where: { id: spendGet.id } });
    expect(sg!.cashbackIssuedCents).toBe(0);
  });

  test("没配上限时不拦", async () => {
    const biz = await makeBiz("No Cap");
    const c = await makeCampaign(biz.id);
    await recordGiftIssued(prisma, c.id, 1_000_000);
    await expect(
      assertCanIssueGift(prisma, {
        businessId: biz.id,
        giftCents: 6_100,
        maxOutstandingCents: null,
      })
    ).resolves.toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────
// 端到端：发放 → 记负债 → 核销 → 冲减
// ────────────────────────────────────────────────────────────

import { issueSpendGetGrant } from "@/lib/spend-get-issue";

describe("满赠端到端负债", () => {
  let businessId: string;
  let storeId: string;
  let campaignId: string;

  beforeAll(async () => {
    const stamp = `sge-${Date.now()}`;
    const biz = await prisma.user.create({
      data: {
        role: "business",
        email: `${stamp}@test.local`,
        businessName: "SG E2E",
        businessSlug: stamp,
      },
    });
    businessId = biz.id;
    const store = await prisma.store.create({
      data: { businessId, name: "SG Store", slug: `${stamp}-store` },
    });
    storeId = store.id;
    const campaign = await prisma.campaign.create({
      data: {
        businessId,
        name: "满赠测试",
        type: "holiday",
        status: "active",
        startDate: new Date(Date.now() - 86400_000),
        endDate: new Date(Date.now() + 86400_000 * 60),
        productKind: "self_use",
        tags: JSON.stringify(["spend_get"]),
        rulesSnapshot: JSON.stringify({
          ndp: { minSpendCents: 12_000, giftCouponCents: 6_100, validDays: 30 },
        }),
      },
    });
    campaignId = campaign.id;
  });

  test("发放 S$61 → 商家负债 +S$61", async () => {
    const before = await businessOutstandingLiabilityCents(prisma, businessId);

    const r = await prisma.$transaction((tx) =>
      issueSpendGetGrant(tx, {
        campaignId,
        businessId,
        storeId,
        phone: "93330001",
        channel: "receipt",
        receiptAmountCents: 15_000,
        receiptNote: "e2e-1",
      })
    );
    expect(r.giftCoupon.valueCents).toBe(6_100);

    const after = await businessOutstandingLiabilityCents(prisma, businessId);
    expect(after - before).toBe(6_100);

    const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
    expect(c!.cashbackIssuedCents).toBe(6_100);
  });

  test("赠券模版打了 origin=spend_get 标记 —— 核销要靠它冲减", async () => {
    const coupon = await prisma.coupon.findFirst({
      where: { businessId, campaignId },
    });
    expect(coupon!.origin).toBe("spend_get");
  });

  test("核销 → 负债冲减回去", async () => {
    const claim = await prisma.customerCoupon.findFirst({
      where: { coupon: { businessId, campaignId }, status: "available" },
      include: { coupon: true },
    });
    expect(claim).toBeTruthy();

    const { recordGiftRedeemed } = await import("@/lib/spend-and-get");
    await recordGiftRedeemed(prisma, campaignId, claim!.coupon.valueCents);

    const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
    expect(c!.cashbackRedeemedCents).toBe(6_100);
    expect(await businessOutstandingLiabilityCents(prisma, businessId)).toBe(0);
  });

  test("负债顶到上限后停发", async () => {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { maxOutstandingCents: 6_000 },
    });
    // 当前未核销 = 0，但发一张 6100 就会超过 6000
    await expect(
      prisma.$transaction((tx) =>
        issueSpendGetGrant(tx, {
          campaignId,
          businessId,
          storeId,
          phone: "93330002",
          channel: "receipt",
          receiptAmountCents: 15_000,
          receiptNote: "e2e-cap",
        })
      )
    ).rejects.toMatchObject({ code: "LIABILITY_CAP_REACHED" });

    // 拒发后账面没动
    const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
    expect(c!.cashbackIssuedCents).toBe(6_100);
  });

  test("未达门槛照旧拒发，且不记负债", async () => {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { maxOutstandingCents: null },
    });
    const before = await businessOutstandingLiabilityCents(prisma, businessId);
    await expect(
      prisma.$transaction((tx) =>
        issueSpendGetGrant(tx, {
          campaignId,
          businessId,
          storeId,
          phone: "93330003",
          channel: "receipt",
          receiptAmountCents: 5_000,
          receiptNote: "e2e-below",
        })
      )
    ).rejects.toThrow("BELOW_MIN_SPEND");
    expect(await businessOutstandingLiabilityCents(prisma, businessId)).toBe(before);
  });
});

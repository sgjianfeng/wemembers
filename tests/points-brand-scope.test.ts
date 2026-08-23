/**
 * 品牌积分作用域 —— 串账修复的回归测试。
 *
 * 核心不变式：**积分是发放它的品牌的负债，只能在该品牌内花掉。**
 * 修复前领券扣的是 User.pointsBalance（全平台通用），A 商家发的分能兑 B 商家的券。
 */
import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import {
  testPrisma,
  createTestBusiness,
  createTestUser,
  signTestJwt,
  mockRequest,
  setAuthCookie,
  deleteUsersSafe,
} from "./helpers";
import {
  getBrandPoints,
  grantBrandPoints,
  spendBrandPoints,
  PointsError,
  checkAndUpgradeTier,
} from "@/lib/points";

describe("品牌积分作用域", () => {
  type Party = { id: string; role: string };
  let bizA: Party, bizB: Party, customer: Party;
  let couponB: { id: string };

  beforeAll(async () => {
    const a = await createTestBusiness({ businessName: "Brand A" });
    const b = await createTestBusiness({ businessName: "Brand B" });
    bizA = a.user;
    bizB = b.user;
    customer = await createTestUser({ role: "customer", displayName: "Scoped" });

    // B 家发一张需要 300 积分的券
    couponB = await testPrisma.coupon.create({
      data: {
        businessId: bizB.id,
        title: "B 家 300 分券",
        type: "fixed_amount",
        valueCents: 1000,
        pointsRequired: 300,
        status: "published",
        validFrom: new Date(Date.now() - 86400_000),
        validUntil: new Date(Date.now() + 30 * 86400_000),
        perCustomerLimit: 5,
      },
    });
  });

  afterAll(async () => {
    await deleteUsersSafe([bizA.id, bizB.id, customer.id]);
  });

  // ──── 串账：跨品牌不能花 ────

  test("A 家发的积分不能兑 B 家的券", async () => {
    await grantBrandPoints({
      businessId: bizA.id,
      customerId: customer.id,
      amount: 1000,
      type: "manual_grant",
      reason: "A 家发放",
    });
    // 平台层余额也给足，确认路由不再看它
    await testPrisma.user.update({
      where: { id: customer.id },
      data: { pointsBalance: 99999, lifetimePoints: 99999 },
    });

    expect(await getBrandPoints(bizA.id, customer.id)).toBe(1000);
    expect(await getBrandPoints(bizB.id, customer.id)).toBe(0);

    const { POST } = await import("@/app/api/coupons/[id]/claim/route");
    const token = await signTestJwt(customer);
    const req = mockRequest({}, { url: `http://localhost/api/coupons/${couponB.id}/claim` });
    setAuthCookie(req, token);

    const res = await POST(req as any, { params: Promise.resolve({ id: couponB.id }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("本店积分不足");

    // A 家的分一分没少
    expect(await getBrandPoints(bizA.id, customer.id)).toBe(1000);
  });

  test("B 家发够分之后才能兑 B 家的券，且只扣 B 家的分", async () => {
    await grantBrandPoints({
      businessId: bizB.id,
      customerId: customer.id,
      amount: 500,
      type: "manual_grant",
      reason: "B 家发放",
    });

    const { POST } = await import("@/app/api/coupons/[id]/claim/route");
    const token = await signTestJwt(customer);
    const req = mockRequest({}, { url: `http://localhost/api/coupons/${couponB.id}/claim` });
    setAuthCookie(req, token);

    const res = await POST(req as any, { params: Promise.resolve({ id: couponB.id }) });
    expect(res.status).toBe(200);

    expect(await getBrandPoints(bizB.id, customer.id)).toBe(200); // 500 - 300
    expect(await getBrandPoints(bizA.id, customer.id)).toBe(1000); // 未被波及
  });

  test("领券不再扣平台层 User.pointsBalance", async () => {
    const before = await testPrisma.user.findUnique({
      where: { id: customer.id },
      select: { pointsBalance: true },
    });
    expect(before!.pointsBalance).toBe(99999);
  });

  // ──── 等级依据 ────

  test("花积分不掉级：等级看累计，不看余额", async () => {
    const biz = (await createTestBusiness({ businessName: "Tier Basis" })).user;
    const cust = await createTestUser({ role: "customer" });
    try {
      // 累计 2000 → 金卡
      const granted = await grantBrandPoints({
        businessId: biz.id,
        customerId: cust.id,
        amount: 2000,
        type: "manual_grant",
        reason: "攒到金卡",
      });
      expect(granted.newTier).toBe("gold");

      // 花掉 1900，余额只剩 100
      await spendBrandPoints({
        businessId: biz.id,
        customerId: cust.id,
        amount: 1900,
        type: "coupon_claim",
        reason: "领券",
      });

      const m = await testPrisma.membership.findUnique({
        where: { businessId_customerId: { businessId: biz.id, customerId: cust.id } },
      });
      expect(m!.points).toBe(100);
      expect(m!.lifetimePoints).toBe(2000);

      // 复算不应降级
      const after = await checkAndUpgradeTier(m!.id, biz.id);
      expect(after).toBeNull();
      const m2 = await testPrisma.membership.findUnique({ where: { id: m!.id } });
      expect(m2!.tier).toBe("gold");
    } finally {
      await deleteUsersSafe([biz.id, cust.id]);
    }
  });

  // ──── 扣减本身 ────

  test("余额不足抛 INSUFFICIENT，且不产生流水", async () => {
    const before = await testPrisma.pointsLog.count();
    await expect(
      spendBrandPoints({
        businessId: bizB.id,
        customerId: customer.id,
        amount: 99999,
        type: "coupon_claim",
        reason: "超额",
      })
    ).rejects.toBeInstanceOf(PointsError);
    expect(await testPrisma.pointsLog.count()).toBe(before);
  });

  test("没有会员关系时抛 NO_MEMBERSHIP", async () => {
    const stranger = await createTestUser({ role: "customer" });
    try {
      await expect(
        spendBrandPoints({
          businessId: bizA.id,
          customerId: stranger.id,
          amount: 10,
          type: "coupon_claim",
          reason: "无卡",
        })
      ).rejects.toMatchObject({ code: "NO_MEMBERSHIP" });
    } finally {
      await deleteUsersSafe([stranger.id]);
    }
  });

  test("并发扣减不会把余额扣成负数", async () => {
    const biz = (await createTestBusiness({ businessName: "Race" })).user;
    const cust = await createTestUser({ role: "customer" });
    try {
      await grantBrandPoints({
        businessId: biz.id,
        customerId: cust.id,
        amount: 100,
        type: "manual_grant",
        reason: "种子",
      });

      const attempts = Array.from({ length: 5 }, () =>
        spendBrandPoints({
          businessId: biz.id,
          customerId: cust.id,
          amount: 60,
          type: "coupon_claim",
          reason: "并发",
        }).then(
          () => "ok" as const,
          () => "fail" as const
        )
      );
      const results = await Promise.all(attempts);
      expect(results.filter((r) => r === "ok")).toHaveLength(1);

      const m = await testPrisma.membership.findUnique({
        where: { businessId_customerId: { businessId: biz.id, customerId: cust.id } },
      });
      expect(m!.points).toBe(40);
      expect(m!.points).toBeGreaterThanOrEqual(0);
    } finally {
      await deleteUsersSafe([biz.id, cust.id]);
    }
  });

  // ──── 平台侧不得替商家发分 ────

  test("签到只涨平台成长值，不给任何品牌记账", async () => {
    const biz = (await createTestBusiness({ businessName: "CheckIn Bystander" })).user;
    const cust = await createTestUser({ role: "customer" });
    try {
      await grantBrandPoints({
        businessId: biz.id,
        customerId: cust.id,
        amount: 50,
        type: "manual_grant",
        reason: "种子",
      });
      const before = await getBrandPoints(biz.id, cust.id);
      const logsBefore = await testPrisma.pointsLog.count();

      const { POST } = await import("@/app/api/game/checkin/route");
      const token = await signTestJwt({ id: cust.id, role: cust.role });
      const req = mockRequest({});
      setAuthCookie(req, token);
      const res = await POST();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.reward).toBeGreaterThan(0);

      // 品牌账户与流水都不动
      expect(await getBrandPoints(biz.id, cust.id)).toBe(before);
      expect(await testPrisma.pointsLog.count()).toBe(logsBefore);

      // 平台层成长值照涨
      const u = await testPrisma.user.findUnique({
        where: { id: cust.id },
        select: { pointsBalance: true, streakDays: true },
      });
      expect(u!.streakDays).toBe(1);
      expect(u!.pointsBalance).toBe(json.data.reward);
    } finally {
      await deleteUsersSafe([biz.id, cust.id]);
    }
  });

  test("商家手动发分不涨平台通用余额", async () => {
    const biz = (await createTestBusiness({ businessName: "Manual Grant" })).user;
    const cust = await createTestUser({ role: "customer" });
    try {
      await testPrisma.membership.create({
        data: { businessId: biz.id, customerId: cust.id },
      });
      const { POST } = await import("@/app/api/business/members/[id]/route");
      const token = await signTestJwt({ id: biz.id, role: biz.role });
      const req = mockRequest({ amount: 200, reason: "补偿" });
      setAuthCookie(req, token);

      const res = await POST(req as any, { params: Promise.resolve({ id: cust.id }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.points).toBe(200);

      const u = await testPrisma.user.findUnique({
        where: { id: cust.id },
        select: { pointsBalance: true },
      });
      expect(u!.pointsBalance).toBe(0);

      const m = await testPrisma.membership.findUnique({
        where: { businessId_customerId: { businessId: biz.id, customerId: cust.id } },
      });
      expect(m!.points).toBe(200);
      expect(m!.lifetimePoints).toBe(200);
    } finally {
      await deleteUsersSafe([biz.id, cust.id]);
    }
  });
});

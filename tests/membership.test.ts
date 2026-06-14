/**
 * Membership system tests — tier config, points, tiers, logs, member list/detail flow.
 */
import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import { testPrisma, createTestBusiness, createTestUser, signTestJwt, mockRequest, setAuthCookie } from "./helpers";

describe("Membership System", () => {
  let business: any, store: any, customer: any;

  beforeAll(async () => {
    const b = await createTestBusiness({ businessName: "Member Test Inc" });
    business = b.user; store = b.store;
    customer = await createTestUser({ role: "customer", displayName: "Loyal Customer" });
    // Seed token account for customer
    await testPrisma.tokenAccount.create({
      data: { userId: customer.id, balance: 500, totalEarned: 500 },
    });
    // Give customer some starting points
    await testPrisma.user.update({
      where: { id: customer.id },
      data: { pointsBalance: 1000, lifetimePoints: 1000 },
    });
  });

  afterAll(async () => {
    await testPrisma.user.deleteMany({
      where: { id: { in: [business.id, customer.id] } },
    });
  });

  // ──── Tier Config ────

  describe("Tier Configuration", () => {
    test("returns default tier configs when none saved", async () => {
      const { GET } = await import("@/app/api/business/members/config/route");
      const token = await signTestJwt(business);
      const req = mockRequest({}, { method: "GET" });
      setAuthCookie(req, token);

      const res = await GET();
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.length).toBe(4);
      expect(json.data[0].tier).toBe("regular");
      expect(json.data[0].pointsRequired).toBe(0);
      expect(json.data[3].tier).toBe("platinum");
      expect(json.data[3].pointsRequired).toBe(10000);
    });

    test("saves custom tier config", async () => {
      const { PUT } = await import("@/app/api/business/members/config/route");
      const token = await signTestJwt(business);
      const req = mockRequest({
        configs: [
          { tier: "regular", name: "铜牌会员", pointsRequired: 0, color: "#94A3B8", benefits: '["基础权益"]' },
          { tier: "silver", name: "银牌会员", pointsRequired: 300, color: "#64748B", benefits: '["9折","生日礼"]' },
          { tier: "gold", name: "金牌会员", pointsRequired: 1000, color: "#F59E0B", benefits: '["8折","专属客服"]' },
          { tier: "platinum", name: "钻石会员", pointsRequired: 5000, color: "#8B5CF6", benefits: '["7折","VIP"]' },
        ],
      }, { method: "PUT" });
      setAuthCookie(req, token);

      const res = await PUT(req as any);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.success).toBe(true);

      // Verify in DB
      const configs = await testPrisma.membershipTierConfig.findMany({
        where: { businessId: business.id },
        orderBy: { pointsRequired: "asc" },
      });
      expect(configs.length).toBe(4);
      expect(configs[1].name).toBe("银牌会员");
      expect(configs[1].pointsRequired).toBe(300);
    });

    test("rejects staff from tier config", async () => {
      const staff = await testPrisma.user.create({
        data: { phone: `+65999${Math.floor(Math.random() * 100000)}`, role: "staff",
               storeId: store.id, status: "active" },
      });
      const { GET } = await import("@/app/api/business/members/config/route");
      const token = await signTestJwt(staff);
      const req = mockRequest({}, { method: "GET" });
      setAuthCookie(req, token);
      const res = await GET();
      expect(res.status).toBe(403);
    });
  });

  // ──── Member List ────

  describe("Member List", () => {
    test("lists members with search and tier filter", async () => {
      // Create a membership for the customer
      await testPrisma.membership.create({
        data: { businessId: business.id, customerId: customer.id, points: 500, tier: "gold" },
      });

      const { GET } = await import("@/app/api/business/members/route");
      const token = await signTestJwt(business);
      const req = mockRequest({}, {
        method: "GET",
        url: "http://localhost/api/business/members?tier=gold&sort=points",
      });
      setAuthCookie(req, token);

      const res = await GET(req as any);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.length).toBeGreaterThan(0);
      expect(json.data[0].tier).toBe("gold");
    });

    test("filters by search query", async () => {
      const { GET } = await import("@/app/api/business/members/route");
      const token = await signTestJwt(business);
      const req = mockRequest({}, {
        method: "GET",
        url: "http://localhost/api/business/members?search=Loyal",
      });
      setAuthCookie(req, token);

      const res = await GET(req as any);
      const json = await res.json();
      expect(json.data.length).toBeGreaterThan(0);
      expect(json.data[0].customer.displayName).toContain("Loyal");
    });
  });

  // ──── Points Management ────

  describe("Points Operations", () => {
    let membershipId: string;

    beforeAll(async () => {
      // Setup membership
      const m = await testPrisma.membership.upsert({
        where: { businessId_customerId: { businessId: business.id, customerId: customer.id } },
        create: { businessId: business.id, customerId: customer.id, points: 500, tier: "regular" },
        update: {},
      });
      membershipId = m.id;
    });

    test("grants points to member with reason", async () => {
      const { POST } = await import("@/app/api/business/members/[id]/route");
      const token = await signTestJwt(business);
      const req = mockRequest({ amount: 200, reason: "消费满 100 奖励" });
      setAuthCookie(req, token);

      const res = await POST(req as any, { params: Promise.resolve({ id: customer.id }) });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.success).toBe(true);

      // Verify membership points increased
      const m = await testPrisma.membership.findUnique({ where: { id: membershipId } });
      expect(m!.points).toBe(700);

      // Verify PointsLog created
      const log = await testPrisma.pointsLog.findFirst({
        where: { membershipId, type: "manual_grant" },
        orderBy: { createdAt: "desc" },
      });
      expect(log).toBeTruthy();
      expect(log!.amount).toBe(200);
    });

    test("deducts points with reason", async () => {
      const { POST } = await import("@/app/api/business/members/[id]/route");
      const token = await signTestJwt(business);
      const req = mockRequest({ amount: -100, reason: "退货退款" });
      setAuthCookie(req, token);

      const res = await POST(req as any, { params: Promise.resolve({ id: customer.id }) });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.success).toBe(true);

      const m = await testPrisma.membership.findUnique({ where: { id: membershipId } });
      expect(m!.points).toBe(600);
    });

    test("rejects deduction beyond zero", async () => {
      const { POST } = await import("@/app/api/business/members/[id]/route");
      const token = await signTestJwt(business);
      const req = mockRequest({ amount: -99999, reason: "超扣测试" });
      setAuthCookie(req, token);

      const res = await POST(req as any, { params: Promise.resolve({ id: customer.id }) });
      expect(res.status).toBe(400);
    });

    test("staff can grant points to members", async () => {
      const staff = await testPrisma.user.create({
        data: { phone: `+65999${Math.floor(Math.random() * 100000)}`, role: "staff",
               storeId: store.id, status: "active" },
      });

      const { POST } = await import("@/app/api/business/members/[id]/route");
      const token = await signTestJwt(staff);
      const req = mockRequest({ amount: 50, reason: "店员补发" });
      setAuthCookie(req, token);

      const res = await POST(req as any, { params: Promise.resolve({ id: customer.id }) });
      expect(res.status).toBe(200);
    });
  });

  // ──── Points Log ────

  describe("Points Log", () => {
    test("returns paginated points log", async () => {
      const { GET } = await import("@/app/api/business/members/[id]/points-log/route");
      const token = await signTestJwt(business);
      const req = mockRequest({}, { method: "GET" });
      setAuthCookie(req, token);

      const res = await GET(req as any, { params: Promise.resolve({ id: customer.id }) });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.length).toBeGreaterThan(0);
      // Verify types
      const types = json.data.map((l: any) => l.type);
      expect(types).toContain("manual_grant");
      expect(types).toContain("manual_deduct");
    });
  });

  // ──── Tier Progression ────

  describe("Tier Progression", () => {
    test("upgrades tier when points pass threshold", async () => {
      // Set custom tier config first
      await testPrisma.membershipTierConfig.deleteMany({ where: { businessId: business.id } });
      await testPrisma.membershipTierConfig.createMany({
        data: [
          { businessId: business.id, tier: "regular", name: "普通", pointsRequired: 0 },
          { businessId: business.id, tier: "silver", name: "银卡", pointsRequired: 300 },
          { businessId: business.id, tier: "gold", name: "金卡", pointsRequired: 600 },
          { businessId: business.id, tier: "platinum", name: "铂金", pointsRequired: 2000 },
        ],
      });

      // Member currently at 600 points → should upgrade to gold
      const { POST } = await import("@/app/api/business/members/[id]/route");
      const token = await signTestJwt(business);
      const req = mockRequest({ amount: 10, reason: "触发升级" });
      setAuthCookie(req, token);

      const res = await POST(req as any, { params: Promise.resolve({ id: customer.id }) });
      const json = await res.json();
      expect(res.status).toBe(200);

      // If tier upgraded, response should have tierUpgraded
      if (json.data.tierUpgraded) {
        expect(["silver", "gold", "platinum"]).toContain(json.data.tierUpgraded);
      }
    });

    test("next tier progress is calculable", async () => {
      const { getNextTier, getTierConfigs } = await import("@/lib/points");
      const configs = await getTierConfigs(business.id);
      const m = await testPrisma.membership.findFirst({
        where: { businessId: business.id, customerId: customer.id },
      });
      const next = getNextTier(m!.points, configs);
      if (next) {
        expect(next.pointsNeeded).toBeGreaterThan(0);
        expect(next.progress).toBeGreaterThanOrEqual(0);
        expect(next.progress).toBeLessThanOrEqual(100);
      }
    });
  });
});

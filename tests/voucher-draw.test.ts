/**
 * Integration tests — voucher purchase flow, V2 campaign API, pool status.
 *
 * Pure-function tests for draw-v2.ts live in draw-v2.test.ts.
 * This file covers API integration: routes + database + algorithm wiring.
 */
import { describe, test, expect, beforeAll, afterAll, jest } from "@jest/globals";
import { testPrisma, createTestBusiness, createTestUser, signTestJwt, mockRequest, setAuthCookie } from "./helpers";

// ── Mock @/lib/auth to avoid ESM jose import ──
// The route handlers import getSession from @/lib/auth → jose (ESM).
// We provide a mock getSession that decodes the gwm_token cookie directly,
// and a mock signToken that works without jose.

const MOCK_JWT_SECRET = "test-secret-minimum-32-characters-long!!";

jest.mock("@/lib/auth", () => ({
  signToken: jest.fn(async (payload: any) => {
    // Simple base64 token — no jose dependency
    const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 7 * 86400 })).toString("base64url");
    return `${header}.${body}.mock_sig`;
  }),
  verifyToken: jest.fn(async (token: string) => {
    try {
      const parts = token.split(".");
      return JSON.parse(Buffer.from(parts[1], "base64url").toString());
    } catch {
      return null;
    }
  }),
  getSession: jest.fn(async () => {
    const override = (globalThis as any).__mockGetSessionResult;
    if (override !== undefined) return override;
    return null;
  }),
  setSession: jest.fn(),
  clearSession: jest.fn(),
  hashPassword: jest.fn(async (pw: string) => pw + "-hashed"),
  verifyPassword: jest.fn(async (pw: string, hash: string) => (pw + "-hashed") === hash),
}));

function setMockSession(session: { userId: string; role: string; storeId?: string } | null) {
  (globalThis as any).__mockGetSessionResult = session;
}

// ── DB cleanup helper ──

async function cleanupCampaignData(businessId: string, customerId?: string) {
  await testPrisma.voucherDraw.deleteMany({ where: { voucher: { campaign: { businessId } } } });
  await testPrisma.voucherUsage.deleteMany({ where: { voucher: { campaign: { businessId } } } });
  await testPrisma.voucher.deleteMany({ where: { campaign: { businessId } } });
  await testPrisma.campaign.deleteMany({ where: { businessId } });
  if (customerId) {
    await testPrisma.user.deleteMany({ where: { id: customerId } });
  }
  await testPrisma.tokenAccount.deleteMany({ where: { userId: businessId } });
  await testPrisma.store.deleteMany({ where: { businessId } });
  await testPrisma.user.deleteMany({ where: { id: businessId } });
}

// ══════════════════════════════════════════════════════════════════
// Integration Tests
// ══════════════════════════════════════════════════════════════════

describe("Voucher Purchase Flow (Integration)", () => {
  let business: any;
  let store: any;
  let customer: any;
  let campaignV2: any;

  beforeAll(async () => {
    const b = await createTestBusiness({ businessName: "V2 Test Café" });
    business = b.user;
    store = b.store;
    customer = await createTestUser({ role: "customer", displayName: "V2 Customer" });

    // Create a V2 lucky_draw campaign
    const slug = `v2-integration-${Date.now()}`;
    campaignV2 = await testPrisma.campaign.create({
      data: {
        businessId: business.id,
        name: "V2 Lucky Draw Integration",
        slug,
        type: "lucky_draw_v2",
        status: "active",
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(Date.now() + 86400000 * 30),
        budgetPercent: 20,
        instantPoolRatio: 10,
        midPoolRatio: 60,
        grandPoolRatio: 30,
        voucherTiers: JSON.stringify([
          { min: 10, max: 40, tier: "small", instantPrizeCap: 2 },
          { min: 50, max: 99, tier: "medium", instantPrizeCap: 8 },
          { min: 100, max: 9999, tier: "large", instantPrizeCap: 20 },
        ]),
        entryMethod: "receipt",
        receiptMinSpend: 0,
        entryCount: 0,
        totalTicketCount: 0,
        instantPoolCents: 0,
      },
    });
  });

  afterAll(async () => {
    await cleanupCampaignData(business.id, customer.id);
    await testPrisma.$disconnect();
  });

  // ──── Pool Status API ──────────────────────────────────────────

  describe("GET /api/campaign/pool-status", () => {
    test("returns pool data with countdowns", async () => {
      const { GET } = await import("@/app/api/campaign/pool-status/route");
      const url = `http://localhost/api/campaign/pool-status?slug=${campaignV2.slug}`;
      const req = new Request(url, { method: "GET" });

      const res = await GET(req as any);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(json.data.campaign.slug).toBe(campaignV2.slug);
      expect(json.data.pool).toBeDefined();
      expect(json.data.pool.instantPool).toBeDefined();
      expect(json.data.pool.midPool).toBeDefined();
      expect(json.data.pool.grandPool).toBeDefined();
      expect(json.data.countdown).toBeDefined();
      expect(Array.isArray(json.data.countdown)).toBe(true);
      expect(json.data.countdown.length).toBeGreaterThanOrEqual(1);
      // Verify countdown structure
      const cd = json.data.countdown[0];
      expect(cd.prizeName).toBeDefined();
      expect(cd.targetCents).toBeGreaterThan(0);
      expect(typeof cd.progress).toBe("number");
      expect(typeof cd.daysPredicted).toBe("number");
      expect(typeof cd.velocityPerDay).toBe("number");
      expect(typeof cd.accelerating).toBe("boolean");
    });

    test("pool status returns all three pool ratios from campaign", async () => {
      const { GET } = await import("@/app/api/campaign/pool-status/route");
      const url = `http://localhost/api/campaign/pool-status?slug=${campaignV2.slug}`;
      const req = new Request(url, { method: "GET" });

      const res = await GET(req as any);
      const json = await res.json();

      expect(json.data.pool.instantPool.ratio).toBe(10);
      expect(json.data.pool.midPool.ratio).toBe(60);
      expect(json.data.pool.grandPool.ratio).toBe(30);
    });

    test("pool summary shows draw statistics", async () => {
      const { GET } = await import("@/app/api/campaign/pool-status/route");
      const url = `http://localhost/api/campaign/pool-status?slug=${campaignV2.slug}`;
      const req = new Request(url, { method: "GET" });

      const res = await GET(req as any);
      const json = await res.json();

      expect(json.data.draws).toBeDefined();
      expect(json.data.draws.instant).toBeDefined();
      expect(json.data.draws.mid).toBeDefined();
      expect(json.data.draws.grand).toBeDefined();
      expect(typeof json.data.draws.instant.total).toBe("number");
    });

    test("returns 400 when slug is missing", async () => {
      const { GET } = await import("@/app/api/campaign/pool-status/route");
      const url = "http://localhost/api/campaign/pool-status";
      const req = new Request(url, { method: "GET" });

      const res = await GET(req as any);
      expect(res.status).toBe(400);
    });

    test("returns 404 for unknown campaign slug", async () => {
      const { GET } = await import("@/app/api/campaign/pool-status/route");
      const url = "http://localhost/api/campaign/pool-status?slug=nonexistent-99999";
      const req = new Request(url, { method: "GET" });

      const res = await GET(req as any);
      expect(res.status).toBe(404);
    });
  });

  // ──── Voucher Purchase API ──────────────────────────────────────

  describe("POST /api/voucher/purchase", () => {
    test("creates voucher and awards instant prize", async () => {
      // Set mock session to simulate an authenticated customer
      setMockSession({ userId: customer.id, role: "customer" });

      const { POST } = await import("@/app/api/voucher/purchase/route");
      const url = `http://localhost/api/voucher/purchase?slug=${campaignV2.slug}`;
      const req = mockRequest(
        { amountSgd: 100, spendNowSgd: 50 },
        { url, method: "POST" },
      );

      const res = await POST(req as any);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.voucher).toBeDefined();
      expect(json.data.voucher.id).toBeDefined();
      expect(json.data.voucher.tier).toBe("large");
      expect(json.data.voucher.drawWeight).toBeGreaterThan(0);
      expect(json.data.instantPrize).toBeDefined();
      expect(json.data.instantPrize.name).toBeDefined();
      expect(json.data.instantPrize.valueSgd).toBeDefined();
      expect(json.data.grandPoolEntry).toBe(true);

      // Verify voucher was persisted
      const voucher = await testPrisma.voucher.findUnique({
        where: { id: json.data.voucher.id },
        include: { draws: true },
      });
      expect(voucher).toBeTruthy();
      expect(voucher!.tier).toBe("large");
      expect(voucher!.amountCents).toBe(10000);

      // Verify draw record was created
      expect(voucher!.draws.length).toBeGreaterThanOrEqual(1);
      expect(voucher!.draws[0].drawType).toBe("instant");
      expect(voucher!.draws[0].won).toBe(true);

      // Reset mock session
      setMockSession(null);
    });

    test("small tier voucher excludes grand pool entry", async () => {
      setMockSession({ userId: customer.id, role: "customer" });

      const { POST } = await import("@/app/api/voucher/purchase/route");
      const url = `http://localhost/api/campaign/pool-status?slug=${campaignV2.slug}`;
      const req = mockRequest(
        { amountSgd: 25, spendNowSgd: 0 },
        { url: `http://localhost/api/voucher/purchase?slug=${campaignV2.slug}`, method: "POST" },
      );

      const res = await POST(req as any);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.voucher.tier).toBe("small");
      expect(json.data.grandPoolEntry).toBe(false);

      setMockSession(null);
    });

    test("rejects unauthenticated requests", async () => {
      setMockSession(null); // no session

      const { POST } = await import("@/app/api/voucher/purchase/route");
      const url = `http://localhost/api/voucher/purchase?slug=${campaignV2.slug}`;
      const req = mockRequest(
        { amountSgd: 100, spendNowSgd: 0 },
        { url, method: "POST" },
      );

      const res = await POST(req as any);
      expect(res.status).toBe(401);
    });

    test("rejects invalid voucher amount", async () => {
      setMockSession({ userId: customer.id, role: "customer" });

      const { POST } = await import("@/app/api/voucher/purchase/route");
      const url = `http://localhost/api/voucher/purchase?slug=${campaignV2.slug}`;
      const req = mockRequest(
        { amountSgd: 5, spendNowSgd: 0 }, // below S$10 minimum
        { url, method: "POST" },
      );

      const res = await POST(req as any);
      expect(res.status).toBe(400);

      setMockSession(null);
    });

    test("increments campaign entry count after purchase", async () => {
      setMockSession({ userId: customer.id, role: "customer" });

      const before = await testPrisma.campaign.findUnique({
        where: { id: campaignV2.id },
      });

      const { POST } = await import("@/app/api/voucher/purchase/route");
      const url = `http://localhost/api/voucher/purchase?slug=${campaignV2.slug}`;
      const req = mockRequest(
        { amountSgd: 100, spendNowSgd: 10 },
        { url, method: "POST" },
      );

      const res = await POST(req as any);
      expect(res.status).toBe(200);

      const after = await testPrisma.campaign.findUnique({
        where: { id: campaignV2.id },
      });
      expect(after!.entryCount).toBe((before!.entryCount || 0) + 1);
      expect(after!.totalTicketCount).toBe((before!.totalTicketCount || 0) + 1);

      setMockSession(null);
    });
  });

  // ──── End-to-end: API + algorithm wiring ────────────────────────

  describe("End-to-end: voucher purchase → draw → pool update", () => {
    test("purchase creates draw record linked to voucher", async () => {
      setMockSession({ userId: customer.id, role: "customer" });

      const { POST } = await import("@/app/api/voucher/purchase/route");
      const url = `http://localhost/api/voucher/purchase?slug=${campaignV2.slug}`;
      const req = mockRequest(
        { amountSgd: 80, spendNowSgd: 0 },
        { url, method: "POST" },
      );

      const res = await POST(req as any);
      const json = await res.json();
      expect(res.status).toBe(200);

      // Verify the draw record via database
      const drawRecord = await testPrisma.voucherDraw.findFirst({
        where: { voucherId: json.data.voucher.id },
      });
      expect(drawRecord).toBeTruthy();
      expect(drawRecord!.drawType).toBe("instant");
      expect(drawRecord!.won).toBe(true);
      expect(drawRecord!.prizeName).toBe(json.data.instantPrize.name);

      setMockSession(null);
    });

    test("pool total increases after purchase", async () => {
      const before = await testPrisma.campaign.findUnique({
        where: { id: campaignV2.id },
      });

      setMockSession({ userId: customer.id, role: "customer" });

      const { POST } = await import("@/app/api/voucher/purchase/route");
      const url = `http://localhost/api/voucher/purchase?slug=${campaignV2.slug}`;
      const req = mockRequest(
        { amountSgd: 100, spendNowSgd: 0 },
        { url, method: "POST" },
      );

      const res = await POST(req as any);
      expect(res.status).toBe(200);

      const after = await testPrisma.campaign.findUnique({
        where: { id: campaignV2.id },
      });
      // instantPoolCents should increase by prizePoolContribution
      // prizePoolContribution = 10000 * 20% = 2000 cents
      expect(after!.instantPoolCents).toBeGreaterThan(before!.instantPoolCents);
      expect(after!.instantPoolCents - before!.instantPoolCents).toBeGreaterThanOrEqual(2000);

      setMockSession(null);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// Integration-level pure function tests
// (Unit-level coverage lives in draw-v2.test.ts; these verify
// the functions work correctly with realistic integration values.)
// ══════════════════════════════════════════════════════════════════

describe("V2 Algorithm (integration-level sanity checks)", () => {
  let drawV2: typeof import("@/lib/draw-v2");

  beforeAll(async () => {
    // Can import directly — draw-v2.ts has no ESM deps
    drawV2 = await import("@/lib/draw-v2");
  });

  describe("drawInstantV2", () => {
    test("100% win rate across 100 draws (all tiers)", () => {
      const tiers = drawV2.DEFAULT_VOUCHER_TIERS;
      for (const tier of tiers) {
        let wins = 0;
        for (let i = 0; i < 100; i++) {
          const result = drawV2.drawInstantV2(tier, 50000);
          if (result.won) wins++;
        }
        expect(wins).toBe(100);
        expect(wins).toBe(100); // every single draw must win
      }
    });

    test("instant prize respects tier cap across many draws", () => {
      for (const tier of drawV2.DEFAULT_VOUCHER_TIERS) {
        const maxCents = tier.instantPrizeCap * 100;
        for (let i = 0; i < 50; i++) {
          const { prize } = drawV2.drawInstantV2(tier, 50000);
          expect(prize.valueCents).toBeLessThanOrEqual(maxCents);
        }
      }
    });
  });

  describe("calculateTierWeight", () => {
    test("small tier always returns 0", () => {
      expect(drawV2.calculateTierWeight(2000, "small")).toBe(0);
      expect(drawV2.calculateTierWeight(4000, "small")).toBe(0);
      expect(drawV2.calculateTierWeight(100, "small")).toBe(0);
    });

    test("medium tier returns 1x amountCents", () => {
      expect(drawV2.calculateTierWeight(5000, "medium")).toBe(5000);
      expect(drawV2.calculateTierWeight(7500, "medium")).toBe(7500);
      expect(drawV2.calculateTierWeight(9900, "medium")).toBe(9900);
    });

    test("large tier returns 2x amountCents", () => {
      expect(drawV2.calculateTierWeight(10000, "large")).toBe(20000);
      expect(drawV2.calculateTierWeight(50000, "large")).toBe(100000);
      expect(drawV2.calculateTierWeight(1, "large")).toBe(2);
    });

    test("share boosts do not apply to small tier", () => {
      expect(drawV2.calculateTierWeight(1000, "small", 5)).toBe(0);
      expect(drawV2.calculateTierWeight(1000, "small", 100)).toBe(0);
    });

    test("share boosts stack correctly on medium and large", () => {
      // medium + 1 boost = 2x
      expect(drawV2.calculateTierWeight(5000, "medium", 1)).toBe(10000);
      // large + 3 boosts = 5x (base 2x + 3x)
      expect(drawV2.calculateTierWeight(10000, "large", 3)).toBe(50000);
    });
  });

  describe("estimatePoolCountdown", () => {
    test("freezes on deceleration (never shows increased days)", () => {
      const configs = {
        iPhone: { targetCents: 500000, currentCents: 100000 },
      };

      // Fast velocity → 8 days
      const fast = drawV2.estimatePoolCountdown(configs, 50000);
      expect(fast[0].daysPredicted).toBeLessThanOrEqual(15);
      expect(fast[0].accelerating).toBe(false);

      // Slower velocity with fast estimate as previous → should freeze
      const slow = drawV2.estimatePoolCountdown(
        configs,
        10000,
        { iPhone: fast[0].daysPredicted },
      );
      expect(slow[0].accelerating).toBe(false);
      expect(slow[0].daysPredicted).toBe(fast[0].daysPredicted);
    });

    test("accelerates when velocity increases", () => {
      const configs = {
        iPhone: { targetCents: 500000, currentCents: 100000 },
      };

      // Slow first
      const slow = drawV2.estimatePoolCountdown(configs, 10000);
      const slowDays = slow[0].daysPredicted;

      // Faster with slow as previous
      const fast = drawV2.estimatePoolCountdown(
        configs,
        50000,
        { iPhone: slowDays },
      );
      expect(fast[0].accelerating).toBe(true);
      expect(fast[0].daysPredicted).toBeLessThan(slowDays);
    });

    test("progress reaches 100% when target met", () => {
      const configs = {
        iPhone: { targetCents: 500000, currentCents: 500000 },
      };
      const results = drawV2.estimatePoolCountdown(configs, 10000);
      expect(results[0].progress).toBe(100);
      expect(results[0].daysPredicted).toBe(0);
    });
  });

  describe("resolveTier", () => {
    test("maps amounts to correct tiers", () => {
      expect(drawV2.resolveTier(20)!.tier).toBe("small");
      expect(drawV2.resolveTier(40)!.tier).toBe("small");
      expect(drawV2.resolveTier(50)!.tier).toBe("medium");
      expect(drawV2.resolveTier(99)!.tier).toBe("medium");
      expect(drawV2.resolveTier(100)!.tier).toBe("large");
      expect(drawV2.resolveTier(5000)!.tier).toBe("large");
    });

    test("returns null for amounts below minimum", () => {
      expect(drawV2.resolveTier(9)).toBeNull();
      expect(drawV2.resolveTier(0)).toBeNull();
      expect(drawV2.resolveTier(-5)).toBeNull();
    });
  });
});

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
  // Token income holds reference TokenAccount — delete txs first
  const accounts = await testPrisma.tokenAccount.findMany({
    where: { userId: { in: [businessId, customerId].filter(Boolean) as string[] } },
    select: { id: true },
  });
  if (accounts.length) {
    await testPrisma.tokenTransaction.deleteMany({
      where: { accountId: { in: accounts.map((a) => a.id) } },
    });
  }
  await testPrisma.tokenAccount.deleteMany({
    where: { userId: { in: [businessId, customerId].filter(Boolean) as string[] } },
  });
  if (customerId) {
    await testPrisma.user.deleteMany({ where: { id: customerId } });
  }
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
        instantPoolRatio: 20,
        midPoolRatio: 0,
        grandPoolRatio: 80,
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
      expect(json.data.pool.deferredPool).toBeDefined();
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

    test("pool status returns dual pool ratios (instant + deferred)", async () => {
      const { GET } = await import("@/app/api/campaign/pool-status/route");
      const url = `http://localhost/api/campaign/pool-status?slug=${campaignV2.slug}`;
      const req = new Request(url, { method: "GET" });

      const res = await GET(req as any);
      const json = await res.json();

      expect(json.data.pool.instantPool.ratio).toBe(20);
      expect(json.data.pool.deferredPool.ratio).toBe(80);
      expect(json.data.pool.grandPool.ratio).toBe(80);
      expect(json.data.pool.midPool).toBeUndefined();
    });

    test("pool summary shows draw statistics", async () => {
      const { GET } = await import("@/app/api/campaign/pool-status/route");
      const url = `http://localhost/api/campaign/pool-status?slug=${campaignV2.slug}`;
      const req = new Request(url, { method: "GET" });

      const res = await GET(req as any);
      const json = await res.json();

      expect(json.data.draws).toBeDefined();
      expect(json.data.draws.instant).toBeDefined();
      expect(json.data.draws.deferred).toBeDefined();
      expect(json.data.draws.mid).toBeUndefined();
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
      expect(json.data.voucher.tier).toBe("medium"); // S$100
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
      expect(voucher!.tier).toBe("medium");
      expect(voucher!.amountCents).toBe(10000);

      // Verify draw record was created
      expect(voucher!.draws.length).toBeGreaterThanOrEqual(1);
      expect(voucher!.draws[0].drawType).toBe("instant");
      expect(voucher!.draws[0].won).toBe(true);

      // Reset mock session
      setMockSession(null);
    });

    test("S$50 entry tier also enters grand pool (1× weight)", async () => {
      setMockSession({ userId: customer.id, role: "customer" });

      const { POST } = await import("@/app/api/voucher/purchase/route");
      const req = mockRequest(
        { amountSgd: 50, spendNowSgd: 0 },
        { url: `http://localhost/api/voucher/purchase?slug=${campaignV2.slug}`, method: "POST" },
      );

      const res = await POST(req as any);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.voucher.tier).toBe("small");
      expect(json.data.grandPoolEntry).toBe(true);
      expect(json.data.voucher.drawWeight).toBeGreaterThan(0);

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

    test("rejects if spend exceeds 80% of voucher (min 20% balance)", async () => {
      setMockSession({ userId: customer.id, role: "customer" });

      const { POST } = await import("@/app/api/voucher/purchase/route");
      const url = `http://localhost/api/voucher/purchase?slug=${campaignV2.slug}`;
      const req = mockRequest(
        { amountSgd: 100, spendNowSgd: 90 }, // 90% spend, only 10% balance — should fail
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
        { amountSgd: 100, spendNowSgd: 0 },
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

    test("model A: pure purchase does not grow prize pool; full balance kept", async () => {
      setMockSession({ userId: customer.id, role: "customer" });

      const before = await testPrisma.campaign.findUnique({
        where: { id: campaignV2.id },
      });

      const { POST } = await import("@/app/api/voucher/purchase/route");
      const url = `http://localhost/api/voucher/purchase?slug=${campaignV2.slug}`;
      const req = mockRequest(
        { amountSgd: 100, spendNowSgd: 0 },
        { url, method: "POST" },
      );

      const res = await POST(req as any);
      const json = await res.json();
      expect(res.status).toBe(200);
      // Full face on balance
      expect(json.data.voucher.balanceSgd).toBe("100.00");
      expect(json.data.split.prizePoolCents).toBe(0);

      const after = await testPrisma.campaign.findUnique({
        where: { id: campaignV2.id },
      });
      expect(after!.instantPoolCents).toBe(before!.instantPoolCents);

      const v = await testPrisma.voucher.findUnique({ where: { id: json.data.voucher.id } });
      expect(v!.prizePoolContribution).toBe(0);

      setMockSession(null);
    });

    test("partial redeem: pot 20% splits platform+pool; store 80% T+1; no seller if none", async () => {
      setMockSession({ userId: customer.id, role: "customer" });
      const { POST: purchase } = await import("@/app/api/voucher/purchase/route");
      const buyRes = await purchase(
        mockRequest(
          { amountSgd: 100, spendNowSgd: 0 },
          { url: `http://localhost/api/voucher/purchase?slug=${campaignV2.slug}`, method: "POST" }
        ) as any
      );
      const buyJson = await buyRes.json();
      expect(buyRes.status).toBe(200);
      const voucherId = buyJson.data.voucher.id;
      // No spend → no seller commission yet
      expect(buyJson.data.voucher.sellerCommissionSgd).toBe("0.00");
      expect(buyJson.data.split.sellerCommissionCents).toBe(0);

      const beforeAcct = await testPrisma.tokenAccount.findUnique({
        where: { userId: business.id },
      });
      const frozenBefore = beforeAcct?.frozenBalance ?? 0;
      const beforeCamp = await testPrisma.campaign.findUnique({ where: { id: campaignV2.id } });
      const smallBefore = beforeCamp!.instantPoolCents;
      const grandBefore = beforeCamp!.grandPoolCents ?? 0;

      setMockSession({ userId: business.id, role: "business" });
      const { POST: redeem } = await import("@/app/api/voucher/redeem/route");
      const redeemRes = await redeem(
        mockRequest({ voucherId, amountCents: 1500 }, { method: "POST" }) as any
      );
      const redeemJson = await redeemRes.json();
      expect(redeemRes.status).toBe(200);
      expect(redeemJson.data.usage.storeIncomeSgd).toBe("12.00"); // 80% of 15
      expect(redeemJson.data.usage.feeSgd).toBe("3.00"); // pot 20%
      // pot 300: platform floor(1500*1.5%)=22, pool=278, no seller
      expect(redeemJson.data.usage.prizePoolSgd).toBe("2.78");
      expect(redeemJson.data.usage.platformFeeSgd).toBe("0.22");
      expect(redeemJson.data.usage.sellerCommissionSgd).toBe("0.00");
      expect(redeemJson.data.voucher.remainingBalanceSgd).toBe("85.00");

      const afterAcct = await testPrisma.tokenAccount.findUnique({
        where: { userId: business.id },
      });
      expect(afterAcct!.frozenBalance).toBe(frozenBefore + 1200);

      const afterCamp = await testPrisma.campaign.findUnique({ where: { id: campaignV2.id } });
      // pot pool 278 → small 20% = 55, grand 80% = 223
      expect(afterCamp!.instantPoolCents).toBe(smallBefore + 55);
      expect(afterCamp!.grandPoolCents).toBe(grandBefore + 223);
      const v = await testPrisma.voucher.findUnique({ where: { id: voucherId } });
      expect(v!.prizePoolContribution).toBe(278);

      setMockSession(null);
    });

    test("seller commission only after redeem, taken from pot", async () => {
      setMockSession({ userId: customer.id, role: "customer" });
      const { POST: purchase } = await import("@/app/api/voucher/purchase/route");
      const buyRes = await purchase(
        mockRequest(
          { amountSgd: 100, spendNowSgd: 0, sellerId: business.id },
          { url: `http://localhost/api/voucher/purchase?slug=${campaignV2.slug}`, method: "POST" }
        ) as any
      );
      const buyJson = await buyRes.json();
      expect(buyRes.status).toBe(200);
      expect(buyJson.data.split.sellerCommissionCents).toBe(0);

      const sellerBefore = await testPrisma.tokenAccount.findUnique({
        where: { userId: business.id },
      });
      const frozenSellerBefore = sellerBefore?.frozenBalance ?? 0;

      setMockSession({ userId: business.id, role: "business" });
      const { POST: redeem } = await import("@/app/api/voucher/redeem/route");
      const redeemRes = await redeem(
        mockRequest({ voucherId: buyJson.data.voucher.id, amountCents: 10_000 }, { method: "POST" }) as any
      );
      const redeemJson = await redeemRes.json();
      expect(redeemRes.status).toBe(200);
      // full S$100 redeem: seller 5% = 500, platform 150, pool 1350, store 8000
      expect(redeemJson.data.usage.sellerCommissionSgd).toBe("5.00");
      expect(redeemJson.data.usage.platformFeeSgd).toBe("1.50");
      expect(redeemJson.data.usage.prizePoolSgd).toBe("13.50");
      expect(redeemJson.data.usage.storeIncomeSgd).toBe("80.00");

      const sellerAfter = await testPrisma.tokenAccount.findUnique({
        where: { userId: business.id },
      });
      // store 8000 + seller 500 (same business is seller and redeemer)
      expect(sellerAfter!.frozenBalance).toBe(frozenSellerBefore + 8000 + 500);

      setMockSession(null);
    });

    test("customer withdraw: 5% fee, small pool only, weight 0", async () => {
      setMockSession({ userId: customer.id, role: "customer" });
      const { POST: purchase } = await import("@/app/api/voucher/purchase/route");
      const buyRes = await purchase(
        mockRequest(
          { amountSgd: 100, spendNowSgd: 0 },
          { url: `http://localhost/api/voucher/purchase?slug=${campaignV2.slug}`, method: "POST" }
        ) as any
      );
      const buyJson = await buyRes.json();
      expect(buyRes.status).toBe(200);
      const voucherId = buyJson.data.voucher.id;

      const beforeCamp = await testPrisma.campaign.findUnique({ where: { id: campaignV2.id } });
      const smallBefore = beforeCamp!.instantPoolCents;
      const grandBefore = beforeCamp!.grandPoolCents ?? 0;

      const { POST: withdraw } = await import("@/app/api/voucher/withdraw/route");
      const prize = await testPrisma.voucherDraw.findFirst({
        where: { voucherId, drawType: "instant", won: true },
      });
      const prizeCents = prize?.valueCents || 0;

      const wRes = await withdraw(
        mockRequest({ voucherId }, { method: "POST" }) as any
      );
      const wJson = await wRes.json();
      expect(wRes.status).toBe(200);
      expect(wJson.data.feeSgd).toBe("5.00");
      // net = 95 - clawback of instant prize face
      const expectedNet = Math.max(0, 9500 - prizeCents);
      expect(wJson.data.netSgd).toBe((expectedNet / 100).toFixed(2));
      expect(Number(wJson.data.clawbackSgd)).toBeCloseTo(Math.min(prizeCents, 9500) / 100, 2);
      expect(wJson.data.split.smallPoolSgd).toBe("4.00"); // no seller → 3%+1%
      expect(wJson.data.drawWeight).toBe(0);
      expect(wJson.data.status).toBe("withdrawn");

      const afterCamp = await testPrisma.campaign.findUnique({ where: { id: campaignV2.id } });
      // small pool: fee 400 + clawback prize
      const claw = Math.min(prizeCents, 9500);
      expect(afterCamp!.instantPoolCents).toBe(smallBefore + 400 + claw);
      expect(afterCamp!.grandPoolCents).toBe(grandBefore); // grand untouched
      const v = await testPrisma.voucher.findUnique({ where: { id: voucherId } });
      expect(v!.balanceCents).toBe(0);
      expect(v!.drawWeight).toBe(0);

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
    test("entry small redeemed 1×; holding balance 0.2×", () => {
      expect(drawV2.calculateTierWeight(5000, "small", 0, 0, 5000)).toBe(5000);
      expect(drawV2.calculateTierWeight(5000, "small", 5000, 0, 0)).toBe(1000);
    });

    test("medium redeemed 2×; holding balance 0.2×", () => {
      expect(drawV2.calculateTierWeight(10000, "medium", 0, 0, 10000)).toBe(20000);
      expect(drawV2.calculateTierWeight(10000, "medium", 10000, 0, 0)).toBe(2000);
    });

    test("large redeemed 3×", () => {
      expect(drawV2.calculateTierWeight(20000, "large", 0, 0, 20000)).toBe(60000);
    });

    test("share boosts stack on redeem weight", () => {
      // medium 2× redeem + 1 share face
      expect(drawV2.calculateTierWeight(10000, "medium", 0, 1, 10000)).toBe(30000);
      // large 3× redeem + 3 shares face
      expect(drawV2.calculateTierWeight(20000, "large", 0, 3, 20000)).toBe(60000 + 60000);
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
      expect(drawV2.resolveTier(50)!.tier).toBe("small");
      expect(drawV2.resolveTier(100)!.tier).toBe("medium");
      expect(drawV2.resolveTier(200)!.tier).toBe("large");
    });

    test("returns null for amounts below minimum", () => {
      expect(drawV2.resolveTier(20)).toBeNull();
      expect(drawV2.resolveTier(9)).toBeNull();
      expect(drawV2.resolveTier(0)).toBeNull();
      expect(drawV2.resolveTier(-5)).toBeNull();
    });
  });
});

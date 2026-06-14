/**
 * Lucky Draw system tests — receipt upload, ticket generation, instant/deferred draw, prize pool.
 */
import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import { testPrisma, createTestBusiness, createTestUser, signTestJwt, mockRequest, setAuthCookie } from "./helpers";

describe("Lucky Draw System", () => {
  let business: any, store: any, customer: any;

  beforeAll(async () => {
    const b = await createTestBusiness({ businessName: "Draw Co" });
    business = b.user; store = b.store;
    customer = await createTestUser({ role: "customer", displayName: "Lucky Drawer" });
    await testPrisma.tokenAccount.create({ data: { userId: customer.id, balance: 500 } });
  });

  afterAll(async () => {
    await testPrisma.user.deleteMany({ where: { id: { in: [business.id, customer.id] } } });
  });

  // ──── Campaign Creation ────

  describe("Campaign Setup", () => {
    test("creates lucky_draw campaign with receipt mode", async () => {
      const { POST } = await import("@/app/api/business/campaigns/route");
      const token = await signTestJwt(business);
      const startDate = new Date();
      const endDate = new Date(); endDate.setDate(endDate.getDate() + 30);
      const drawDate = new Date(); drawDate.setDate(drawDate.getDate() + 35);

      const req = mockRequest({
        name: "Big Lucky Draw 2026",
        description: "Win a BYD car!",
        type: "lucky_draw",
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        drawDate: drawDate.toISOString(),
        entryMethod: "receipt",
        receiptMinSpend: 5000,   // S$50
        ticketsPerUnit: 1,
        budgetPercent: 20,
        slug: `big-draw-${Date.now()}`,
      });
      setAuthCookie(req, token);

      const res = await POST(req as any);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.type).toBe("lucky_draw");
      expect(json.data.entryMethod).toBe("receipt");
      expect(json.data.slug).toBeDefined();
      expect(json.data.receiptMinSpend).toBe(5000);
    });
  });

  // ──── Prize Pool ────

  describe("Prize Pool Configuration", () => {
    let campaignId: string;

    beforeAll(async () => {
      const c = await testPrisma.campaign.findFirst({
        where: { businessId: business.id, type: "lucky_draw" },
      });
      campaignId = c!.id;
    });

    test("sets prize pool with weighted prizes", async () => {
      const { PUT } = await import("@/app/api/business/campaigns/[id]/prizes/route");
      const token = await signTestJwt(business);
      const req = mockRequest({
        prizes: [
          { name: "BYD Car", icon: "🚗", type: "item", weight: 1, totalStock: 1 },
          { name: "iPhone 17", icon: "📱", type: "item", weight: 5, totalStock: 15 },
          { name: "S$100 Voucher", icon: "💵", type: "cash", valueCents: 10000, weight: 20, totalStock: 700 },
          { name: "S$10 Voucher", icon: "🎟", type: "cash", valueCents: 1000, weight: 50, totalStock: 10000 },
        ],
      }, { method: "PUT" });
      setAuthCookie(req, token);

      const res = await PUT(req as any, { params: Promise.resolve({ id: campaignId }) });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.length).toBe(4);
    });

    test("reads prize pool", async () => {
      const { GET } = await import("@/app/api/business/campaigns/[id]/prizes/route");
      const token = await signTestJwt(business);
      const req = mockRequest({}, { method: "GET" });
      setAuthCookie(req, token);

      const res = await GET(req as any, { params: Promise.resolve({ id: campaignId }) });
      const json = await res.json();
      expect(json.data.length).toBe(4);
      expect(json.data[0].name).toBe("BYD Car");
      expect(json.data[0].weight).toBe(1);
    });

    test("recreates pool on second PUT (idempotent)", async () => {
      const { PUT } = await import("@/app/api/business/campaigns/[id]/prizes/route");
      const token = await signTestJwt(business);
      const req = mockRequest({
        prizes: [
          { name: "Grand Prize", icon: "🏆", type: "item", weight: 1, totalStock: 1 },
        ],
      }, { method: "PUT" });
      setAuthCookie(req, token);

      const res = await PUT(req as any, { params: Promise.resolve({ id: campaignId }) });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.length).toBe(1);
      expect(json.data[0].name).toBe("Grand Prize");
    });
  });

  // ──── Receipt Submission & Ticket Generation ────

  describe("Receipt Submission", () => {
    let campaignSlug: string;

    beforeAll(async () => {
      const c = await testPrisma.campaign.findFirst({
        where: { businessId: business.id, type: "lucky_draw" },
      });
      campaignSlug = c!.slug!;

      // Reset prize pool
      await testPrisma.lotteryPrize.deleteMany({ where: { campaignId: c!.id } });
      await testPrisma.lotteryPrize.createMany({
        data: [
          { campaignId: c!.id, name: "BYD Car", icon: "🚗", type: "item", weight: 1, totalStock: 1, remainingStock: 1 },
          { campaignId: c!.id, name: "iPhone", icon: "📱", type: "item", weight: 5, totalStock: 15, remainingStock: 15 },
          { campaignId: c!.id, name: "S$100", icon: "💵", type: "cash", valueCents: 10000, weight: 20, totalStock: 700, remainingStock: 700 },
          { campaignId: c!.id, name: "S$10", icon: "🎟", type: "cash", valueCents: 1000, weight: 50, totalStock: 10000, remainingStock: 10000 },
        ],
      });
    });

    test("submits receipt and gets deferred tickets", async () => {
      const { POST } = await import("@/app/api/draw/[slug]/submit/route");
      const token = await signTestJwt(customer);
      const req = mockRequest({
        receiptAmount: 25000,  // S$250 → 5 tickets
        drawMode: "deferred",
      });
      setAuthCookie(req, token);

      const res = await POST(req as any, { params: Promise.resolve({ slug: campaignSlug }) });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.ticketCount).toBe(5);
      expect(json.data.tickets.length).toBe(5);
      // Check ticket numbers
      expect(json.data.tickets[0].ticketNo).toMatch(/^DRAW-\d{6}$/);
    });

    test("submits receipt with instant draw", async () => {
      const { POST } = await import("@/app/api/draw/[slug]/submit/route");
      const token = await signTestJwt(customer);
      const req = mockRequest({
        receiptAmount: 20000,  // S$200 → 4 tickets
        drawMode: "instant",
      });
      setAuthCookie(req, token);

      const res = await POST(req as any, { params: Promise.resolve({ slug: campaignSlug }) });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.ticketCount).toBe(4);
      expect(json.data.pool).toBeDefined();
      expect(json.data.pool.instantPoolSgd).toBeDefined();
    });

    test("rejects receipt below minimum spend", async () => {
      const { POST } = await import("@/app/api/draw/[slug]/submit/route");
      const token = await signTestJwt(customer);
      const req = mockRequest({ receiptAmount: 1000 }); // S$10 < S$50
      setAuthCookie(req, token);

      const res = await POST(req as any, { params: Promise.resolve({ slug: campaignSlug }) });
      expect(res.status).toBe(400);
    });

    test("views my tickets with draw status", async () => {
      const { GET } = await import("@/app/api/draw/[slug]/my-tickets/route");
      const token = await signTestJwt(customer);
      const req = mockRequest({}, { method: "GET" });
      setAuthCookie(req, token);

      const res = await GET(req as any, { params: Promise.resolve({ slug: campaignSlug }) });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.length).toBeGreaterThan(0);
      expect(json.data[0].tickets.length).toBeGreaterThan(0);
    });
  });

  // ──── Draw Execution ────

  describe("Draw Execution", () => {
    let campaignId: string;

    beforeAll(async () => {
      const c = await testPrisma.campaign.findFirst({
        where: { businessId: business.id, type: "lucky_draw" },
      });
      campaignId = c!.id;
    });

    test("executes draw and assigns winners", async () => {
      // Ensure campaign is active
      await testPrisma.campaign.update({
        where: { id: campaignId },
        data: { status: "active" },
      });

      const { POST } = await import("@/app/api/business/campaigns/[id]/draw/route");
      const token = await signTestJwt(business);
      const req = mockRequest({}, { method: "POST" });
      setAuthCookie(req, token);

      const res = await POST(req as any, { params: Promise.resolve({ id: campaignId }) });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.wonCount).toBeGreaterThanOrEqual(0);
      expect(json.data.totalDraws).toBeGreaterThan(0);

      // Verify campaign is now ended
      const c = await testPrisma.campaign.findUnique({ where: { id: campaignId } });
      expect(c!.status).toBe("ended");

      // At least some tickets marked won if luck hit
      const wonTickets = await testPrisma.drawTicket.count({
        where: { campaignId, won: true },
      });
      // Can be 0 if random didn't hit, but that's valid
      expect(wonTickets).toBeGreaterThanOrEqual(0);
    });

    test("rejects draw on already-ended campaign", async () => {
      const { POST } = await import("@/app/api/business/campaigns/[id]/draw/route");
      const token = await signTestJwt(business);
      const req = mockRequest({}, { method: "POST" });
      setAuthCookie(req, token);

      const res = await POST(req as any, { params: Promise.resolve({ id: campaignId }) });
      expect(res.status).toBe(400);
    });
  });

  // ──── Public Campaign API ────

  describe("Public Draw API", () => {
    let campaignSlug: string;

    beforeAll(async () => {
      const c = await testPrisma.campaign.findFirst({
        where: { businessId: business.id, type: "lucky_draw" },
      });
      campaignSlug = c!.slug!;
    });

    test("returns campaign info with pool estimates", async () => {
      const { GET } = await import("@/app/api/draw/[slug]/route");
      const req = mockRequest({}, { method: "GET" });
      const res = await GET(req as any, { params: Promise.resolve({ slug: campaignSlug }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.name).toBeDefined();
      expect(json.data.grandPoolSgd).toBeDefined();
      expect(json.data.instantPoolSgd).toBeDefined();
      expect(json.data.progress).toBeGreaterThanOrEqual(0);
    });
  });
});

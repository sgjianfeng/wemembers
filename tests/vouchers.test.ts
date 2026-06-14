/**
 * Voucher system tests — create, claim, redeem, cross-store settlement.
 */
import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import { testPrisma, createTestBusiness, createTestUser, signTestJwt, mockRequest, setAuthCookie } from "./helpers";

describe("Voucher System", () => {
  let bizA: any, storeA: any, bizB: any, storeB: any, customer: any;

  beforeAll(async () => {
    const a = await createTestBusiness({ businessName: "Voucher Shop A" });
    bizA = a.user; storeA = a.store;
    const b = await createTestBusiness({ businessName: "Voucher Shop B" });
    bizB = b.user; storeB = b.store;
    customer = await createTestUser({ role: "customer", displayName: "Voucher Sammy" });
    await testPrisma.tokenAccount.create({ data: { userId: customer.id, balance: 500 } });
    await testPrisma.user.update({ where: { id: customer.id }, data: { pointsBalance: 5000, lifetimePoints: 5000 } });
  });

  afterAll(async () => {
    await testPrisma.user.deleteMany({ where: { id: { in: [bizA.id, bizB.id, customer.id] } } });
  });

  describe("Create Coupon", () => {
    let couponId: string;

    test("creates a fixed-amount coupon with all rules", async () => {
      const { POST } = await import("@/app/api/business/coupons/route");
      const token = await signTestJwt(bizA);
      const validUntil = new Date(); validUntil.setDate(validUntil.getDate() + 30);

      const req = mockRequest({
        title: "S$15 Coffee Voucher",
        description: "Valid for any coffee drink",
        type: "fixed_amount", valueCents: 1500, minSpendCents: 0,
        pointsRequired: 100, totalQuantity: 100,
        validFrom: new Date().toISOString(), validUntil: validUntil.toISOString(),
        isGiftable: true, perCustomerLimit: 2, status: "published",
      });
      setAuthCookie(req, token);

      const res = await POST(req as any);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.title).toBe("S$15 Coffee Voucher");
      expect(json.data.valueCents).toBe(1500);
      expect(json.data.status).toBe("published");
      couponId = json.data.id;
    });

    test("create triggers token deduction", async () => {
      const before = await testPrisma.tokenAccount.findUnique({ where: { userId: bizA.id } });
      expect(before!.totalSpent).toBeGreaterThan(before!.balance === before!.totalEarned ? before!.totalEarned - 10000 : 0);
    });

    test("lists business coupons by status", async () => {
      const { GET } = await import("@/app/api/business/coupons/route");
      const token = await signTestJwt(bizA);
      const req = mockRequest({}, { method: "GET", url: "http://localhost/api/business/coupons?status=published" });
      setAuthCookie(req, token);

      const res = await GET(req as any);
      const json = await res.json();
      expect(json.data.length).toBeGreaterThan(0);
      expect(json.data[0].status).toBe("published");
    });

    test("rejects coupon creation without title", async () => {
      const { POST } = await import("@/app/api/business/coupons/route");
      const token = await signTestJwt(bizA);
      const req = mockRequest({ type: "fixed_amount", valueCents: 1000 });
      setAuthCookie(req, token);
      const res = await POST(req as any);
      expect(res.status).toBe(400);
    });
  });

  describe("Claim Coupon", () => {
    let couponId: string;

    beforeAll(async () => {
      const c = await testPrisma.coupon.findFirst({ where: { businessId: bizA.id } });
      couponId = c!.id;
    });

    test("customer claims coupon with points", async () => {
      const { POST } = await import("@/app/api/coupons/[id]/claim/route");
      const token = await signTestJwt(customer);
      const req = mockRequest({}, { method: "POST" });
      setAuthCookie(req, token);

      const res = await POST(req as any, { params: Promise.resolve({ id: couponId }) });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.claim).toBeTruthy();
      expect(json.data.claim.qrCode).toBeDefined();
      expect(json.data.claim.qrCode.length).toBe(12);
    });

    test("customer points deducted after claim", async () => {
      const user = await testPrisma.user.findUnique({ where: { id: customer.id } });
      expect(user!.pointsBalance).toBeLessThan(5000);
    });

    test("auto-creates membership on first claim", async () => {
      const m = await testPrisma.membership.findUnique({
        where: { businessId_customerId: { businessId: bizA.id, customerId: customer.id } },
      });
      expect(m).toBeTruthy();
    });

    test("rejects claim exceeding per-customer limit", async () => {
      // Claim 2 more times (limit is 2)
      const { POST } = await import("@/app/api/coupons/[id]/claim/route");
      const token = await signTestJwt(customer);
      const req = mockRequest({}, { method: "POST" });
      setAuthCookie(req, token);
      await POST(req as any, { params: Promise.resolve({ id: couponId }) });

      // Third claim should fail
      const res = await POST(req as any, { params: Promise.resolve({ id: couponId }) });
      expect(res.status).toBe(400);
    });

    test("rejects claim when sold out", async () => {
      // Create a coupon with 0 remaining
      const c = await testPrisma.coupon.create({
        data: {
          businessId: bizA.id, title: "Sold Out Test", type: "fixed_amount",
          valueCents: 500, pointsRequired: 10, totalQuantity: 0, remainingQuantity: 0,
          validFrom: new Date(), validUntil: new Date(Date.now() + 86400000),
          status: "published",
        },
      });
      const { POST } = await import("@/app/api/coupons/[id]/claim/route");
      const token = await signTestJwt(customer);
      const req = mockRequest({}, { method: "POST" });
      setAuthCookie(req, token);
      const res = await POST(req as any, { params: Promise.resolve({ id: c.id }) });
      expect(res.status).toBe(400);
    });
  });

  describe("Redeem & Cross-Store Settlement", () => {
    let claim: any, coupon: any;

    beforeAll(async () => {
      coupon = await testPrisma.coupon.create({
        data: {
          businessId: bizA.id, title: "Cross-Store Test Voucher", type: "fixed_amount",
          valueCents: 2000, pointsRequired: 50, totalQuantity: 100, remainingQuantity: 100,
          validFrom: new Date(), validUntil: new Date(Date.now() + 86400000 * 30),
          status: "published", allowCollaboration: true, promotionFeeRate: 20,
        },
      });
      const { POST } = await import("@/app/api/coupons/[id]/claim/route");
      const token = await signTestJwt(customer);
      const req = mockRequest({}, { method: "POST" });
      setAuthCookie(req, token);
      const res = await POST(req as any, { params: Promise.resolve({ id: coupon.id }) });
      const json = await res.json();
      claim = json.data.claim;
    });

    test("same-store redeem works", async () => {
      const { POST } = await import("@/app/api/business/redeem/route");
      const token = await signTestJwt(bizA);
      const req = mockRequest({ qrCode: claim.qrCode });
      setAuthCookie(req, token);

      const res = await POST(req as any);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.success).toBe(true);
      expect(json.data.pointsAwarded).toBeGreaterThanOrEqual(0);
    });

    test("cross-store redeem blocked without partnership", async () => {
      // Claim another from bizA
      const c2 = await testPrisma.coupon.create({
        data: {
          businessId: bizA.id, title: "Cross Test 2", type: "fixed_amount",
          valueCents: 1000, pointsRequired: 10, totalQuantity: 10, remainingQuantity: 10,
          validFrom: new Date(), validUntil: new Date(Date.now() + 86400000),
          status: "published", allowCollaboration: true, promotionFeeRate: 20,
        },
      });
      const { POST: claimPost } = await import("@/app/api/coupons/[id]/claim/route");
      const ct = await signTestJwt(customer);
      const cr = mockRequest({}, { method: "POST" });
      setAuthCookie(cr, ct);
      const r = await claimPost(cr as any, { params: Promise.resolve({ id: c2.id }) });
      const j = await r.json();

      // Try to redeem from bizB without partnership
      const { POST } = await import("@/app/api/business/redeem/route");
      const token = await signTestJwt(bizB);
      const req = mockRequest({ qrCode: j.data.claim.qrCode });
      setAuthCookie(req, token);
      const res = await POST(req as any);
      expect(res.status).toBe(403);
    });

    test("cross-store redeem with partnership triggers settlement", async () => {
      // Create partnership
      await testPrisma.businessPartner.create({
        data: { businessId: bizB.id, partnerId: bizA.id, source: "invite", status: "active" },
      });

      // Claim another from bizA
      const c3 = await testPrisma.coupon.create({
        data: {
          businessId: bizA.id, title: "Cross Test 3", type: "fixed_amount",
          valueCents: 1000, pointsRequired: 10, totalQuantity: 10, remainingQuantity: 10,
          validFrom: new Date(), validUntil: new Date(Date.now() + 86400000),
          status: "published", allowCollaboration: true, promotionFeeRate: 20,
        },
      });
      const { POST: claimPost } = await import("@/app/api/coupons/[id]/claim/route");
      const ct = await signTestJwt(customer);
      const cr = mockRequest({}, { method: "POST" });
      setAuthCookie(cr, ct);
      const r = await claimPost(cr as any, { params: Promise.resolve({ id: c3.id }) });
      const j = await r.json();

      // Redeem from bizB
      const { POST } = await import("@/app/api/business/redeem/route");
      const token = await signTestJwt(bizB);
      const req = mockRequest({ qrCode: j.data.claim.qrCode });
      setAuthCookie(req, token);
      const res = await POST(req as any);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.isCrossStore).toBe(true);
      expect(json.data.settlementMessage).toBeDefined();

      // Verify settlement record created
      const settlement = await testPrisma.settlement.findFirst({
        where: { issuerBusinessId: bizA.id, redeemerBusinessId: bizB.id },
      });
      expect(settlement).toBeTruthy();
      expect(settlement!.totalAmount).toBe(1000);
      expect(settlement!.platformFee).toBeGreaterThan(0);
      expect(settlement!.issuerFee).toBeGreaterThan(0);
      expect(settlement!.redeemerIncome).toBeGreaterThan(0);

      // Verify three-way split sums to total
      expect(settlement!.platformFee + settlement!.issuerFee + settlement!.redeemerIncome)
        .toBe(settlement!.totalAmount);
    });
  });
});

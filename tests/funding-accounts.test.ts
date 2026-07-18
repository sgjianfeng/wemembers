/**
 * Account funding: top-up credit, business withdraw guards, promoter withdraw,
 * business settings, profile name, store CRUD smoke.
 */
import { describe, test, expect, beforeAll, afterAll, jest } from "@jest/globals";
import { testPrisma, createTestBusiness, createTestUser, mockRequest } from "./helpers";

jest.mock("@/lib/auth", () => ({
  getSession: jest.fn(async () => {
    const override = (globalThis as any).__mockGetSessionResult;
    if (override !== undefined) return override;
    return null;
  }),
  signToken: jest.fn(),
  verifyToken: jest.fn(),
  setSession: jest.fn(),
  clearSession: jest.fn(),
}));

const mockCreateTransfer = jest.fn(async () => ({ id: "tr_test" }));
jest.mock("@/lib/stripe", () => ({
  createTransfer: (...args: unknown[]) => mockCreateTransfer(...args),
  MIN_WITHDRAWAL_CENTS: 1000,
  createCheckoutSession: jest.fn(),
  stripe: {},
}));

function setMockSession(session: { userId: string; role: string; storeId?: string } | null) {
  (globalThis as any).__mockGetSessionResult = session;
}

describe("Funding & accounts", () => {
  let businessId: string;
  let customerId: string;
  let storeId: string;

  beforeAll(async () => {
    const biz = await createTestBusiness({
      email: `fund-biz-${Date.now()}@test.local`,
      businessName: "Fund Biz",
    });
    businessId = biz.user.id;
    storeId = biz.store.id;

    const cust = await createTestUser({
      role: "customer",
      displayName: "Fund Cust",
      email: `fund-cust-${Date.now()}@test.local`,
    });
    customerId = cust.id;

    await testPrisma.promoterAccount.create({
      data: {
        userId: customerId,
        isActive: true,
        availableBalance: 5000, // S$50
        totalEarned: 5000,
      },
    });
  });

  afterAll(async () => {
    await testPrisma.promoterEarning.deleteMany({ where: { promoterId: customerId } });
    await testPrisma.promoterAccount.deleteMany({ where: { userId: customerId } });
    await testPrisma.tokenTransaction.deleteMany({
      where: { account: { userId: { in: [businessId, customerId] } } },
    });
    await testPrisma.stripeAccount.deleteMany({ where: { userId: businessId } });
    await testPrisma.tokenAccount.deleteMany({ where: { userId: { in: [businessId, customerId] } } });
    await testPrisma.store.deleteMany({ where: { businessId } });
    await testPrisma.user.deleteMany({ where: { id: { in: [businessId, customerId] } } });
    setMockSession(null);
  });

  describe("applyStripeTopupCredit", () => {
    test("credits balance and is idempotent by session id", async () => {
      const { applyStripeTopupCredit } = await import("@/lib/funding");
      const sessionId = `cs_test_${Date.now()}`;

      const first = await applyStripeTopupCredit({
        userId: businessId,
        amountCents: 2000,
        stripeSessionId: sessionId,
      });
      expect(first.alreadyApplied).toBe(false);
      expect(first.creditedCents).toBe(2000);

      const mid = await testPrisma.tokenAccount.findUnique({ where: { userId: businessId } });
      const balAfterFirst = mid!.balance;

      const second = await applyStripeTopupCredit({
        userId: businessId,
        amountCents: 2000,
        stripeSessionId: sessionId,
      });
      expect(second.alreadyApplied).toBe(true);
      expect(second.creditedCents).toBe(0);

      const end = await testPrisma.tokenAccount.findUnique({ where: { userId: businessId } });
      expect(end!.balance).toBe(balAfterFirst);

      const txs = await testPrisma.tokenTransaction.findMany({
        where: { type: "stripe_topup", referenceId: sessionId },
      });
      expect(txs).toHaveLength(1);
    });
  });

  describe("business withdraw", () => {
    test("precheck: min amount, no stripe, insufficient", async () => {
      const { precheckBusinessWithdraw } = await import("@/lib/funding");

      const min = await precheckBusinessWithdraw({
        userId: businessId,
        role: "business",
        amountCents: 500,
      });
      expect(min.ok).toBe(false);
      if (!min.ok) expect(min.code).toBe("min_amount");

      const noStripe = await precheckBusinessWithdraw({
        userId: businessId,
        role: "business",
        amountCents: 1000,
      });
      expect(noStripe.ok).toBe(false);
      if (!noStripe.ok) expect(noStripe.code).toBe("stripe_not_ready");

      await testPrisma.stripeAccount.create({
        data: {
          userId: businessId,
          stripeAccountId: `acct_test_${Date.now()}`,
          chargesEnabled: true,
          payoutsEnabled: true,
          detailsSubmitted: true,
        },
      });

      // force low balance
      await testPrisma.tokenAccount.update({
        where: { userId: businessId },
        data: { balance: 500, frozenBalance: 0 },
      });
      const low = await precheckBusinessWithdraw({
        userId: businessId,
        role: "business",
        amountCents: 1000,
      });
      expect(low.ok).toBe(false);
      if (!low.ok) expect(low.code).toBe("insufficient");
    });

    test("POST /api/stripe/withdraw succeeds with mock transfer", async () => {
      mockCreateTransfer.mockClear();
      await testPrisma.tokenAccount.update({
        where: { userId: businessId },
        data: { balance: 5000, frozenBalance: 0 },
      });
      setMockSession({ userId: businessId, role: "business" });

      const { POST } = await import("@/app/api/stripe/withdraw/route");
      const res = await POST(
        mockRequest({ amountCents: 1000 }) as any
      );
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.success).toBe(true);
      expect(json.data.amount).toBe(10);
      expect(mockCreateTransfer).toHaveBeenCalled();

      const acct = await testPrisma.tokenAccount.findUnique({ where: { userId: businessId } });
      expect(acct!.balance).toBe(4000);
      const wtx = await testPrisma.tokenTransaction.findFirst({
        where: { accountId: acct!.id, type: "withdrawal" },
        orderBy: { createdAt: "desc" },
      });
      expect(wtx?.amount).toBe(-1000);
    });
  });

  describe("promoter withdraw", () => {
    test("applyPromoterWithdraw deducts available balance", async () => {
      const { applyPromoterWithdraw } = await import("@/lib/funding");
      const r = await applyPromoterWithdraw({
        userId: customerId,
        amountSgd: 10,
        method: "paynow",
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.newBalanceCents).toBe(4000);
        expect(r.method).toBe("paynow");
      }
      const pa = await testPrisma.promoterAccount.findUnique({ where: { userId: customerId } });
      expect(pa!.availableBalance).toBe(4000);
    });

    test("POST /api/promoter/withdraw rejects below min", async () => {
      setMockSession({ userId: customerId, role: "customer" });
      const { POST } = await import("@/app/api/promoter/withdraw/route");
      const res = await POST(mockRequest({ amount: 5, method: "paynow" }) as any);
      expect(res.status).toBe(400);
    });
  });

  describe("business settings", () => {
    test("PATCH updates company fields", async () => {
      setMockSession({ userId: businessId, role: "business" });
      const { PATCH } = await import("@/app/api/business/settings/route");
      const res = await PATCH(
        mockRequest({
          businessName: "Fund Biz Updated",
          businessCategory: "cafe",
          displayName: "Owner",
          phone: "+6591111111",
        }) as any
      );
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.businessName).toBe("Fund Biz Updated");
      expect(json.data.phone).toBe("+6591111111");

      const u = await testPrisma.user.findUnique({ where: { id: businessId } });
      expect(u!.businessName).toBe("Fund Biz Updated");
    });
  });

  describe("customer profile", () => {
    test("PATCH display name", async () => {
      setMockSession({ userId: customerId, role: "customer" });
      const { PATCH } = await import("@/app/api/profile/route");
      const res = await PATCH(mockRequest({ displayName: "New Nick" }) as any);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.displayName).toBe("New Nick");
    });
  });

  describe("store account (门店)", () => {
    test("POST create + PUT update store under business", async () => {
      setMockSession({ userId: businessId, role: "business" });
      const { POST } = await import("@/app/api/business/stores/route");
      const createRes = await POST(
        mockRequest({ name: "Branch A", address: "Orchard", phone: "+6590000001" }) as any
      );
      const created = await createRes.json();
      expect(createRes.status).toBe(200);
      expect(created.data.name).toBe("Branch A");

      const { PUT } = await import("@/app/api/business/stores/[id]/route");
      const putRes = await PUT(mockRequest({ name: "Branch A2" }) as any, {
        params: Promise.resolve({ id: created.data.id }),
      });
      const updated = await putRes.json();
      expect(putRes.status).toBe(200);
      expect(updated.data.name).toBe("Branch A2");

      // cleanup extra store
      await testPrisma.store.delete({ where: { id: created.data.id } }).catch(() => null);
    });

    test("staff cannot update company settings", async () => {
      const staff = await createTestUser({
        role: "staff",
        storeId,
        displayName: "Staff",
      });
      setMockSession({ userId: staff.id, role: "staff", storeId });
      const { PATCH } = await import("@/app/api/business/settings/route");
      const res = await PATCH(mockRequest({ businessName: "Hack" }) as any);
      expect(res.status).toBe(403);
      await testPrisma.user.delete({ where: { id: staff.id } });
    });
  });
});

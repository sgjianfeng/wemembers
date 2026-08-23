/**
 * 满减券门槛校验。
 *
 * 修复前：minSpendCents 只在核销查询接口里返回给店员看一眼，POST 从不校验。
 * 一张「满 S$100 减 S$15」的券买 S$20 的东西也能核销掉 —— 满减券实际上
 * 只是一张写了提示文字的代金券。储值券那条路早就用 billCents 校验了，
 * 这里对齐到同一套约定。
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

describe("满减券门槛", () => {
  let biz: { id: string; role: string };
  let store: { id: string };
  let customer: { id: string; role: string };

  async function makeClaim(minSpendCents: number) {
    const coupon = await testPrisma.coupon.create({
      data: {
        businessId: biz.id,
        title: `满${minSpendCents / 100}减15`,
        type: "fixed_amount",
        valueCents: 1_500,
        minSpendCents,
        pointsRequired: 0,
        perCustomerLimit: 99,
        validFrom: new Date(Date.now() - 86400_000),
        validUntil: new Date(Date.now() + 86400_000 * 30),
        status: "published",
      },
    });
    return testPrisma.customerCoupon.create({
      data: {
        customerId: customer.id,
        couponId: coupon.id,
        status: "available",
        qrCode: `MS${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
        pointsSpent: 0,
      },
    });
  }

  async function redeem(qrCode: string, body: Record<string, unknown> = {}) {
    const { POST } = await import("@/app/api/business/redeem/route");
    const token = await signTestJwt(biz);
    const req = mockRequest({ qrCode, storeId: store.id, ...body });
    setAuthCookie(req, token);
    const res = await POST(req as any);
    return { status: res.status, json: await res.json() };
  }

  beforeAll(async () => {
    const b = await createTestBusiness({ businessName: "MinSpend Inc" });
    biz = b.user;
    store = b.store;
    customer = await createTestUser({ role: "customer", displayName: "Bill Payer" });
  });

  afterAll(async () => {
    await deleteUsersSafe([biz.id, customer.id]);
  });

  test("无门槛的券照旧免填账单", async () => {
    const claim = await makeClaim(0);
    const r = await redeem(claim.qrCode);
    expect(r.status).toBe(200);
  });

  test("有门槛但没带账单金额 → 拒绝并要求填写", async () => {
    const claim = await makeClaim(10_000);
    const r = await redeem(claim.qrCode);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("BILL_REQUIRED");
    expect(r.json.minSpendCents).toBe(10_000);

    // 券没被核销掉
    const after = await testPrisma.customerCoupon.findUnique({ where: { id: claim.id } });
    expect(after!.status).toBe("available");
  });

  test("账单未达门槛 → 拒绝", async () => {
    const claim = await makeClaim(10_000);
    const r = await redeem(claim.qrCode, { billCents: 2_000 });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("MIN_SPEND");
    expect(r.json.billCents).toBe(2_000);

    const after = await testPrisma.customerCoupon.findUnique({ where: { id: claim.id } });
    expect(after!.status).toBe("available");
  });

  test("账单刚好达标 → 放行", async () => {
    const claim = await makeClaim(10_000);
    const r = await redeem(claim.qrCode, { billCents: 10_000 });
    expect(r.status).toBe(200);

    const after = await testPrisma.customerCoupon.findUnique({ where: { id: claim.id } });
    expect(after!.status).toBe("used");
  });

  test("orderCents 是 billCents 的别名（与储值券路径一致）", async () => {
    const claim = await makeClaim(10_000);
    const r = await redeem(claim.qrCode, { orderCents: 15_000 });
    expect(r.status).toBe(200);
  });

  test("查询接口告诉收银台要先问账单", async () => {
    const claim = await makeClaim(10_000);
    const { GET } = await import("@/app/api/business/redeem/route");
    const token = await signTestJwt(biz);
    const req = mockRequest(
      {},
      { url: `http://localhost/api/business/redeem?qrCode=${claim.qrCode}&storeId=${store.id}` }
    );
    setAuthCookie(req, token);
    const res = await GET(req as any);
    const json = await res.json();
    expect(json.data.requiresBill).toBe(true);
    expect(json.data.minSpendCents).toBe(10_000);
  });
});

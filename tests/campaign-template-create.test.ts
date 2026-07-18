/**
 * Merchant template create: discount % + face tiers; draw grand prize overrides.
 * Hits POST /api/business/campaigns with mocked session (no browser).
 */
import { describe, test, expect, beforeAll, afterAll, jest } from "@jest/globals";
import { testPrisma, createTestBusiness, mockRequest } from "./helpers";

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

function setMockSession(session: { userId: string; role: string } | null) {
  (globalThis as any).__mockGetSessionResult = session;
}

describe("POST /api/business/campaigns template create", () => {
  let businessId: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const biz = await createTestBusiness({
      email: `tpl-create-${Date.now()}@test.local`,
      businessName: "Tpl Create Biz",
    });
    businessId = biz.user.id;
    setMockSession({ userId: businessId, role: "business" });
  });

  afterAll(async () => {
    if (createdIds.length) {
      await testPrisma.campaign.deleteMany({ where: { id: { in: createdIds } } });
    }
    await testPrisma.store.deleteMany({ where: { businessId } });
    await testPrisma.tokenAccount.deleteMany({ where: { userId: businessId } });
    await testPrisma.user.deleteMany({ where: { id: businessId } });
    setMockSession(null);
  });

  function dates() {
    const start = new Date();
    start.setDate(start.getDate() - 1);
    const end = new Date();
    end.setDate(end.getDate() + 30);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }

  test("voucher_discount: custom 12% + only S$50 and S$200 faces", async () => {
    const { POST } = await import("@/app/api/business/campaigns/route");
    const res = await POST(
      mockRequest({
        templateId: "voucher_discount",
        name: "API 折扣 12% 50+200",
        ...dates(),
        discountPercent: 12,
        enabledTiers: [50, 200, 999], // 999 filtered out
      }) as any
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    createdIds.push(json.data.id);

    expect(json.data.templateId).toBe("voucher_discount");
    expect(json.data.type).toBe("voucher_sale");
    expect(json.data.slug).toBeTruthy();

    const snap = JSON.parse(json.data.rulesSnapshot);
    expect(snap.discountPercent).toBe(12);
    expect(snap.enabledTiers).toEqual([50, 200]);
    expect(snap.allowDiscount).toBe(true);
    expect(snap.prizePoolPercent).toBe(0);

    const tiers = JSON.parse(json.data.voucherTiers || "[]");
    expect(tiers.map((t: { min: number }) => t.min).sort((a: number, b: number) => a - b)).toEqual([
      50, 200,
    ]);
  });

  test("voucher_discount: clamp discount below min to 8%", async () => {
    const { POST } = await import("@/app/api/business/campaigns/route");
    const res = await POST(
      mockRequest({
        templateId: "voucher_discount",
        name: "API 折扣 clamp",
        ...dates(),
        discountPercent: 3,
        enabledTiers: [100],
      }) as any
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    createdIds.push(json.data.id);
    const snap = JSON.parse(json.data.rulesSnapshot);
    expect(snap.discountPercent).toBe(8);
    expect(snap.enabledTiers).toEqual([100]);
  });

  test("draw_standard: custom grand prize names + targets", async () => {
    const { POST } = await import("@/app/api/business/campaigns/route");
    const res = await POST(
      mockRequest({
        templateId: "draw_standard",
        name: "API 抽奖 自定义大奖",
        ...dates(),
        enabledTiers: [50, 100, 200],
        grandPrizes: [
          { id: "ipad", name: "本店下午茶", icon: "☕", targetCents: 150_000 },
          { id: "iphone", name: "店庆礼盒", icon: "🎁", targetCents: 400_000 },
          { id: "byd", name: "年度大奖基金", icon: "🏆", targetCents: 1_000_000 },
        ],
      }) as any
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    createdIds.push(json.data.id);

    expect(json.data.templateId).toBe("draw_standard");
    expect(json.data.type).toBe("lucky_draw_v2");
    expect(json.data.slug).toBeTruthy();

    const snap = JSON.parse(json.data.rulesSnapshot);
    expect(snap.discountPercent).toBe(0);
    expect(snap.kind).toBe("draw");
    expect(snap.enabledTiers).toEqual([50, 100, 200]);
    expect(snap.grandPrizes).toHaveLength(3);
    expect(snap.grandPrizes[0].name).toBe("本店下午茶");
    expect(snap.grandPrizes[0].targetCents).toBe(150_000);
    expect(snap.grandPrizes[1].name).toBe("店庆礼盒");
    expect(snap.grandPrizes[2].name).toBe("年度大奖基金");
    expect(snap.grandPrizes[2].targetCents).toBe(1_000_000);
    // algorithm fixed
    expect(snap.instantPoolRatio).toBe(20);
    expect(snap.grandPoolRatio).toBe(80);
  });

  test("draw_standard: grand prize target floor clamp", async () => {
    const { POST } = await import("@/app/api/business/campaigns/route");
    const res = await POST(
      mockRequest({
        templateId: "draw_standard",
        name: "API 抽奖 clamp target",
        ...dates(),
        grandPrizes: [{ id: "ipad", name: "小目标", icon: "🎁", targetCents: 50 }],
      }) as any
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    createdIds.push(json.data.id);
    const snap = JSON.parse(json.data.rulesSnapshot);
    const ipad = snap.grandPrizes.find((p: { id: string }) => p.id === "ipad");
    expect(ipad.targetCents).toBeGreaterThanOrEqual(10_000);
  });
});

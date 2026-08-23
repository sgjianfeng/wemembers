/**
 * 满赠：权重、到期、发放规则
 */
import {
  buildReceiptFingerprint,
  buildSpendGetRulesSnapshot,
  buildSpendGetTermsDatesView,
  defaultSpendGetActivityStart,
  defaultSpendGetActivityEnd,
  SPEND_GET_DEFAULT_DAYS,
  expiresAtFromIssued,
  giftGrandDrawWeight,
  spendGetPosterTermsLine,
  paidHundredDrawWeight,
  paidVsGiftWeightMultiple,
  DEFAULT_SPEND_GET_RULES,
  SPEND_GET_GIFT_WEIGHT_FACTOR,
  SPEND_GET_MIN_SPEND_CENTS,
  SPEND_GET_GIFT_CENTS,
  parseSpendGetMetaFromCampaign,
} from "@/lib/spend-get-issue";
import { parseSpendGetRules } from "@/lib/spend-and-get";

describe("ndp-promo weights", () => {
  it("gift weight is 0.2 of S$100 paid hold weight", () => {
    const paid = paidHundredDrawWeight();
    const gift = giftGrandDrawWeight();
    expect(paid).toBeGreaterThan(0);
    // S$100 balance * W_BALANCE 0.2 = 2000
    expect(paid).toBe(2000);
    expect(gift).toBe(Math.round(paid * SPEND_GET_GIFT_WEIGHT_FACTOR));
    expect(gift).toBe(400);
  });

  it("paid is 5× gift (exactly with factor 0.2)", () => {
    const m = paidVsGiftWeightMultiple();
    expect(m).toBeCloseTo(5, 5);
  });

  it("expiresAt is issuedAt + validDays", () => {
    const issued = new Date("2026-08-09T10:00:00.000Z");
    const exp = expiresAtFromIssued(issued, 30);
    expect(exp.toISOString()).toBe("2026-09-08T10:00:00.000Z");
  });

  it("default rules match product", () => {
    expect(DEFAULT_SPEND_GET_RULES.minSpendCents).toBe(SPEND_GET_MIN_SPEND_CENTS);
    expect(DEFAULT_SPEND_GET_RULES.giftCouponCents).toBe(SPEND_GET_GIFT_CENTS);
    expect(DEFAULT_SPEND_GET_RULES.validDays).toBe(30);
    expect(DEFAULT_SPEND_GET_RULES.giftWeightFactor).toBe(0.2);
  });

  it("parses ndp block from rulesSnapshot", () => {
    const rules = parseSpendGetRules(
      JSON.stringify({
        ndp: { minSpendCents: 15000, giftCouponCents: 6100, validDays: 14 },
      })
    );
    expect(rules.minSpendCents).toBe(15000);
    expect(rules.validDays).toBe(14);
  });

  it("receipt fingerprint changes with note", () => {
    const a = buildReceiptFingerprint({
      campaignId: "c1",
      storeId: "s1",
      phone: "91234567",
      receiptAmountCents: 12000,
      receiptNote: "1111",
      dayKey: "2026-08-09",
    });
    const b = buildReceiptFingerprint({
      campaignId: "c1",
      storeId: "s1",
      phone: "91234567",
      receiptAmountCents: 12000,
      receiptNote: "2222",
      dayKey: "2026-08-09",
    });
    expect(a).not.toBe(b);
  });

  it("buildSpendGetRulesSnapshot enables ndp and parses meta", () => {
    const snap = buildSpendGetRulesSnapshot({ buyVoucherSlug: "meow-draw" });
    const meta = parseSpendGetMetaFromCampaign({
      rulesSnapshot: snap,
      type: "holiday",
      name: "满赠",
      tags: "[]",
    });
    expect(meta.enabled).toBe(true);
    expect(meta.buyVoucherSlug).toBe("meow-draw");
    expect(meta.minSpendCents).toBe(12000);
  });

  it("默认窗口是「从今天起 365 天」，不再绑国庆档期", () => {
    const from = new Date("2026-08-01T00:00:00.000Z");
    const start = defaultSpendGetActivityStart(from);
    const end = defaultSpendGetActivityEnd(from);
    expect(start.toISOString()).toBe("2026-08-01T00:00:00.000Z");

    // 终点 = 起点 + N 天，当地 23:59:59（= 15:59:59.999Z）
    const days = Math.floor((end.getTime() - start.getTime()) / 86400_000);
    expect(days).toBe(SPEND_GET_DEFAULT_DAYS);
    expect(end.toISOString()).toBe("2027-08-01T15:59:59.999Z");

    // 起点变了终点跟着走 —— 不再吸附到 8/31
    const later = defaultSpendGetActivityEnd(new Date("2026-09-01T00:00:00.000Z"));
    expect(later.toISOString().slice(0, 10)).toBe("2027-09-01");
  });

  it("terms cover 30 days, no stacking, 1/table, merchant rights", () => {
    const view = buildSpendGetTermsDatesView(
      {
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: defaultSpendGetActivityEnd(new Date("2026-08-01T00:00:00.000Z")),
      },
      DEFAULT_SPEND_GET_RULES
    );
    const all = [...view.activityTermsZh, ...view.entitlementTermsZh].join(" ");
    expect(all).toMatch(/30\s*天/);
    expect(all).toMatch(/不可与其他优惠|不可叠/);
    expect(all).toMatch(/一桌一券/);
    expect(all).toMatch(/4\s*人/);
    expect(all).toMatch(/保留|有权|解释权/);
    expect(spendGetPosterTermsLine("zh")).toMatch(/领后30天|一桌一券|有权调整/);
  });
});

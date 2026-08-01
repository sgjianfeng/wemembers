/**
 * 国庆满赠：权重、到期、发放规则
 */
import {
  buildReceiptFingerprint,
  buildNdpRulesSnapshot,
  buildNdpTermsDatesView,
  defaultNdpActivityEnd,
  expiresAtFromIssued,
  giftGrandDrawWeight,
  ndpPosterTermsLine,
  paidHundredDrawWeight,
  paidVsGiftWeightMultiple,
  DEFAULT_NDP_RULES,
  NDP_GIFT_WEIGHT_FACTOR,
  NDP_MIN_SPEND_CENTS,
  NDP_GIFT_COUPON_CENTS,
  parseNdpRulesFromSnapshot,
  parseNdpMetaFromCampaign,
} from "@/lib/ndp-promo";

describe("ndp-promo weights", () => {
  it("gift weight is 0.2 of S$100 paid hold weight", () => {
    const paid = paidHundredDrawWeight();
    const gift = giftGrandDrawWeight();
    expect(paid).toBeGreaterThan(0);
    // S$100 balance * W_BALANCE 0.2 = 2000
    expect(paid).toBe(2000);
    expect(gift).toBe(Math.round(paid * NDP_GIFT_WEIGHT_FACTOR));
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
    expect(DEFAULT_NDP_RULES.minSpendCents).toBe(NDP_MIN_SPEND_CENTS);
    expect(DEFAULT_NDP_RULES.giftCouponCents).toBe(NDP_GIFT_COUPON_CENTS);
    expect(DEFAULT_NDP_RULES.validDays).toBe(30);
    expect(DEFAULT_NDP_RULES.giftWeightFactor).toBe(0.2);
  });

  it("parses ndp block from rulesSnapshot", () => {
    const rules = parseNdpRulesFromSnapshot(
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

  it("buildNdpRulesSnapshot enables ndp and parses meta", () => {
    const snap = buildNdpRulesSnapshot({ buyVoucherSlug: "meow-draw" });
    const meta = parseNdpMetaFromCampaign({
      rulesSnapshot: snap,
      type: "holiday",
      name: "国庆",
      tags: "[]",
    });
    expect(meta.enabled).toBe(true);
    expect(meta.buyVoucherSlug).toBe("meow-draw");
    expect(meta.minSpendCents).toBe(12000);
  });

  it("default activity end is 31 Aug SGT of current NDP year", () => {
    const end = defaultNdpActivityEnd(new Date("2026-08-01T00:00:00.000Z"));
    expect(end.toISOString()).toBe("2026-08-31T15:59:59.999Z");
    // after Aug 31 → next year
    const next = defaultNdpActivityEnd(new Date("2026-09-01T00:00:00.000Z"));
    expect(next.toISOString()).toBe("2027-08-31T15:59:59.999Z");
  });

  it("terms cover 30 days, no stacking, 1/table, merchant rights", () => {
    const view = buildNdpTermsDatesView(
      {
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: defaultNdpActivityEnd(new Date("2026-08-01T00:00:00.000Z")),
      },
      DEFAULT_NDP_RULES
    );
    const all = [...view.activityTermsZh, ...view.entitlementTermsZh].join(" ");
    expect(all).toMatch(/30\s*天/);
    expect(all).toMatch(/不可与其他优惠|不可叠/);
    expect(all).toMatch(/一桌一券/);
    expect(all).toMatch(/4\s*人/);
    expect(all).toMatch(/保留|有权|解释权/);
    expect(ndpPosterTermsLine("zh")).toMatch(/领后30天|一桌一券|有权调整/);
  });
});

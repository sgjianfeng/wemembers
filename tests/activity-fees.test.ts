import {
  splitCowinRedeemFees,
  splitExclusiveSaleFees,
  exclusiveRefundMaxCents,
  DEFAULT_BUSINESS_GIFT_CENTS,
  getExclusiveFeePercents,
} from "@/lib/activity-fees";

describe("activity fees (定稿)", () => {
  it("exclusive 15% = 3+2+10, no seller", () => {
    const s = splitExclusiveSaleFees(10000); // S$100
    expect(s.smallPrizeCents).toBe(300);
    expect(s.platformFeeCents).toBe(200);
    expect(s.sellerCommissionCents).toBe(0);
    expect(s.grandPoolCents).toBe(1000);
    expect(s.totalCents).toBe(1500);
    expect(s.plan).toBe("exclusive_15");
  });

  it("exclusive 10% = 3+2+5, no seller", () => {
    const s = splitExclusiveSaleFees(10000, "exclusive_10");
    expect(s.smallPrizeCents).toBe(300);
    expect(s.platformFeeCents).toBe(200);
    expect(s.sellerCommissionCents).toBe(0);
    expect(s.grandPoolCents).toBe(500);
    expect(s.totalCents).toBe(1000);
    expect(s.plan).toBe("exclusive_10");
  });

  it("exclusive fee percents helpers", () => {
    expect(getExclusiveFeePercents("exclusive_15").totalPercent).toBe(15);
    expect(getExclusiveFeePercents("exclusive_10").grandPoolPercent).toBe(5);
  });

  it("cowin 20% = 3+2+5+10", () => {
    const s = splitCowinRedeemFees(10000);
    expect(s.smallPrizeCents).toBe(300);
    expect(s.platformFeeCents).toBe(200);
    expect(s.sellerCommissionCents).toBe(500);
    expect(s.grandPoolCents).toBe(1000);
    expect(s.totalCents).toBe(2000);
  });

  it("exclusive refund max 10% of face", () => {
    expect(exclusiveRefundMaxCents(10000)).toBe(1000);
    expect(exclusiveRefundMaxCents(5000)).toBe(500);
  });

  it("default gift S$300", () => {
    expect(DEFAULT_BUSINESS_GIFT_CENTS).toBe(30000);
  });
});

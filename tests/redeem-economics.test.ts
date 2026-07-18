import { describe, test, expect } from "@jest/globals";
import { splitRedeemAmount } from "@/lib/redeem-economics";

describe("splitRedeemAmount (model A pot)", () => {
  test("draw · no seller: pot 20% → platform 1.5% + rest pool; store 80%", () => {
    const s = splitRedeemAmount({
      amountCents: 10_000,
      budgetPercent: 20,
      sellerCommissionPercent: 5,
      platformFeePercent: 1.5,
      hasSeller: false,
      mode: "draw",
    });
    expect(s.storeIncomeCents).toBe(8000);
    expect(s.potCents).toBe(2000);
    expect(s.sellerCommissionCents).toBe(0);
    expect(s.platformFeeCents).toBe(150);
    expect(s.prizePoolCents).toBe(1850);
  });

  test("draw · with seller: 5% + 1.5% from pot, rest pool", () => {
    const s = splitRedeemAmount({
      amountCents: 10_000,
      hasSeller: true,
      budgetPercent: 20,
      sellerCommissionPercent: 5,
      platformFeePercent: 1.5,
      mode: "draw",
    });
    expect(s.sellerCommissionCents).toBe(500);
    expect(s.platformFeeCents).toBe(150);
    expect(s.prizePoolCents).toBe(1350);
    expect(s.storeIncomeCents).toBe(8000);
  });

  test("voucher promo: leftover pot returns to store, no prize pool", () => {
    const s = splitRedeemAmount({
      amountCents: 10_000,
      hasSeller: true,
      budgetPercent: 20,
      sellerCommissionPercent: 5,
      platformFeePercent: 1.5,
      mode: "voucher",
    });
    expect(s.sellerCommissionCents).toBe(500);
    expect(s.platformFeeCents).toBe(150);
    expect(s.prizePoolCents).toBe(0);
    // store 80 + leftover 13.5 = 93.5
    expect(s.storeIncomeCents).toBe(9350);
    expect(s.storeIncomeCents + s.sellerCommissionCents + s.platformFeeCents).toBe(10_000);
  });

  test("zero amount → zero everything", () => {
    const s = splitRedeemAmount({ amountCents: 0, hasSeller: true, mode: "draw" });
    expect(s.potCents).toBe(0);
    expect(s.prizePoolCents).toBe(0);
  });
});


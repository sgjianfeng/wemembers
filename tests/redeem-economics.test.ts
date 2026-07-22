import { describe, test, expect } from "@jest/globals";
import {
  splitRedeemAmount,
  splitVoucherRedeem,
  resolveSellerRewardRecipient,
} from "@/lib/redeem-economics";

describe("splitRedeemAmount (draw · model A pot)", () => {
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

  test("zero amount → zero everything", () => {
    const s = splitRedeemAmount({ amountCents: 0, hasSeller: true, mode: "draw" });
    expect(s.potCents).toBe(0);
    expect(s.prizePoolCents).toBe(0);
  });
});

describe("voucher · pay P get F (cash equivalent)", () => {
  test("pay 90 get 100 · redeem full face → fees on 90", () => {
    const s = splitVoucherRedeem({
      amountCents: 10_000, // R = 100
      faceCents: 10_000,
      paidCents: 9_000,
      sellerCommissionPercent: 5,
      platformFeePercent: 1.5,
      hasSeller: true,
      mode: "voucher",
    });
    expect(s.cashCents).toBe(9_000);
    expect(s.platformFeeCents).toBe(135); // floor(90*1.5%)
    expect(s.sellerCommissionCents).toBe(450); // floor(90*5%)
    expect(s.storeIncomeCents).toBe(9_000 - 135 - 450); // 8415
    expect(s.prizePoolCents).toBe(0);
    // 本店: store + seller = 9000 - 135
    expect(s.storeIncomeCents + s.sellerCommissionCents).toBe(9_000 - 135);
  });

  test("partial redeem 50 of face 100 paid 90 → C=45", () => {
    const s = splitVoucherRedeem({
      amountCents: 5_000,
      faceCents: 10_000,
      paidCents: 9_000,
      sellerCommissionPercent: 5,
      platformFeePercent: 1.5,
      hasSeller: true,
      mode: "voucher",
    });
    expect(s.cashCents).toBe(4_500);
    expect(s.platformFeeCents).toBe(67); // floor(45*1.5%)
    expect(s.sellerCommissionCents).toBe(225);
    expect(s.storeIncomeCents).toBe(4_500 - 67 - 225);
  });

  test("no discount P=F=2 · redeem 2", () => {
    const s = splitRedeemAmount({
      amountCents: 200,
      faceCents: 200,
      paidCents: 200,
      mode: "voucher",
      hasSeller: true,
      sellerCommissionPercent: 5,
      platformFeePercent: 1.5,
    });
    expect(s.cashCents).toBe(200);
    expect(s.platformFeeCents).toBe(3);
    expect(s.sellerCommissionCents).toBe(10);
    expect(s.storeIncomeCents).toBe(187);
  });
});

describe("resolveSellerRewardRecipient", () => {
  test("explicit promo seller wins", () => {
    expect(
      resolveSellerRewardRecipient({
        voucherSellerId: "promo1",
        redeemerBusinessId: "bizA",
        issuerBusinessId: "bizA",
      })
    ).toBe("promo1");
  });

  test("本店 → reward to redeemer business", () => {
    expect(
      resolveSellerRewardRecipient({
        voucherSellerId: null,
        redeemerBusinessId: "bizA",
        issuerBusinessId: "bizA",
      })
    ).toBe("bizA");
  });

  test("跨店无 promo → reward to issuer", () => {
    expect(
      resolveSellerRewardRecipient({
        voucherSellerId: null,
        redeemerBusinessId: "bizB",
        issuerBusinessId: "bizA",
      })
    ).toBe("bizA");
  });
});

import { describe, test, expect } from "@jest/globals";
import { splitWithdrawAmount } from "@/lib/withdraw-economics";

describe("splitWithdrawAmount", () => {
  test("draw 5% = 1%+1%+3% with seller", () => {
    const s = splitWithdrawAmount({ amountCents: 10_000, hasSeller: true, mode: "draw" });
    expect(s.feeCents).toBe(500);
    expect(s.customerNetCents).toBe(9500);
    expect(s.platformFeeCents).toBe(100);
    expect(s.sellerCommissionCents).toBe(100);
    expect(s.smallPoolCents).toBe(300);
  });

  test("draw no seller: orphan 1% → small pool", () => {
    const s = splitWithdrawAmount({ amountCents: 10_000, hasSeller: false, mode: "draw" });
    expect(s.feeCents).toBe(500);
    expect(s.platformFeeCents).toBe(100);
    expect(s.sellerCommissionCents).toBe(0);
    expect(s.smallPoolCents).toBe(400);
  });

  test("voucher promo 2% = 1%+1%, no pool", () => {
    const s = splitWithdrawAmount({ amountCents: 10_000, hasSeller: true, mode: "voucher" });
    expect(s.feeCents).toBe(200);
    expect(s.customerNetCents).toBe(9800);
    expect(s.platformFeeCents).toBe(100);
    expect(s.sellerCommissionCents).toBe(100);
    expect(s.smallPoolCents).toBe(0);
  });

  test("voucher no seller: 2% all platform", () => {
    const s = splitWithdrawAmount({ amountCents: 10_000, hasSeller: false, mode: "voucher" });
    expect(s.feeCents).toBe(200);
    expect(s.platformFeeCents).toBe(200);
    expect(s.sellerCommissionCents).toBe(0);
    expect(s.smallPoolCents).toBe(0);
  });
});

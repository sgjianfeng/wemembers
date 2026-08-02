import {
  isDrawEntryOnlyVoucher,
  isSpendableBalanceVoucher,
} from "@/lib/voucher-classification";

describe("voucher-classification", () => {
  const ndpDraw = {
    balanceCents: 0,
    paidCents: 0,
    usedCents: 0,
    drawWeight: 400,
    paymentMethod: "free",
    issueReason: "marketing",
    issueNote: "国庆满赠大奖签 · 消费154.43",
    status: "active",
  };

  it("treats NDP gift draw ticket as draw-entry-only", () => {
    expect(isDrawEntryOnlyVoucher(ndpDraw)).toBe(true);
    expect(isSpendableBalanceVoucher(ndpDraw)).toBe(false);
  });

  it("treats ndp_draw_entry reason as draw-only", () => {
    expect(
      isDrawEntryOnlyVoucher({
        ...ndpDraw,
        issueReason: "ndp_draw_entry",
        issueNote: null,
      })
    ).toBe(true);
  });

  it("keeps paid prepaid with balance spendable", () => {
    const paid = {
      balanceCents: 200,
      paidCents: 200,
      usedCents: 0,
      drawWeight: 40,
      paymentMethod: "stripe",
      issueReason: null,
      issueNote: null,
      status: "active",
    };
    expect(isDrawEntryOnlyVoucher(paid)).toBe(false);
    expect(isSpendableBalanceVoucher(paid)).toBe(true);
  });

  it("hides zero-balance spent prepaid from balance list", () => {
    const spent = {
      balanceCents: 0,
      paidCents: 10000,
      usedCents: 10000,
      drawWeight: 0,
      paymentMethod: "stripe",
      status: "active",
    };
    expect(isDrawEntryOnlyVoucher(spent)).toBe(false);
    expect(isSpendableBalanceVoucher(spent)).toBe(false);
  });
});

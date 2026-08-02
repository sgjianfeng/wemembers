/**
 * 顾客侧「余额」vs「券包/大奖资格」分流
 *
 * 国庆满赠发放两样东西：
 * 1. CustomerCoupon S$61 → 券包核销（可花）
 * 2. Voucher 零余额 + drawWeight → 仅大奖权重，不可当钱花
 *
 * 第 2 类绝不能出现在「我的余额券」里（否则 S$0.00 + 核销码误导店员）。
 */

export type VoucherClassFields = {
  balanceCents: number;
  paidCents?: number | null;
  usedCents?: number | null;
  drawWeight?: number | null;
  paymentMethod?: string | null;
  issueReason?: string | null;
  issueNote?: string | null;
  status?: string | null;
};

/** 满赠/营销赠送的「大奖签」：无实付、无余额、仅权重 */
export function isDrawEntryOnlyVoucher(v: VoucherClassFields): boolean {
  const paid = v.paidCents ?? 0;
  const bal = v.balanceCents ?? 0;
  const used = v.usedCents ?? 0;
  const weight = v.drawWeight ?? 0;
  const method = (v.paymentMethod || "").toLowerCase();
  const reason = (v.issueReason || "").toLowerCase();
  const note = v.issueNote || "";

  // 明确营销/满赠路径
  if (
    (reason === "marketing" ||
      reason === "ndp_draw_entry" ||
      /国庆.*大奖|满赠大奖|ndp.*draw|gift.*draw/i.test(note)) &&
    paid === 0 &&
    bal === 0 &&
    used === 0
  ) {
    return true;
  }

  // free + 零余额 + 有权重 + 从未消费
  if (
    (method === "free" || method === "marketing") &&
    paid === 0 &&
    bal === 0 &&
    used === 0 &&
    weight > 0
  ) {
    return true;
  }

  return false;
}

/**
 * 出现在「我的余额券」：仍有可核销余额，且不是纯大奖签
 */
export function isSpendableBalanceVoucher(v: VoucherClassFields): boolean {
  if (isDrawEntryOnlyVoucher(v)) return false;
  if ((v.balanceCents ?? 0) <= 0) return false;
  if (v.status && v.status !== "active") return false;
  return true;
}

/**
 * Customer voucher balance withdrawal fees.
 *
 * Draw mode (5%):
 *   platform 1% + seller 1% + small prize pool 3%
 *   no seller → platform 1% + small pool 4%
 *
 * Voucher promo mode (2%, no prize pool):
 *   platform 1% + seller 1%
 *   no seller → platform 2%
 */

export type WithdrawProductMode = "draw" | "voucher";

export const WITHDRAW_FEE_PERCENT_DRAW = 5;
export const WITHDRAW_FEE_PERCENT_VOUCHER = 2;
export const WITHDRAW_PLATFORM_PERCENT = 1;
export const WITHDRAW_SELLER_PERCENT = 1;
export const WITHDRAW_SMALL_POOL_PERCENT = 3;

export interface WithdrawSplitInput {
  amountCents: number;
  hasSeller: boolean;
  mode?: WithdrawProductMode;
}

export interface WithdrawSplit {
  amountCents: number;
  customerNetCents: number;
  feeCents: number;
  platformFeeCents: number;
  sellerCommissionCents: number;
  smallPoolCents: number;
  mode: WithdrawProductMode;
}

export function splitWithdrawAmount(input: WithdrawSplitInput): WithdrawSplit {
  const mode: WithdrawProductMode = input.mode === "voucher" ? "voucher" : "draw";
  const amountCents = Math.max(0, Math.round(input.amountCents));

  if (mode === "voucher") {
    const feeCents = Math.round((amountCents * WITHDRAW_FEE_PERCENT_VOUCHER) / 100);
    const customerNetCents = amountCents - feeCents;
    let platformFeeCents = Math.floor((amountCents * WITHDRAW_PLATFORM_PERCENT) / 100);
    let sellerCommissionCents = 0;
    if (input.hasSeller) {
      sellerCommissionCents = Math.floor((amountCents * WITHDRAW_SELLER_PERCENT) / 100);
    } else {
      platformFeeCents = feeCents;
      sellerCommissionCents = 0;
    }
    // Rounding fix
    const pieces = platformFeeCents + sellerCommissionCents;
    if (pieces !== feeCents) {
      platformFeeCents += feeCents - pieces;
    }
    return {
      amountCents,
      customerNetCents,
      feeCents,
      platformFeeCents,
      sellerCommissionCents,
      smallPoolCents: 0,
      mode,
    };
  }

  // Draw mode — 5% with small pool
  const feeCents = Math.round((amountCents * WITHDRAW_FEE_PERCENT_DRAW) / 100);
  const customerNetCents = amountCents - feeCents;

  let platformFeeCents = Math.floor((amountCents * WITHDRAW_PLATFORM_PERCENT) / 100);
  let sellerCommissionCents = 0;
  let smallPoolCents = Math.floor((amountCents * WITHDRAW_SMALL_POOL_PERCENT) / 100);

  if (input.hasSeller) {
    sellerCommissionCents = Math.floor((amountCents * WITHDRAW_SELLER_PERCENT) / 100);
  } else {
    smallPoolCents += Math.floor((amountCents * WITHDRAW_SELLER_PERCENT) / 100);
  }

  const pieces = platformFeeCents + sellerCommissionCents + smallPoolCents;
  if (pieces !== feeCents) {
    smallPoolCents += feeCents - pieces;
  }
  if (smallPoolCents < 0) {
    platformFeeCents += smallPoolCents;
    smallPoolCents = 0;
  }

  return {
    amountCents,
    customerNetCents,
    feeCents,
    platformFeeCents,
    sellerCommissionCents,
    smallPoolCents,
    mode,
  };
}

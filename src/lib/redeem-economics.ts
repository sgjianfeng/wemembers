/**
 * Redeem economics
 *
 * ## Draw (Model A pot)
 * On each redeem of face amount R:
 *   - pot = budgetPercent% of R (default 20)
 *   - store gets the rest initially
 *   - from pot: seller (if any) + platform; leftover → prize pool
 *
 * ## Voucher (pay P get F — confirmed product model)
 * User balance is face F; paid cash is P.
 * On redeem of face amount R:
 *   - cash equivalent C = floor(R × P / F)
 *   - platform = floor(C × platform%)   default 1.5%
 *   - seller  = floor(C × seller%)      default 5% — always accrued
 *   - store   = C − platform − seller
 *
 * Seller reward recipient (applied in apply-redeem-split):
 *   - voucher.sellerId if set (individual / channel promo)
 *   - else if same-business redeem (本店) → redeeming business (5% back to self)
 *   - else → issuing business (cross-store marketing to issuer)
 *
 * Net 本店: store + seller-to-self = C − platform only.
 */

export type ProductMode = "draw" | "voucher";

export interface RedeemSplitInput {
  amountCents: number;
  /** Total non-store take from redeem, default 20 — draw only */
  budgetPercent?: number;
  sellerCommissionPercent?: number;
  platformFeePercent?: number;
  /**
   * Draw: whether an external seller exists (0 if false).
   * Voucher: ignored for amount calc — seller % always applied; recipient decided upstream.
   */
  hasSeller: boolean;
  /** draw: leftover pot → prize pool; voucher: cash-equivalent split */
  mode?: ProductMode;
  /** Voucher only: face / paid on the voucher (for C = R×P/F) */
  faceCents?: number;
  paidCents?: number;
}

export interface RedeemSplit {
  amountCents: number;
  /** Face redeemed (voucher) or same as amount (draw) */
  redeemFaceCents: number;
  /** Cash equivalent used for fee base (voucher) or amount (draw) */
  cashCents: number;
  storeIncomeCents: number;
  potCents: number;
  sellerCommissionCents: number;
  platformFeeCents: number;
  prizePoolCents: number;
  budgetPercent: number;
  mode: ProductMode;
}

export function splitRedeemAmount(input: RedeemSplitInput): RedeemSplit {
  const mode: ProductMode = input.mode === "voucher" ? "voucher" : "draw";
  if (mode === "voucher") {
    return splitVoucherRedeem(input);
  }
  return splitDrawRedeem(input);
}

/** Pay P get F — fees on cash equivalent C = R×P/F */
export function splitVoucherRedeem(input: RedeemSplitInput): RedeemSplit {
  const redeemFaceCents = Math.max(0, Math.round(input.amountCents));
  const faceCents = Math.max(0, Math.round(input.faceCents ?? redeemFaceCents));
  const paidCents = Math.max(
    0,
    Math.round(input.paidCents ?? faceCents)
  );
  const sellerPct = clampPercent(input.sellerCommissionPercent ?? 5);
  const platformPct = clampPercent(input.platformFeePercent ?? 1.5);

  if (redeemFaceCents <= 0 || faceCents <= 0) {
    return emptySplit(0, 0, "voucher");
  }

  // C = R × P / F
  const cashCents = Math.floor((redeemFaceCents * paidCents) / faceCents);
  let platformFeeCents =
    platformPct > 0 ? Math.floor((cashCents * platformPct) / 100) : 0;
  // Always accrue seller % on cash (recipient resolved upstream)
  let sellerCommissionCents =
    sellerPct > 0 ? Math.floor((cashCents * sellerPct) / 100) : 0;

  if (platformFeeCents + sellerCommissionCents > cashCents) {
    if (platformFeeCents >= cashCents) {
      platformFeeCents = cashCents;
      sellerCommissionCents = 0;
    } else {
      sellerCommissionCents = cashCents - platformFeeCents;
    }
  }

  const storeIncomeCents =
    cashCents - platformFeeCents - sellerCommissionCents;

  return {
    amountCents: redeemFaceCents,
    redeemFaceCents,
    cashCents,
    storeIncomeCents,
    potCents: platformFeeCents + sellerCommissionCents,
    sellerCommissionCents,
    platformFeeCents,
    prizePoolCents: 0,
    budgetPercent: 0,
    mode: "voucher",
  };
}

/** Model A pot for lucky-draw vouchers */
function splitDrawRedeem(input: RedeemSplitInput): RedeemSplit {
  const amountCents = Math.max(0, Math.round(input.amountCents));
  const budgetPercent = clampPercent(input.budgetPercent ?? 20);
  const sellerPct = clampPercent(input.sellerCommissionPercent ?? 5);
  const platformPct = clampPercent(input.platformFeePercent ?? 1.5);

  const potCents = Math.round((amountCents * budgetPercent) / 100);
  let storeIncomeCents = amountCents - potCents;

  let sellerCommissionCents = 0;
  if (input.hasSeller && sellerPct > 0 && potCents > 0) {
    sellerCommissionCents = Math.floor((amountCents * sellerPct) / 100);
  }
  let platformFeeCents = 0;
  if (platformPct > 0 && potCents > 0) {
    platformFeeCents = Math.floor((amountCents * platformPct) / 100);
  }

  if (sellerCommissionCents + platformFeeCents > potCents) {
    if (platformFeeCents >= potCents) {
      platformFeeCents = potCents;
      sellerCommissionCents = 0;
    } else {
      sellerCommissionCents = potCents - platformFeeCents;
    }
  }

  const prizePoolCents = potCents - sellerCommissionCents - platformFeeCents;

  return {
    amountCents,
    redeemFaceCents: amountCents,
    cashCents: amountCents,
    storeIncomeCents,
    potCents,
    sellerCommissionCents,
    platformFeeCents,
    prizePoolCents,
    budgetPercent,
    mode: "draw",
  };
}

function emptySplit(
  amountCents: number,
  cashCents: number,
  mode: ProductMode
): RedeemSplit {
  return {
    amountCents,
    redeemFaceCents: amountCents,
    cashCents,
    storeIncomeCents: 0,
    potCents: 0,
    sellerCommissionCents: 0,
    platformFeeCents: 0,
    prizePoolCents: 0,
    budgetPercent: mode === "draw" ? 20 : 0,
    mode,
  };
}

/**
 * Who receives the 5% seller reward.
 * - Explicit promo seller on voucher
 * - Else same business redeem → that business (本店，5% 回己)
 * - Else issuing business (跨店营销费)
 */
export function resolveSellerRewardRecipient(input: {
  voucherSellerId?: string | null;
  redeemerBusinessId: string;
  issuerBusinessId: string;
}): string {
  if (input.voucherSellerId) return input.voucherSellerId;
  if (input.redeemerBusinessId === input.issuerBusinessId) {
    return input.redeemerBusinessId;
  }
  return input.issuerBusinessId;
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

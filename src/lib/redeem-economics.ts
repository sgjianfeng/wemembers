/**
 * Model A redeem economics (shared by draw + plain voucher promotions)
 *
 * On each redeem of `amountCents`:
 *   - pot = budgetPercent% of amount (default 20)
 *   - store gets the rest initially
 *
 * From the pot:
 *   - seller commission (of redeem amount, if seller)
 *   - platform fee (of redeem amount)
 *   - remainder:
 *       draw mode    → prize pool (later split small/grand)
 *       voucher mode → back to store (no lottery pool)
 *
 * No consumption ⇒ pot = 0 ⇒ no seller/platform/pool.
 */

export type ProductMode = "draw" | "voucher";

export interface RedeemSplitInput {
  amountCents: number;
  /** Total non-store take from redeem, default 20 */
  budgetPercent?: number;
  sellerCommissionPercent?: number;
  platformFeePercent?: number;
  hasSeller: boolean;
  /** draw: leftover pot → prize pool; voucher: leftover pot → store */
  mode?: ProductMode;
}

export interface RedeemSplit {
  amountCents: number;
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

  let prizePoolCents = potCents - sellerCommissionCents - platformFeeCents;
  if (mode === "voucher") {
    // No prize pool — remainder of pot returns to the redeeming store
    storeIncomeCents += prizePoolCents;
    prizePoolCents = 0;
  }

  return {
    amountCents,
    storeIncomeCents,
    potCents,
    sellerCommissionCents,
    platformFeeCents,
    prizePoolCents,
    budgetPercent,
    mode,
  };
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

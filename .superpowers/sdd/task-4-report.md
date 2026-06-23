# Task 4 Report: Pass balanceCents to Weight in Purchase API

## Status: Completed

## Commit
- `3670ba4` — `feat: pass balanceCents to weight calculation`

## Change
- **File**: `src/app/api/voucher/purchase/route.ts`
- **Line 39**: `calculateTierWeight(amountCents, tier.tier)` changed to `calculateTierWeight(amountCents, tier.tier, balanceCents)`

## Test Summary
- **TypeScript**: No errors
- **voucher-draw.test.ts**: 24 passed, 0 failed (the primary test file covering `calculateTierWeight` and the purchase flow)
- **vouchers.test.ts**: Pre-existing Jest config failure (ESM `jose` library parse error) — unrelated to this change

## Concerns
- None. The `balanceCents` variable was already computed on line 38 of the same function; this change simply passes it through to `calculateTierWeight`, which was updated in Task 2 to accept the third parameter.

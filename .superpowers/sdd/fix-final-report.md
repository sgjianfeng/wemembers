# Fix Final Report — Voucher Lucky Draw V2 Code Review

**Branch:** `worktree-voucher-lucky-draw-v2`
**Commit SHA:** `90363167f6cae6a1198fc9025e06bd03db3515a9`
**Date:** 2026-06-21

## Test Results

| Suite | Tests | Status |
|---|---|---|
| `tests/voucher-draw.test.ts` | 27 | PASS |
| `tests/draw-v2.test.ts` | 25 | PASS |
| **Total** | **52** | **PASS** |

## What was Fixed

### Issue 1: PoolDashboard props interface mismatch
**Files:** `src/components/customer/PoolDashboard.tsx`, `src/app/voucher/[slug]/page.tsx`

- PoolDashboard now accepts `{ countdowns: CountdownItem[]; instantPoolSgd: string; dailyAvgVelocity: number }` as props
- Removed internal fetch logic (useState, useEffect, fetch)
- Simplified to render countdown cards and pool summary from passed props

### Issue 2: VoucherTierSelector wrong i18n keys
**File:** `src/components/customer/VoucherTierSelector.tsx`

- `descKey: "voucher.smallTier"` changed to `"voucher.smallTier.desc"`
- `descKey: "voucher.mediumTier"` changed to `"voucher.mediumTier.desc"`
- `descKey: "voucher.largeTier"` changed to `"voucher.largeTier.desc"`

### Issue 3: storeId FK violation
**Files:** `src/app/api/voucher/purchase/route.ts`, `src/app/api/voucher/redeem/route.ts`

- Purchase route: Only creates VoucherUsage when a real store exists (`store?.id`). Removed fallback to `campaign.businessId` (which is a User ID, not a Store ID).
- Redeem route: Only creates VoucherUsage when `session.storeId` is a valid store. Removed fallback to `session.userId`. Usage data in response is `null` when no store.

### Issue 4: instantPoolCents race condition
**File:** `src/app/api/voucher/purchase/route.ts`

- Changed from read-modify-write (`instantPoolCents + prizePoolContribution`) to Prisma atomic increment: `instantPoolCents: { increment: prizePoolContribution }`

### Issue 5: Pool calculation incorrect
**File:** `src/app/api/campaign/pool-status/route.ts`

- Instant pool now uses `campaign.instantPoolCents` (actual running counter) instead of recalculating from total
- Mid and grand pools allocated proportionally by ratio from remaining non-instant total
- Countdown allocation uses proportional split by `targetCents` instead of hardcoded `/100000` divisor

### Issue 6: Voucher page data mapping wrong
**File:** `src/app/voucher/[slug]/page.tsx`

- `poolStatus.countdowns` changed to `poolStatus.countdown` (API returns singular)
- `poolStatus.instantPoolSgd` changed to `poolStatus.pool?.instantPool?.sgd`
- `poolStatus.dailyAvgVelocity` changed to `poolStatus.velocity?.dailyAvgCents`

### Issue 7: Share-boost unlimited boosts
**File:** `src/app/api/campaign/share-boost/route.ts`

- Added check: if `voucher.drawWeight > voucher.amountCents`, returns error `"already boosted"` (400).
- Prevents stacking multiple share boosts on the same voucher.

### Issue 8: Missing startDate check
**File:** `src/app/api/voucher/purchase/route.ts`

- Added `|| new Date() < campaign.startDate` to campaign validation.
- Full check: `!campaign || new Date() < campaign.startDate || new Date() > campaign.endDate`

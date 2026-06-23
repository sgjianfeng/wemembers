# Task 9: Join + Leave APIs — Report

**Status:** Complete

**Commit SHA:** `bf16488`

**Branch:** `main`

**Files Created:**
- `src/app/api/business/campaigns/[id]/join/route.ts` — POST handler; validates session (role business, 403), validates campaign exists/is joinable/is active (400), checks endDate (400), checks store overlap (409), then appends business stores to campaign `storeIds` and increments `joinCount`.
- `src/app/api/business/campaigns/[id]/leave/route.ts` — POST handler; validates session (role business, 403), checks campaign exists (404), filters out business stores from campaign `storeIds`, no-op guard (400), then decrements `joinCount`.

**Verification:** `npx tsc --noEmit` — 0 errors.

**Concerns:** None.

### Task 12: Dashboard Entry — Marketplace Card

**Status:** Complete

**Commit:** `6772376` — `feat: add marketplace entry to business dashboard`

**Changes in `src/app/business/page.tsx`:**

1. Added `marketCampaignCount` query (lines 34-41): A `prisma.campaign.count()` query that counts active, joinable campaigns from other businesses (excluding the current user's own campaigns). This runs after the existing `Promise.all` block.

2. Added 5th quick-action card (lines 62-68): A new "Join Campaigns" (参与活动) card in the quick-actions grid that links to `/business/campaigns/market` and displays the count of available campaigns. The label and description are locale-aware (zh/en).

**TypeScript Check:**
- `npx tsc --noEmit` completed with 37 pre-existing errors in 11 other files (seed.ts, tests, api routes, etc.)
- **Zero new errors** — `src/app/business/page.tsx` compiles cleanly

**Test Summary:**
- No new tests required for this change (UI dashboard card addition)
- Existing pre-existing TS errors are unrelated to this change

**Concerns:**
- None. This is a straightforward dashboard card addition following the existing pattern.

## Fix Report

**Resolved performance concern:** The `marketCampaignCount` query was running sequentially after `Promise.all`. Moved it into the `Promise.all` as the 6th entry so all six queries run in parallel.

**Commit:**

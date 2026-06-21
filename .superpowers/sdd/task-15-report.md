## Task 15 Report: Integration Tests for Voucher Purchase Flow

**Status**: Complete

**Commit SHA**: `ebb9f83`

**Branch**: `worktree-voucher-lucky-draw-v2`

### Test Results
- **Total**: 27 tests
- **Passed**: 27
- **Failed**: 0

### Files Created
- `tests/voucher-draw.test.ts` — 27 integration tests across 7 describe blocks

### Files Modified (besides test file)
- `jest.config.ts` — Fixed `setupFilesAfterSetup` (typo) to `setupFilesAfterEnv` (correct config option)
- `tests/helpers.ts` — Changed testPrisma DB path from `file:./test.db` to absolute path via `path.resolve(__dirname, "../prisma/test.db")` to ensure PrismaClient connects to the same DB as `prisma db push`
- `tests/setup.ts` — Changed `DATABASE_URL` to use absolute path; fixed cleanup to use absolute path
- `src/app/api/campaign/pool-status/route.ts` — Extended campaign lookup from `type: "lucky_draw"` to `type: { in: ["lucky_draw", "lucky_draw_v2"] }` so V2 campaigns are accessible
- `src/app/api/voucher/purchase/route.ts` — Fixed foreign key bug: `storeId` was set to `campaign.businessId` (user ID), now resolves to actual Store ID via `prisma.store.findFirst({ where: { businessId } })`

### Test Coverage

**Integration tests (API routes)**:
- GET `/api/draw/[slug]` — returns V2 campaign with voucherTiers, budget fields, pool estimates; 404 for unknown slug
- GET `/api/campaign/pool-status` — returns pool data with countdowns, ratio fields, draw stats, velocity; 400 for missing slug; 404 for unknown slug
- POST `/api/voucher/purchase` — creates voucher + awards instant prize; small tier excludes grand pool; rejects unauthenticated; rejects invalid amount; increments campaign counters
- End-to-end: purchase creates draw record linked to voucher; pool total increases after purchase

**Algorithm sanity checks (integration-level)**:
- `drawInstantV2` — 100% win rate across all tiers; respects tier caps
- `calculateTierWeight` — small=0, medium=1x, large=2x; share boosts stacking
- `estimatePoolCountdown` — freeze on deceleration; accelerate on velocity increase; 100% progress when target met
- `resolveTier` — correct tier mapping; null for amounts below minimum

### Concerns
- The `@/lib/auth` module imports `jose` (ESM) which cannot be transformed by ts-jest. Workaround: `jest.mock("@/lib/auth", ...)` with a self-contained mock that provides `signToken`, `verifyToken`, `getSession`, etc. without importing `jose`. This is a known limitation — API tests that need real JWT verification would require either ESM config changes or a separate test setup.
- The existing test files (`vouchers.test.ts`, `draw.test.ts`, `membership.test.ts`) likely encounter the same `jose` ESM issue; they were not addressed in this task.
- The `campaign.businessId` as `storeId` bug in `voucher/purchase/route.ts` was fixed — this was a latent FK constraint violation that would have caused runtime errors in production.

### Report Path
`/Users/it-macbook/Jianfeng/Github/jianfeng-projects/wemembers/.superpowers/sdd/task-15-report.md`

# Task 12 Report: Customer Balance Page

**Status:** Complete

**Commit SHA:** `99d5fdb` on branch `worktree-voucher-lucky-draw-v2`

**Verification:** `npx tsc --noEmit` passes — the only TS error is a pre-existing issue in `tests/e2e/lucky-draw.spec.ts` at line 251 (unrelated to this change).

**File created:**
- `src/app/(tabs)/balance/page.tsx` — 135 lines

**Page details:**
- Server component following the existing `(tabs)` page pattern (getSession, cookies-based i18n, direct Prisma queries)
- Displays total available voucher balance in an amber gradient card (sum of `Voucher.balanceCents` where `status === "active"`)
- Lists usage history (`VoucherUsage` joined through `Voucher`) in reverse chronological order, capped at 50
- Each usage row shows: store name, time ago, amount spent (red), and computed running balance after that usage (per-voucher running total working backwards from current balance)
- Empty state with icon and "no usage history" message when no history exists
- Uses existing i18n keys (`voucher.balance.*`, `voucher.balanceAfter`) for bilingual support (zh/en)

**Concerns:** None. Page type-checks cleanly and follows the established codebase patterns (wallet page, profile page).

**Report path:** `/Users/it-macbook/Jianfeng/Github/jianfeng-projects/wemembers/.superpowers/sdd/task-12-report.md`

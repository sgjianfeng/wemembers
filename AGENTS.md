<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# WeMembers — AI Agent Instructions

## 1. Project Overview

WeMembers is a **Singapore-dollar (S$), mobile-first merchant marketing platform**. It provides three product pillars:

- **Voucher System** — Issue, claim, redeem, gift coupons. Prepaid voucher V2 with prize-pool contributions. Cross-store redemption and settlement.
- **Membership System** — Points earning/spending, tier progression (regular → silver → gold → platinum), daily check-in, achievement badges.
- **Lucky Draw (V2)** — Voucher purchases trigger draws with 100% win rate. Dual pool (instant + deferred prizes) with shared countdown timers. Campaign marketplace for cross-store prize pools.

**Four user roles** share a single `User` table with a `role` discriminator:
| Role       | Dashboard     | Capabilities |
|------------|---------------|-------------|
| `customer` | `/home`       | Claim coupons, purchase vouchers, earn points, join draws |
| `business` | `/business`   | Manage coupons, members, stores, campaigns, tokens, settlements |
| `staff`    | `/business`   | Redeem-only: access redemption page but cannot manage coupons/campaigns/stores |
| `admin`    | `/admin`      | Platform dashboard, token adjustments |

---

## 2. Tech Stack

| Layer          | Technology                                     |
|----------------|------------------------------------------------|
| Framework      | Next.js 16 (App Router, RSC, standalone output)|
| Language       | TypeScript 5 (strict mode, target ES2017)      |
| Database       | Prisma 5 (SQLite dev, PostgreSQL production)   |
| UI             | shadcn/ui v4 (base-nova), Tailwind CSS v4, Radix Slot |
| Auth           | jose (JWT HS256), httpOnly cookies, 7d expiry  |
| Payments       | Stripe v22 (Connect Express, Checkout, SGD)    |
| SMS            | Vonage (`@vonage/server-sdk`)                  |
| Email          | Resend (`resend`)                              |
| AI             | DeepSeek API (`deepseek-chat`)                 |
| Icons          | lucide-react                                   |
| Toasts         | sonner                                         |
| Theme          | next-themes (dark mode)                        |
| Testing        | Jest (ts-jest), Playwright (E2E + screenshots) |
| Deployment     | Docker (multi-stage, standalone output) → Alibaba Cloud ECS |

**Path alias:** `@/*` → `./src/*`

---

## 3. Critical Rules

### Currency
- **Always use `S$` (Singapore Dollar).** Never write `¥`, `$`, or `USD`.
- Money values are stored in **cents** (integers). Use `formatMoney(cents)` from `@/lib/utils` for display.

### Auth
- **Never introduce another auth library.** The project uses `jose` for JWT signing/verification (HS256). Cookie name is `gwm_token`.
- **Do not replace the password hashing** (`hashPassword` in `@/lib/auth`). It uses Web Crypto SHA-256 with a static salt — marked as MVP. Migration to bcrypt requires a coordinated plan; don't do it unilaterally.
- `getSession()` reads the cookie and returns `JWTPayload` (userId, role, storeId?) or null. Use this in every protected API route.

### Messaging Gate
- **SMS and email are gated** by `MESSAGING_MODE` env var (`@/lib/messaging.ts`). Set to `"live"` to actually send; otherwise only logs.
- `BLOCKED_CONTACTS` env var (comma-separated) prevents sending to specific emails/phones even in live mode.
- Always call `shouldLogOnly(contact)` before sending.

### Next.js 16
- **Read `node_modules/next/dist/docs/` before writing any Next.js-specific code.** This version has breaking API changes vs. your training data.
- The project uses App Router with React Server Components by default. Add `"use client"` only when you need interactivity (state, effects, event handlers).

### Database
- **Dev:** SQLite (`prisma/dev.db`). **Production:** PostgreSQL (pgvector-enabled).
- The Prisma schema is at `prisma/schema.prisma`. Always edit the schema first, then run `npx prisma db push` (dev) or `scripts/db-migrate.sh` (production).
- **Never run `prisma migrate`** — this project uses `db push` only.

### Platform Account
- The platform account email is set via `PLATFORM_ACCOUNT_EMAIL` env var. Campaigns created by this account are auto-joinable (marketplace).

---

## 4. Code Conventions

### Imports
```typescript
// Always use the @/ path alias. No relative imports for src/ contents.
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
```

### Components
- **UI primitives** (`src/components/ui/`): `"use client"`, `React.forwardRef`, `cn()` + `cva()` for styling, `displayName` set explicitly. The `Button` uses `rounded-full` by default (mobile-first pill style).
- **Page components** (`src/app/`): Server Components by default. Use `"use client"` only when needed.
- **Naming:** PascalCase files for components (`Button.tsx`, `BottomNav.tsx`), camelCase for utilities (`auth.ts`, `db.ts`).

### API Routes
```typescript
// File: src/app/api/<resource>/<action>/route.ts
// Pattern: try/catch → NextResponse.json({ error }, { status })
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    // ... business logic ...
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("route-name error:", error);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
```
- Error messages are in **Chinese** (user-facing app).
- Use `ApiResponse<T>` from `@/types` for typed responses.
- Auth guard: always call `getSession()` first in protected routes.

### i18n
- The app supports **zh** (default) and **en** via `LanguageProvider` and `useLang()` hook.
- Dictionary entries live in `@/lib/i18n`. Use the `t()` function from `useLang()` for user-facing strings.
- Cookie `gwm_lang` persists language preference (365 days).

### Types
- Shared types in `src/types/index.ts`. Import with `@/types`.
- Role, CouponType, Tier, etc. are union types exported from there.
- Token costs and signup bonuses are defined as `const` objects in `src/types/index.ts`.

---

## 5. Directory Structure

```
wemembers/
  prisma/
    schema.prisma          ← 32 models, single source of truth for data
    seed.ts                ← Dev seed data
    dev.db                 ← SQLite dev database (gitignored)
  src/
    app/
      api/                 ← All API routes (see §7)
      (auth)/              ← Auth pages (login, register)
      (home)/              ← Customer dashboard
      (business)/          ← Business dashboard + management pages
      admin/               ← Admin dashboard
      page.tsx             ← Root landing page
    components/
      ui/                  ← shadcn/ui primitives (Button, Badge, Card, Input...)
      customer/            ← Consumer-facing components (CountdownCard, DailyCheckIn, ...)
      i18n/                ← LanguageProvider, LanguageSwitcher, LangWrapper
      landing/             ← Landing page components (PremiumCouponCard, ...)
    lib/                   ← Shared libraries (auth, db, i18n, utils, messaging, sms, email)
    services/              ← External integrations (ai, stripe, vonage)
    types/
      index.ts             ← Shared TypeScript types + constants
    middleware.ts           ← Route protection + role-based access
  tests/
    *.test.ts              ← Jest unit tests
    e2e/                   ← Playwright E2E specs
    scenarios/             ← YAML scenario definitions (integration tests)
    screenshots/           ← Automated screenshot capture + HTML report
  docs/
    superpowers/
      specs/               ← Design specifications
      plans/               ← Implementation plans (checkbox task tracking)
```

---

## 6. Auth System

### Tokens & Cookies
- **Library:** `jose` (not `jsonwebtoken`). Algorithm: HS256.
- **Cookie:** `gwm_token`, httpOnly, secure in production, sameSite=lax, path=/, maxAge 7 days.
- **Payload:** `{ userId: string, role: "admin"|"business"|"customer"|"staff", storeId?: string }`.

### Key Functions (`@/lib/auth`)
| Function           | Purpose |
|--------------------|---------|
| `signToken(p)`     | Create JWT |
| `verifyToken(t)`   | Verify JWT → payload or null |
| `getSession()`     | Read cookie + verify → payload or null |
| `setSession(t)`    | Set httpOnly cookie |
| `clearSession()`   | Delete cookie |

### Auth Flow
1. User submits phone or email
2. 6-digit code sent via SMS (Vonage) or email (Resend), gated by `shouldLogOnly()`
3. Code stored in `VerificationCode` table (5 attempts max, 5 min expiry)
4. On verify, JWT created and set as cookie
5. Middleware redirects to role-appropriate dashboard

### Route Protection (`src/middleware.ts`)
- **Public paths** (no auth required): `/`, `/shop/*`, `/coupons/*`, `/store/*`, `/auth/*`, `/api/stripe/*`, `/for-business/*`, `/voucher/*`, `/p/*`
- **Auth pages** (`/auth/*`): If already logged in, redirect to role dashboard.
- **API routes** (`/api/*`): Passthrough — each route handles its own auth via `getSession()`.
- **Admin** (`/admin/*`): `role === "admin"` only, else 403.
- **Business** (`/business/*`): `role === "business"` or `"staff"`. Staff is blocked from: coupons, campaigns, stores, settings, tokens, member config, lucky-draw, partners, settlements.
- **Customer** (`/home`, `/wallet`, `/card`, `/profile`, `/my-tokens`, `/redeem`): `role === "customer"` only.

---

## 7. Database Conventions

### Schema
- Single Prisma schema at `prisma/schema.prisma` — 32 models, all domains in one file.
- Default ID strategy: `@default(cuid())`.
- Timestamps: `createdAt @default(now())`, `updatedAt @updatedAt`.
- Status fields use string enums (e.g., `"active" | "suspended" | "deleted"`), not Prisma enums.

### Key Relations
- **User** is the central model. It connects to memberships, coupons, stores, token accounts, check-ins, badges, referrals, promotions, and campaigns — all via Prisma relation fields.
- **Membership** links businesses and customers (n:n with extra fields: points, visits, tier, isFavorite).
- **Voucher** (V2) has a `balances` JSON field tracking per-store usage and a `contributed` boolean for prize pool.
- **Campaign** supports multiple types: `promotion`, `seasonal`, `holiday`, `event`, `launch`, `lucky_draw`. V2 draw fields include `voucherTiers` JSON, draw config, and marketplace join fields.

### Migration
```bash
# Development (safe — SQLite, no data loss concern)
npx prisma db push

# After schema change + push, regenerate client
npx prisma generate

# Production
./scripts/db-migrate.sh
```

### Client Usage
```typescript
import { prisma } from "@/lib/db";
// Singleton — safe to import anywhere (globalThis cached in dev)
```

---

## 8. API Design Patterns

### Route Organization
```
src/app/api/<domain>/<action>/route.ts
```
Examples: `auth/send-code/route.ts`, `business/coupons/[id]/route.ts`, `voucher/purchase/route.ts`.

### Standard Patterns
- **Auth guard:** `const session = await getSession(); if (!session) return 401;`
- **Role check:** `if (session.role !== "business") return 403;`
- **Staff check:** Staff can only access redemption endpoints. Check `session.role === "staff"` and restrict.
- **Validation:** Manual checks in route handlers. No Zod or validation library.
- **Error format:** `{ error: "message" }` with appropriate HTTP status.
- **Success format:** `{ data: result }` or `{ data: result, meta: { cursor, hasMore } }` for paginated lists.

### External Services (`src/services/`)
- AI (DeepSeek): `src/services/ai.ts` — JSON response format, retry logic, in-memory cache.
- Stripe: Checkout sessions, Connect Express accounts, webhook handling.
- Wrap all external calls in try/catch — never let a third-party failure crash the route.

---

## 9. Testing Strategy

### Unit Tests (Jest)
```bash
npm run test:unit        # jest --config jest.config.ts
```
- Config: `jest.config.ts` (ts-jest, node environment, roots: `tests/`)
- Setup: `tests/setup.ts` creates test SQLite DB (`prisma/test.db`), pushes schema, cleans up after.
- Tests live in `tests/*.test.ts`.

### E2E Tests (Playwright)
```bash
npm run test:e2e         # playwright test
```
- Config: `playwright.config.ts` — Chromium, 390×844 viewport (mobile), single worker.
- Base URL: `http://localhost:3000`. Web server auto-starts `npm run dev`.
- Specs: `tests/e2e/*.spec.ts`.

### Scenario Tests (YAML Integration)
```bash
npm run test             # runs tests/run-all.ts (unit + scenario + E2E)
```
- `tests/scenario-runner.ts` reads YAML files from `tests/scenarios/`.
- 5 scenarios with 63+ steps covering: cross-store purchase, tier upgrade, share boost, seller auto-network, pool status countdown.

### Screenshot Tests
```bash
npx playwright test --config playwright.screenshots.config.ts
```
- Captures screenshots of all pages.
- Generates HTML report at `tests/screenshots/output/report.html`.
- Groups: a01-a05 (auth), b01-b20 (business), c01-c12 (consumer), p01-p08 (public).

### Writing New Tests
- Match existing patterns: Jest for logic, Playwright for flows, YAML scenarios for complex multi-step journeys.
- Run the full suite (`npm test`) before claiming work is done.

---

## 10. Common Workflows

### Adding a New API Route
1. Create `src/app/api/<domain>/<action>/route.ts`.
2. Export `GET`/`POST`/`PUT`/`DELETE` as needed (named exports from Next.js App Router).
3. Call `getSession()` at the top if protected.
4. Use try/catch → `NextResponse.json({ error }, { status })`.
5. Add a unit test in `tests/<domain>.test.ts`.
6. If it changes user-visible behavior, add/update a Playwright E2E spec.

### Adding a New UI Component
1. If it's a reusable primitive → `src/components/ui/ComponentName.tsx`.
2. If it's domain-specific → `src/components/<domain>/ComponentName.tsx`.
3. Follow the pattern: `"use client"`, `cn()` for classes, `forwardRef` if it wraps an HTML element.
4. Use `useLang().t()` for any user-facing strings (Chinese default, English available).
5. Use existing shadcn/ui components before building from scratch.

### Adding a Database Field/Model
1. Edit `prisma/schema.prisma`.
2. Run `npx prisma db push` (dev).
3. Run `npx prisma generate` to update the client.
4. Update any affected API routes.
5. Add test coverage if the field affects business logic.

### Before Committing
1. Run `npm run lint` (ESLint).
2. Run `npm test` (unit + scenario + E2E).
3. Commit message format: `type: description` (e.g., `feat:`, `fix:`, `perf:`, `refactor:`).
4. End commit messages with: `Co-Authored-By: Claude <noreply@anthropic.com>`.

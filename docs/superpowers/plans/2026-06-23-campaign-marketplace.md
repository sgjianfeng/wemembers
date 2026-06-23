# Campaign Marketplace — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add campaign marketplace: platform creates V2 draw campaigns → stores join from dashboard → customers buy vouchers and enter shared prize pools.

**Architecture:** Minimal new surface — reuse existing V2 draw infrastructure (`draw-v2.ts`, voucher purchase API, PoolDashboard). Add market page + join/leave APIs + dashboard entry. Fixed voucher amounts (20/50/100/200) replace continuous ranges. Balance weight unified at 2× for both medium and large tiers.

**Tech Stack:** Next.js App Router, Prisma (SQLite dev / PG prod), TypeScript

## Global Constraints

- V2 draw logic (`src/lib/draw-v2.ts`) changes must not break existing voucher purchase flow
- Only account matching `PLATFORM_ACCOUNT_EMAIL` env var gets `joinable: true` on campaign create
- Fixed voucher amounts: S$20, S$50, S$100, S$200
- Balance weight: 2× for both medium and large tiers
- No approval flow — join is instant
- All new UI text must have zh/en translations in `src/lib/i18n.ts`

---

## File Structure

```
Create:
  src/app/business/campaigns/market/page.tsx         — Marketplace page (SSR)
  src/app/business/campaigns/market/JoinButton.tsx    — Client join button
  src/app/api/business/campaigns/market/route.ts      — GET market listings
  src/app/api/business/campaigns/[id]/join/route.ts   — POST join
  src/app/api/business/campaigns/[id]/leave/route.ts  — POST leave

Modify:
  prisma/schema.prisma                                — Add joinCount to Campaign
  src/lib/draw-v2.ts                                  — Fixed amounts + balance weight
  src/components/customer/VoucherTierSelector.tsx      — Add S$200 button
  src/components/customer/InstantPrizePreview.tsx      — Update tier labels
  src/app/business/page.tsx                            — Add marketplace entry card
  src/app/api/business/campaigns/route.ts              — Auto joinable for platform
  src/app/api/voucher/purchase/route.ts                — Pass balanceCents to weight calc
  src/lib/i18n.ts                                      — Marketplace translations
  .env                                                 — PLATFORM_ACCOUNT_EMAIL
```

---

### Task 1: Database — Add joinCount to Campaign

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `Campaign.joinCount: Int @default(0)` field

- [ ] **Step 1: Add joinCount field**

In `prisma/schema.prisma`, find the Campaign model and add this line after `budgetPercent`:

```prisma
  joinCount           Int      @default(0)      // 已参与门店数
```

- [ ] **Step 2: Run Prisma migration**

```bash
npx prisma db push
```

Expected: Schema synced, no errors.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add joinCount to Campaign model

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Fixed Voucher Amounts + Balance Weight

**Files:**
- Modify: `src/lib/draw-v2.ts`

**Interfaces:**
- Produces:
  - `FIXED_VOUCHER_AMOUNTS: number[]` — `[20, 50, 100, 200]`
  - Updated `DEFAULT_VOUCHER_TIERS` with fixed min/max ranges
  - Updated `calculateTierWeight(amountCents, tier, balanceCents, shareBoosts)` — adds balanceCents param

- [ ] **Step 1: Add fixed amounts array + update tiers**

After the `DEFAULT_VOUCHER_TIERS` declaration, add:

```typescript
export const FIXED_VOUCHER_AMOUNTS = [20, 50, 100, 200] as const;
```

Replace `DEFAULT_VOUCHER_TIERS` with:

```typescript
export const DEFAULT_VOUCHER_TIERS: VoucherTierConfig[] = [
  { min: 20, max: 20, tier: "small", instantPrizeCap: 2 },
  { min: 50, max: 50, tier: "medium", instantPrizeCap: 8 },
  { min: 100, max: 100, tier: "large", instantPrizeCap: 20 },
  { min: 200, max: 200, tier: "large", instantPrizeCap: 20 },
];
```

`resolveTier` already matches by min/max range — no other changes needed for tier resolution.

- [ ] **Step 2: Update calculateTierWeight to accept and use balanceCents**

Replace the existing `calculateTierWeight` function:

```typescript
export function calculateTierWeight(
  amountCents: number,
  tier: "small" | "medium" | "large",
  balanceCents: number = 0,
  shareBoosts: number = 0
): number {
  if (tier === "small") return 0;
  const baseWeight = tier === "large" ? amountCents * 2 : amountCents;
  const balanceWeight = balanceCents * 2; // unified 2× for medium & large
  return baseWeight + balanceWeight + shareBoosts * amountCents;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/draw-v2.ts
git commit -m "feat: fixed voucher amounts (20/50/100/200) + balance weight 2x

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Update VoucherTierSelector — Add S$200

**Files:**
- Modify: `src/components/customer/VoucherTierSelector.tsx`

- [ ] **Step 1: Add S$200 tier**

In the `TIERS` array, add S$200 after S$100. Also update grid to 4 columns:

```typescript
const TIERS: TierOption[] = [
  { value: 20, label: "S$20", descKey: "voucher.smallTier.desc", gradient: "from-slate-400 to-slate-500", bg: "bg-slate-50", icon: "☕" },
  { value: 50, label: "S$50", descKey: "voucher.mediumTier.desc", gradient: "from-amber-400 to-amber-500", bg: "bg-amber-50", icon: "🎫", badge: "🎯" },
  { value: 100, label: "S$100", descKey: "voucher.largeTier.desc", gradient: "from-violet-500 to-violet-600", bg: "bg-violet-50", icon: "💎", badge: "2×" },
  { value: 200, label: "S$200", descKey: "voucher.megaTier.desc", gradient: "from-pink-500 to-rose-600", bg: "bg-rose-50", icon: "👑", badge: "MAX" },
];
```

Change `grid-cols-3` to `grid-cols-4`:

```tsx
<div className="grid grid-cols-4 gap-2">
```

- [ ] **Step 2: Commit**

```bash
git add src/components/customer/VoucherTierSelector.tsx
git commit -m "feat: add S$200 voucher tier option

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Pass balanceCents to Weight in Purchase API

**Files:**
- Modify: `src/app/api/voucher/purchase/route.ts`

- [ ] **Step 1: Pass balanceCents to calculateTierWeight**

Find the line:

```typescript
const weight = calculateTierWeight(amountCents, tier.tier);
```

Replace with:

```typescript
const weight = calculateTierWeight(amountCents, tier.tier, balanceCents);
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/voucher/purchase/route.ts
git commit -m "feat: pass balanceCents to weight calculation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Update InstantPrizePreview Tier Labels

**Files:**
- Modify: `src/components/customer/InstantPrizePreview.tsx`

- [ ] **Step 1: Update TIER_LABELS for fixed amounts**

Replace the existing `TIER_LABELS`:

```typescript
const TIER_LABELS: Record<string, { emoji: string; labelZh: string; labelEn: string }> = {
  small: { emoji: "☕", labelZh: "小额券 S$20", labelEn: "Small S$20" },
  medium: { emoji: "🎫", labelZh: "中额券 S$50", labelEn: "Medium S$50" },
  large: { emoji: "💎", labelZh: "大额券 S$100", labelEn: "Large S$100" },
};
```

The component iterates over `DEFAULT_VOUCHER_TIERS` which now has 4 entries (S$100 and S$200 both map to "large"). The comparison grid will show 4 columns naturally.

- [ ] **Step 2: Commit**

```bash
git add src/components/customer/InstantPrizePreview.tsx
git commit -m "feat: update tier labels for fixed voucher amounts

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: i18n — Add Marketplace + Tier Translations

**Files:**
- Modify: `src/lib/i18n.ts`

- [ ] **Step 1: Add zh translations**

In the zh section, add after the existing V2 voucher lines:

```typescript
  // ── 活动市场 ──
  "market.title": "🎰 活动市场",
  "market.subtitle": "平台策划 · 一键参与 · 共享大奖池",
  "market.noCampaigns": "暂无可用活动",
  "market.noCampaignsHint": "平台正在筹备新活动，敬请期待",
  "market.grand": "大奖",
  "market.joined": "已参与",
  "market.join": "参与",
  "market.stores": "家店",
  "market.storesUnit": "家店参与",
  "market.pool": "奖池",
  "market.daysLeft": "剩余 {days} 天",
  "market.ending": "即将结束",
  "market.back": "返回",
  
  // ── 档位描述 ──
  "voucher.megaTier.desc": "超大额 · 最高权重",
```

- [ ] **Step 2: Add en translations**

In the en section, add:

```typescript
  // ── Campaign Market ──
  "market.title": "🎰 Campaign Market",
  "market.subtitle": "Platform campaigns · Join in one tap · Shared pool",
  "market.noCampaigns": "No campaigns available",
  "market.noCampaignsHint": "New campaigns coming soon",
  "market.grand": "Grand",
  "market.joined": "Joined",
  "market.join": "Join",
  "market.stores": "stores",
  "market.storesUnit": "stores",
  "market.pool": "Pool",
  "market.daysLeft": "{days} days left",
  "market.ending": "Ending soon",
  "market.back": "Back",
  
  // ── Tier descriptions ──
  "voucher.megaTier.desc": "Mega · Max Weight",
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n.ts
git commit -m "feat: add marketplace and mega tier translations

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Platform Auto-Joinable

**Files:**
- Modify: `src/app/api/business/campaigns/route.ts`

- [ ] **Step 1: Add isPlatformAccount helper and modify POST**

After the existing imports, add the helper function:

```typescript
function isPlatformAccount(email: string): boolean {
  const platformEmail = process.env.PLATFORM_ACCOUNT_EMAIL;
  if (!platformEmail) return false;
  return email === platformEmail;
}
```

In the POST handler, after `const body = await request.json();`, fetch the user's email:

```typescript
const user = await prisma.user.findUnique({
  where: { id: session.userId },
  select: { email: true },
});
if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
const isPlatform = isPlatformAccount(user.email);
```

In the `prisma.campaign.create` data object, replace:

```typescript
joinable: joinable || false,
```

With:

```typescript
joinable: isPlatform,
joinCount: 0,
```

The `joinable` destructured from body can be removed:

```typescript
const { name, description, type, color, startDate, endDate, budgetCents, tags, drawDate, minSpendCents, maxEntries, drawMethod, entryMethod, receiptMinSpend, ticketsPerUnit, budgetPercent, slug, allowCollaboration } = body;
```

(Remove `joinable` from the destructured list)

- [ ] **Step 2: Commit**

```bash
git add src/app/api/business/campaigns/route.ts
git commit -m "feat: platform account campaigns auto joinable

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Marketplace API

**Files:**
- Create: `src/app/api/business/campaigns/market/route.ts`

- [ ] **Step 1: Create market API route**

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { prisma } = await import("@/lib/db");
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";

  const campaigns = await prisma.campaign.findMany({
    where: {
      joinable: true,
      status: "active",
      endDate: { gte: new Date() },
      businessId: { not: session.userId },
      ...(search ? { name: { contains: search } } : {}),
    },
    include: {
      business: { select: { businessName: true, businessSlug: true } },
      prizes: { select: { id: true, name: true, icon: true, valueCents: true }, orderBy: { weight: "desc" }, take: 3 },
    },
    orderBy: { joinCount: "desc" },
  });

  // Mark which campaigns this business has already joined
  const myStores = await prisma.store.findMany({
    where: { businessId: session.userId },
    select: { id: true },
  });
  const myStoreIds = myStores.map((s) => s.id);

  const data = campaigns.map((c) => {
    let storeIds: string[] = [];
    try { storeIds = JSON.parse(c.storeIds || "[]"); } catch {}
    const isJoined = myStoreIds.some((sid) => storeIds.includes(sid));

    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      color: c.color,
      description: c.description,
      business: c.business,
      prizeCount: c.prizes.length,
      topPrize: c.prizes[0] || null,
      instantPoolCents: c.instantPoolCents || 0,
      participantCount: c.joinCount || 0,
      endDate: c.endDate.toISOString(),
      myStatus: isJoined ? "joined" : null,
    };
  });

  return NextResponse.json({ data });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/business/campaigns/market/route.ts
git commit -m "feat: marketplace API - list joinable campaigns

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Join + Leave APIs

**Files:**
- Create: `src/app/api/business/campaigns/[id]/join/route.ts`
- Create: `src/app/api/business/campaigns/[id]/leave/route.ts`

- [ ] **Step 1: Create join API route**

`src/app/api/business/campaigns/[id]/join/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const { prisma } = await import("@/lib/db");

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign || !campaign.joinable || campaign.status !== "active") {
    return NextResponse.json({ error: "活动不可参与" }, { status: 400 });
  }
  if (new Date() > campaign.endDate) {
    return NextResponse.json({ error: "活动已结束" }, { status: 400 });
  }

  const myStores = await prisma.store.findMany({
    where: { businessId: session.userId },
    select: { id: true },
  });
  const myStoreIds = myStores.map((s) => s.id);

  let currentStoreIds: string[] = [];
  try { currentStoreIds = JSON.parse(campaign.storeIds || "[]"); } catch {}

  if (myStoreIds.some((sid) => currentStoreIds.includes(sid))) {
    return NextResponse.json({ error: "已参与该活动" }, { status: 409 });
  }

  const updatedStoreIds = [...currentStoreIds, ...myStoreIds];

  await prisma.campaign.update({
    where: { id },
    data: {
      storeIds: JSON.stringify(updatedStoreIds),
      joinCount: { increment: 1 },
    },
  });

  return NextResponse.json({ data: { status: "joined", storeCount: myStoreIds.length } });
}
```

- [ ] **Step 2: Create leave API route**

`src/app/api/business/campaigns/[id]/leave/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const { prisma } = await import("@/lib/db");

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "活动不存在" }, { status: 404 });
  }

  const myStores = await prisma.store.findMany({
    where: { businessId: session.userId },
    select: { id: true },
  });
  const myStoreIds = myStores.map((s) => s.id);

  let currentStoreIds: string[] = [];
  try { currentStoreIds = JSON.parse(campaign.storeIds || "[]"); } catch {}

  const updatedStoreIds = currentStoreIds.filter((sid) => !myStoreIds.includes(sid));

  if (updatedStoreIds.length === currentStoreIds.length) {
    return NextResponse.json({ error: "未参与该活动" }, { status: 400 });
  }

  await prisma.campaign.update({
    where: { id },
    data: {
      storeIds: JSON.stringify(updatedStoreIds),
      joinCount: { decrement: 1 },
    },
  });

  return NextResponse.json({ data: { status: "left" } });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/business/campaigns/[id]/join/route.ts src/app/api/business/campaigns/[id]/leave/route.ts
git commit -m "feat: join and leave APIs for marketplace campaigns

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: JoinButton Client Component

**Files:**
- Create: `src/app/business/campaigns/market/JoinButton.tsx`

- [ ] **Step 1: Create JoinButton**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface JoinButtonProps {
  campaignId: string;
  label: string;
}

export function JoinButton({ campaignId, label }: JoinButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleJoin() {
    setLoading(true);
    const res = await fetch(`/api/business/campaigns/${campaignId}/join`, { method: "POST" });
    if (res.ok) {
      router.refresh();
    } else {
      const d = await res.json();
      alert(d.error || "Join failed");
    }
    setLoading(false);
  }

  return (
    <button
      onClick={handleJoin}
      disabled={loading}
      className="px-4 py-1.5 bg-[#1A6EFF] text-white rounded-full text-xs font-medium disabled:opacity-50"
    >
      {loading ? "..." : label}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/business/campaigns/market/JoinButton.tsx
git commit -m "feat: client join button for marketplace page

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: Marketplace Page

**Files:**
- Create: `src/app/business/campaigns/market/page.tsx`

- [ ] **Step 1: Create marketplace page**

```tsx
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cookies } from "next/headers";
import Link from "next/link";
import { JoinButton } from "./JoinButton";

export default async function CampaignMarketPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const campaigns = await prisma.campaign.findMany({
    where: {
      joinable: true,
      status: "active",
      endDate: { gte: new Date() },
      businessId: { not: session.userId },
    },
    include: {
      business: { select: { businessName: true, businessSlug: true } },
      prizes: { select: { id: true, name: true, icon: true }, orderBy: { weight: "desc" }, take: 3 },
    },
    orderBy: { joinCount: "desc" },
  });

  const myStores = await prisma.store.findMany({
    where: { businessId: session.userId },
    select: { id: true },
  });
  const myStoreIds = myStores.map((s) => s.id);

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
        <div className="flex items-center gap-2">
          <Link href="/business" className="text-xs text-slate-500">← {lang === "zh" ? "返回" : "Back"}</Link>
        </div>
        <h1 className="text-lg font-semibold mt-1">
          {lang === "zh" ? "🎰 活动市场" : "🎰 Campaign Market"}
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {lang === "zh" ? "平台策划 · 一键参与 · 共享大奖池" : "Platform campaigns · Join in one tap · Shared pool"}
        </p>
      </div>

      <div className="px-4 mt-3 space-y-3">
        {campaigns.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-5xl mb-4">🎰</p>
            <p className="text-sm">{lang === "zh" ? "暂无可用活动" : "No campaigns available"}</p>
            <p className="text-xs mt-1">
              {lang === "zh" ? "平台正在筹备新活动，敬请期待" : "New campaigns coming soon"}
            </p>
          </div>
        ) : (
          campaigns.map((camp) => {
            let storeIds: string[] = [];
            try { storeIds = JSON.parse(camp.storeIds || "[]"); } catch {}
            const isJoined = myStoreIds.some((sid) => storeIds.includes(sid));
            const totalPoolSgd = ((camp.instantPoolCents || 0) / 100).toFixed(0);
            const daysLeft = Math.max(0, Math.ceil((camp.endDate.getTime() - Date.now()) / 86400000));
            const topPrize = camp.prizes[0];

            return (
              <Card key={camp.id} className={isJoined ? "border-green-200 bg-green-50/30" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 truncate">{camp.name}</span>
                        {isJoined && <Badge variant="green" size="sm">{lang === "zh" ? "已参与" : "Joined"}</Badge>}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {camp.business?.businessName || "WeMembers"}
                        {" · "}{camp.joinCount || 0} {lang === "zh" ? "家店" : "stores"}
                        {" · "}{lang === "zh" ? "奖池" : "Pool"} S${totalPoolSgd}
                      </p>
                    </div>
                    {camp.color && (
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: camp.color }} />
                    )}
                  </div>

                  {topPrize && (
                    <div className="flex items-center gap-1.5 mb-2 text-xs">
                      <span>{topPrize.icon}</span>
                      <span className="text-amber-600 font-medium">
                        {lang === "zh" ? "大奖" : "Grand"}: {topPrize.name}
                      </span>
                      {camp.prizes.length > 1 && (
                        <span className="text-slate-300">+{camp.prizes.length - 1}</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {daysLeft > 0
                        ? (lang === "zh" ? `剩余 ${daysLeft} 天` : `${daysLeft} days left`)
                        : (lang === "zh" ? "即将结束" : "Ending soon")}
                    </span>
                    {isJoined ? (
                      <span className="text-green-600 font-medium">✓ {lang === "zh" ? "已参与" : "Joined"}</span>
                    ) : (
                      <JoinButton
                        campaignId={camp.id}
                        label={lang === "zh" ? "参与" : "Join"}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/business/campaigns/market/page.tsx
git commit -m "feat: marketplace page - browse and join campaigns

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: Dashboard Entry — Marketplace Card

**Files:**
- Modify: `src/app/business/page.tsx`

- [ ] **Step 1: Add count query and entry card**

In the dashboard page, add a campaign count query alongside the existing Promise.all. After the `recentActivity` query, add:

```typescript
const marketCampaignCount = await prisma.campaign.count({
  where: {
    joinable: true,
    status: "active",
    endDate: { gte: new Date() },
    businessId: { not: user.id },
  },
});
```

In the quick actions grid (the `grid grid-cols-2 gap-2` section), add a new card after the existing 4:

```tsx
{
  icon: "🎰",
  label: lang === "zh" ? "参与活动" : "Join Campaigns",
  desc: lang === "zh"
    ? `${marketCampaignCount} 个活动可参与`
    : `${marketCampaignCount} campaigns available`,
  href: "/business/campaigns/market",
},
```

- [ ] **Step 2: Commit**

```bash
git add src/app/business/page.tsx
git commit -m "feat: add marketplace entry to business dashboard

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 13: Environment Config

**Files:**
- Modify: `.env`
- Modify: `docker-compose.prod.yml` (already has MESSAGING_MODE section)

- [ ] **Step 1: Add PLATFORM_ACCOUNT_EMAIL to .env**

In `.env`, add after the MESSAGING_MODE section:

```bash
# 平台账号 (活动市场创建者)
PLATFORM_ACCOUNT_EMAIL="demo:platform@wemembers.store"
```

- [ ] **Step 2: Add to docker-compose.prod.yml**

In `docker-compose.prod.yml`, add after `BLOCKED_CONTACTS`:

```yaml
      PLATFORM_ACCOUNT_EMAIL: ${PLATFORM_ACCOUNT_EMAIL:-wemembers.platform@wemembers.store}
```

- [ ] **Step 3: Commit**

```bash
git add .env docker-compose.prod.yml
git commit -m "feat: add PLATFORM_ACCOUNT_EMAIL env var

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review

- [x] Spec coverage: All sections mapped to tasks — market page (T11), dashboard entry (T12), join/leave (T9), platform auto-joinable (T7), fixed amounts (T2, T3), balance weight (T2, T4)
- [x] No TBD/TODO placeholders
- [x] Type consistency: `calculateTierWeight` signature matches across T2 and T4; `JoinButton` props match T10→T11 usage
- [x] No missing steps — each task has git commit

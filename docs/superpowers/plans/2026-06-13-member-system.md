# 商家会员系统 + 门店架构 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建门店+店员体系（公司→门店→店员），引入 staff 角色，权限按角色+数据归属控制；同时增强会员系统（等级配置、积分流水、自动积分、签到联动）。

**Architecture:** Prisma 新增 Store、MembershipTierConfig、PointsLog 三个模型，Membership 增 tier、RedemptionLog/PointsLog 增 storeId、User 增 storeId。API 层按 role 注入 storeId 过滤，UI 层按 role 切换导航。一个代码路径，无代码分裂。

**Tech Stack:** Next.js 16 + Prisma + SQLite + TypeScript + qrcode

---

## 文件清单

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `prisma/schema.prisma` | 新增 3 模型，改 4 模型 |
| 新增 | `src/lib/points.ts` | 积分计算、等级检查、积分流水 |
| 修改 | `src/lib/auth.ts` | JWTPayload 加 storeId |
| 修改 | `src/middleware.ts` | 公开路由、staff 角色路由 |
| 新增 | `src/app/api/business/stores/route.ts` | 门店列表/创建 |
| 新增 | `src/app/api/business/stores/[id]/route.ts` | 门店编辑/删除 |
| 新增 | `src/app/api/business/stores/[id]/staff/route.ts` | 邀请店员 |
| 新增 | `src/app/api/business/members/config/route.ts` | 等级配置 |
| 新增 | `src/app/api/business/members/[id]/points-log/route.ts` | 积分流水 |
| 新增 | `src/app/api/store/qr/route.ts` | 门店二维码 |
| 修改 | `src/app/api/auth/register/route.ts` | 公司注册自动创建默认门店 |
| 修改 | `src/app/api/business/members/route.ts` | 搜索/筛选/排序 + staff 过滤 |
| 修改 | `src/app/api/business/members/[id]/route.ts` | 手动加减积分 + storeId |
| 修改 | `src/app/api/business/redeem/route.ts` | 核销自动积分 + storeId |
| 修改 | `src/app/api/game/checkin/route.ts` | 签到积分计入商家 |
| 修改 | `src/app/business/layout.tsx` | 角色不同导航 |
| 新增 | `src/app/business/stores/page.tsx` | 门店管理（老板） |
| 新增 | `src/app/business/store/page.tsx` | 本店设置+二维码（店员） |
| 修改 | `src/app/business/members/page.tsx` | 增强搜索/筛选/排序 |
| 修改 | `src/app/business/members/[id]/page.tsx` | 积分流水+等级进度 |
| 新增 | `src/app/business/members/[id]/TierProgress.tsx` | 等级进度条 |
| 新增 | `src/app/business/members/[id]/PointsActions.tsx` | 手动加减积分 |
| 新增 | `src/app/business/members/config/page.tsx` | 等级配置页 |
| 新增 | `src/app/business/members/config/TierConfigForm.tsx` | 等级配置表单 |
| 新增 | `src/app/store/[slug]/page.tsx` | 门店公开页 |

---

### Task 1: Prisma Schema 完整更新

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: User 模型增加 storeId**

```diff
 model User {
   // ... 已有字段
+  storeId          String?
   // ...

   // 在 relations 区加：
+  store            Store?    @relation("StoreStaff", fields: [storeId], references: [id])
+  managedStores    Store[]   @relation("BusinessStores")
 }
```

- [ ] **Step 2: Membership 增加 tier 和 pointsLogs**

```diff
 model Membership {
   // ... 已有字段
   isFavorite   Boolean  @default(false)
+  tier         String   @default("regular")
   createdAt    DateTime @default(now())

   business     User     @relation("BusinessMemberships", fields: [businessId], references: [id])
   customer     User     @relation("CustomerMemberships", fields: [customerId], references: [id])
+  pointsLogs   PointsLog[]

   @@unique([businessId, customerId])
 }
```

- [ ] **Step 3: RedemptionLog 增加 storeId**

```diff
 model RedemptionLog {
   // ... 已有字段
   staffUserId      String?
+  storeId          String?
   location         String?
   redeemedAt       DateTime @default(now())

   business         User     @relation("BusinessRedemptions", fields: [businessId], references: [id])
   claim            CustomerCoupon @relation(fields: [customerCouponId], references: [id])
+  store            Store?   @relation("StoreRedemptions", fields: [storeId], references: [id])
 }
```

- [ ] **Step 4: 新增三个模型（Membership 和 Coupon 之间）**

```prisma
// ──── 门店 ────

model Store {
  id          String   @id @default(cuid())
  businessId  String
  name        String               // "星巴克·国贸店"
  slug        String   @unique
  address     String?
  phone       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  business    User     @relation("BusinessStores", fields: [businessId], references: [id])
  staff       User[]   @relation("StoreStaff")
  redemptions RedemptionLog[] @relation("StoreRedemptions")

  @@unique([businessId, name])
}

// ──── 会员等级配置 ────

model MembershipTierConfig {
  id             String  @id @default(cuid())
  businessId     String
  tier           String
  name           String               // "金卡会员"
  pointsRequired Int
  color          String?
  benefits       String?              // JSON: ["9折优惠","生日礼"]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([businessId, tier])
}

// ──── 积分流水 ────

model PointsLog {
  id           String   @id @default(cuid())
  membershipId String
  storeId      String?
  amount       Int                    // 正=获得, 负=消耗
  type         String                 // checkin | redeem_bonus | manual_grant | manual_deduct
  reason       String
  balanceAfter Int
  createdAt    DateTime @default(now())

  membership   Membership @relation(fields: [membershipId], references: [id])
  store        Store?     @relation(fields: [storeId], references: [id])
}
```

- [ ] **Step 5: 推送并重新生成**

```bash
npx prisma db push
npx prisma generate
```

Expected: "Your database is now in sync with your schema." + no errors.

---

### Task 2: 积分工具库

**Files:**
- Create: `src/lib/points.ts`

```typescript
import { prisma } from "@/lib/db";

export const DEFAULT_TIER_CONFIGS = [
  { tier: "regular", name: "普通会员", pointsRequired: 0, color: "#94A3B8", benefits: "[]" },
  { tier: "silver", name: "银卡会员", pointsRequired: 500, color: "#64748B", benefits: "[]" },
  { tier: "gold", name: "金卡会员", pointsRequired: 2000, color: "#F59E0B", benefits: "[]" },
  { tier: "platinum", name: "铂金会员", pointsRequired: 10000, color: "#8B5CF6", benefits: "[]" },
] as const;

export async function getTierConfigs(businessId: string) {
  const configs = await prisma.membershipTierConfig.findMany({
    where: { businessId },
    orderBy: { pointsRequired: "asc" },
  });
  if (configs.length === 4) return configs;

  const existingTiers = new Set(configs.map((c) => c.tier));
  return [
    ...configs,
    ...DEFAULT_TIER_CONFIGS.filter((d) => !existingTiers.has(d.tier)).map((d) => ({
      id: "", businessId, ...d, createdAt: new Date(), updatedAt: new Date(),
    })),
  ].sort((a, b) => a.pointsRequired - b.pointsRequired);
}

export function calculateTier(points: number, configs: { tier: string; pointsRequired: number }[]) {
  const sorted = [...configs].sort((a, b) => b.pointsRequired - a.pointsRequired);
  for (const c of sorted) { if (points >= c.pointsRequired) return c.tier; }
  return "regular";
}

export function getNextTier(points: number, configs: { tier: string; pointsRequired: number; name: string }[]) {
  const sorted = [...configs].sort((a, b) => a.pointsRequired - b.pointsRequired);
  for (const cfg of sorted) {
    if (points < cfg.pointsRequired) {
      const prev = sorted.filter(c => c.pointsRequired <= points).sort((a, b) => b.pointsRequired - a.pointsRequired)[0];
      const prevMin = prev?.pointsRequired ?? 0;
      const needed = cfg.pointsRequired - points;
      const range = cfg.pointsRequired - prevMin;
      return { tier: cfg.tier, name: cfg.name, pointsNeeded: needed, progress: range > 0 ? Math.round(((points - prevMin) / range) * 100) : 100 };
    }
  }
  return null;
}

export async function addPointsLog(params: {
  membershipId: string; storeId?: string; amount: number; type: string; reason: string;
}): Promise<number> {
  const membership = await prisma.membership.findUnique({ where: { id: params.membershipId }, select: { points: true } });
  if (!membership) throw new Error("Membership not found");
  const balanceAfter = membership.points + params.amount;
  await prisma.pointsLog.create({
    data: { membershipId: params.membershipId, storeId: params.storeId || null, amount: params.amount, type: params.type, reason: params.reason, balanceAfter },
  });
  return balanceAfter;
}

export async function checkAndUpgradeTier(membershipId: string, businessId: string) {
  const [membership, configs] = await Promise.all([
    prisma.membership.findUnique({ where: { id: membershipId }, select: { points: true, tier: true } }),
    getTierConfigs(businessId),
  ]);
  if (!membership) return null;
  const newTier = calculateTier(membership.points, configs);
  if (newTier !== membership.tier) {
    await prisma.membership.update({ where: { id: membershipId }, data: { tier: newTier } });
    return newTier;
  }
  return null;
}
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit 2>&1 | grep "points.ts"
```

Expected: no output.

---

### Task 3: Auth 更新 — JWTPayload 加 storeId

**Files:**
- Modify: `src/lib/auth.ts:12-14`

```diff
 export type JWTPayload = {
   userId: string;
   role: "admin" | "business" | "customer" | "staff";
+  storeId?: string;
 };
```

同时更新 `middleware.ts` 的本地类型：`let payload: { userId: string; role: string; storeId?: string } | null = null;`

---

### Task 4: Middleware 更新 — staff 角色路由 + 公开路由

**Files:**
- Modify: `src/middleware.ts`

完整重写 middleware：

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

const PUBLIC_STARTS = ["/shop", "/coupons", "/store", "/auth", "/_next", "/api", "/favicon.ico"];
const STAFF_ROUTES = ["/business/scan", "/business/members", "/business/store", "/business"];
const STAFF_BLOCKED = ["/business/coupons", "/business/campaigns", "/business/stores", "/business/settings", "/business/tokens"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname.startsWith("/api/") || pathname.startsWith("/favicon.ico")) {
    return NextResponse.next();
  }

  const token = request.cookies.get("gwm_token")?.value;
  let payload: { userId: string; role: string; storeId?: string } | null = null;
  if (token) payload = await verifyToken(token);

  // 公开路由
  if (PUBLIC_STARTS.some((r) => pathname.startsWith(r)) && !pathname.startsWith("/business")) {
    return NextResponse.next();
  }

  // 已登录访问登录页
  if (pathname.startsWith("/auth/")) {
    if (payload) {
      const map: Record<string, string> = { admin: "/admin", business: "/business", customer: "/home", staff: "/business" };
      return NextResponse.redirect(new URL(map[payload.role] || "/home", request.url));
    }
    return NextResponse.next();
  }

  if (!payload) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const { role } = payload;

  // Admin
  if (pathname.startsWith("/admin/") && role !== "admin") {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  // Business 区域
  if (pathname.startsWith("/business/")) {
    if (role !== "business" && role !== "staff") {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }
    // Staff 不能访问特定页面
    if (role === "staff" && STAFF_BLOCKED.some((r) => pathname.startsWith(r))) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // Customer 路由
  const customerRoutes = ["/home", "/wallet", "/card", "/profile", "/my-tokens", "/redeem"];
  if (customerRoutes.some((r) => pathname.startsWith(r)) && role !== "customer") {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico)$).*)"],
};
```

---

### Task 5: 公司注册自动创建默认门店

**Files:**
- Modify: `src/app/api/auth/register/route.ts`

在用户创建之后、签发 JWT 之前，加：

```typescript
    // 创建默认门店
    let storeSlug: string | null = null;
    let storeId: string | null = null;
    if (role === "business" && businessName) {
      const store = await prisma.store.create({
        data: {
          businessId: user.id,
          name: businessName,
          slug: businessSlug!,
        },
      });
      storeSlug = store.slug;
      storeId = store.id;
    }
```

JWT sign 时加上：`const token = await signToken({ userId: user.id, role: user.role as JWTPayload["role"] });`

---

### Task 6: 门店管理 API

**Files:**
- Create: `src/app/api/business/stores/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/business/stores
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "无权操作" }, { status: 403 });
  const stores = await prisma.store.findMany({
    where: { businessId: session.userId },
    include: { staff: { select: { id: true, displayName: true, phone: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ data: stores });
}

// POST /api/business/stores
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "无权操作" }, { status: 403 });
  const { name, address, phone } = await request.json();
  if (!name) return NextResponse.json({ error: "请填写门店名称" }, { status: 400 });

  const company = await prisma.user.findUnique({ where: { id: session.userId }, select: { businessName: true } });
  const slug = (name.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).substring(2, 6));

  const store = await prisma.store.create({
    data: { businessId: session.userId, name, slug, address: address || null, phone: phone || null },
  });

  return NextResponse.json({ data: store });
}
```

**Files:**
- Create: `src/app/api/business/stores/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// PUT /api/business/stores/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "无权操作" }, { status: 403 });
  const { id } = await params;
  const body = await request.json();
  const store = await prisma.store.update({
    where: { id, businessId: session.userId },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.address !== undefined ? { address: body.address } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
    },
  });
  return NextResponse.json({ data: store });
}

// DELETE /api/business/stores/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "无权操作" }, { status: 403 });
  const { id } = await params;
  // 解绑店员
  await prisma.user.updateMany({ where: { storeId: id }, data: { storeId: null } });
  await prisma.store.delete({ where: { id, businessId: session.userId } });
  return NextResponse.json({ data: { success: true } });
}
```

**Files:**
- Create: `src/app/api/business/stores/[id]/staff/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// POST /api/business/stores/[id]/staff — 邀请店员
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "无权操作" }, { status: 403 });
  const { id: storeId } = await params;
  const { phone, displayName } = await request.json();
  if (!phone) return NextResponse.json({ error: "请提供手机号" }, { status: 400 });

  const store = await prisma.store.findUnique({ where: { id: storeId, businessId: session.userId } });
  if (!store) return NextResponse.json({ error: "门店不存在" }, { status: 404 });

  // 查找或创建店员用户
  let staffUser = await prisma.user.findUnique({ where: { phone } });
  if (staffUser && staffUser.role !== "customer") {
    return NextResponse.json({ error: "该用户已是其他角色" }, { status: 409 });
  }
  if (staffUser) {
    // 升级为 staff
    staffUser = await prisma.user.update({
      where: { id: staffUser.id },
      data: { role: "staff", storeId, displayName: displayName || staffUser.displayName },
    });
  } else {
    staffUser = await prisma.user.create({
      data: { phone, role: "staff", storeId, displayName: displayName || null, status: "active" },
    });
  }

  return NextResponse.json({ data: staffUser });
}
```

---

### Task 7: 门店二维码 API

**Files:**
- Create: `src/app/api/store/qr/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateQrCodeSvg } from "@/lib/qr";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  let storeSlug: string | null = null;

  if (session.role === "staff" && session.storeId) {
    const store = await prisma.store.findUnique({ where: { id: session.storeId }, select: { slug: true } });
    storeSlug = store?.slug || null;
  } else {
    // business — 取第一个门店或由 query 指定
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");
    if (storeId) {
      const store = await prisma.store.findUnique({ where: { id: storeId, businessId: session.userId }, select: { slug: true } });
      storeSlug = store?.slug || null;
    }
  }

  if (!storeSlug) return NextResponse.json({ error: "门店不存在" }, { status: 404 });

  const size = parseInt(new URL(request.url).searchParams.get("size") || "200");
  const origin = request.nextUrl.origin;
  const svg = await generateQrCodeSvg(`${origin}/store/${storeSlug}`, Math.min(size, 600));

  return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" } });
}
```

---

### Task 8: 等级配置 API

**Files:**
- Create: `src/app/api/business/members/config/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTierConfigs } from "@/lib/points";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "无权操作" }, { status: 403 });
  const configs = await getTierConfigs(session.userId);
  return NextResponse.json({ data: configs });
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "无权操作" }, { status: 403 });
  const { configs } = await request.json();
  if (!Array.isArray(configs) || configs.length !== 4) return NextResponse.json({ error: "必须提供全部4个等级" }, { status: 400 });

  await Promise.all(configs.map((c: any) =>
    prisma.membershipTierConfig.upsert({
      where: { businessId_tier: { businessId: session.userId, tier: c.tier } },
      create: { businessId: session.userId, tier: c.tier, name: c.name, pointsRequired: c.pointsRequired, color: c.color || null, benefits: typeof c.benefits === "string" ? c.benefits : JSON.stringify(c.benefits || []) },
      update: { name: c.name, pointsRequired: c.pointsRequired, color: c.color || null, benefits: typeof c.benefits === "string" ? c.benefits : JSON.stringify(c.benefits || []) },
    })
  ));

  return NextResponse.json({ data: { success: true } });
}
```

---

### Task 9: 积分流水 API

**Files:**
- Create: `src/app/api/business/members/[id]/points-log/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }
  const { id: customerId } = await params;
  const membership = await prisma.membership.findUnique({
    where: { businessId_customerId: { businessId: session.userId, customerId } },
    select: { id: true, businessId: true },
  });
  if (!membership) return NextResponse.json({ error: "会员不存在" }, { status: 404 });
  const logs = await prisma.pointsLog.findMany({
    where: { membershipId: membership.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json({ data: logs });
}
```

---

### Task 10: 增强会员 API — 列表查询

**Files:**
- Modify: `src/app/api/business/members/route.ts` — 只替换 GET 函数

```typescript
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const tier = searchParams.get("tier") || "";
  const sort = searchParams.get("sort") || "recent";
  const limit = 20;

  const where: any = { businessId: session.userId };
  if (search) {
    where.customer = { OR: [{ displayName: { contains: search } }, { phone: { contains: search } }] };
  }
  if (tier) where.tier = tier;

  let orderBy: any = { createdAt: "desc" };
  if (sort === "points") orderBy = { points: "desc" };
  if (sort === "visits") orderBy = { visitsCount: "desc" };
  if (sort === "tier") orderBy = { points: "desc" };

  const members = await prisma.membership.findMany({
    where,
    include: { customer: { select: { id: true, displayName: true, phone: true, membershipTier: true } } },
    orderBy,
    take: limit,
  });

  return NextResponse.json({ data: members });
}
```

POST 保持原有不变。

---

### Task 11: 增强会员操作 API — 手动加减积分

**Files:**
- Modify: `src/app/api/business/members/[id]/route.ts` — 只替换 POST

```typescript
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id: customerId } = await params;
  const { amount, reason } = await request.json();
  if (!amount || amount === 0) return NextResponse.json({ error: "无效积分数量" }, { status: 400 });

  const membership = await prisma.membership.findUnique({
    where: { businessId_customerId: { businessId: session.userId, customerId } },
  });
  if (!membership) return NextResponse.json({ error: "会员不存在" }, { status: 404 });

  if (amount < 0 && membership.points + amount < 0) {
    return NextResponse.json({ error: "积分不足" }, { status: 400 });
  }

  const type = amount > 0 ? "manual_grant" : "manual_deduct";
  const [updated] = await Promise.all([
    prisma.membership.update({ where: { id: membership.id }, data: { points: { increment: amount } } }),
    prisma.user.update({ where: { id: customerId }, data: { pointsBalance: { increment: amount }, ...(amount > 0 ? { lifetimePoints: { increment: amount } } : {}) } }),
  ]);

  const { addPointsLog, checkAndUpgradeTier } = await import("@/lib/points");
  await addPointsLog({ membershipId: membership.id, storeId: session.storeId, amount, type, reason: reason || (amount > 0 ? "手动发放" : "手动扣减") });
  const upgraded = await checkAndUpgradeTier(membership.id, session.userId);

  return NextResponse.json({ data: { success: true, points: updated.points, ...(upgraded ? { tierUpgraded: upgraded } : {}) } });
}
```

GET 和 PUT 保持原有。

---

### Task 12: 核销联动 — 自动积分 + storeId

**Files:**
- Modify: `src/app/api/business/redeem/route.ts`

在核销 API 中，`await prisma.customerCoupon.update(...)` 之后、return 之前插入积分逻辑：

```typescript
    // 自动积分
    let pointsAwarded = 0;
    let tierUpgraded: string | undefined;

    const membership = await prisma.membership.findUnique({
      where: { businessId_customerId: { businessId: session.userId, customerId: claim.customerId } },
    });

    if (membership) {
      const earnPoints = Math.round(claim.coupon.valueCents / 100);
      if (earnPoints > 0) {
        const { addPointsLog, checkAndUpgradeTier } = await import("@/lib/points");
        await prisma.membership.update({
          where: { id: membership.id },
          data: { points: { increment: earnPoints }, visitsCount: { increment: 1 } },
        });
        await addPointsLog({
          membershipId: membership.id,
          storeId: session.storeId,
          amount: earnPoints,
          type: "redeem_bonus",
          reason: `核销「${claim.coupon.title}」获得`,
        });
        const up = await checkAndUpgradeTier(membership.id, session.userId);
        if (up) tierUpgraded = up;
        pointsAwarded = earnPoints;
      }
    } else {
      await prisma.membership.create({
        data: { businessId: session.userId, customerId: claim.customerId, points: 0, visitsCount: 1 },
      });
    }
```

同时在 RedemptionLog.create 中加入 storeId：

```typescript
    storeId: session.storeId || null,
```

return data 增加：`pointsAwarded, tierUpgraded,`

同时，API 入口的 role 检查放宽为 business 或 staff：

```typescript
  if (!session || (session.role !== "business" && session.role !== "staff")) return ...
```

---

### Task 13: 签到联动 — 积分计入商家

**Files:**
- Modify: `src/app/api/game/checkin/route.ts`

在 POST 的 `await Promise.all([...])` 之后、return 之前插入：

```typescript
  let businessPointsEarned = 0;
  try {
    const lastRedemption = await prisma.redemptionLog.findFirst({
      where: { customerId: session.userId },
      orderBy: { redeemedAt: "desc" },
      select: { businessId: true },
    });
    if (lastRedemption) {
      const membership = await prisma.membership.findUnique({
        where: { businessId_customerId: { businessId: lastRedemption.businessId, customerId: session.userId } },
      });
      if (membership) {
        const { addPointsLog } = await import("@/lib/points");
        await prisma.membership.update({ where: { id: membership.id }, data: { points: { increment: total } } });
        await addPointsLog({ membershipId: membership.id, amount: total, type: "checkin", reason: `连续签到第${newStreak}天` });
        businessPointsEarned = total;
      }
    }
  } catch { /* 不阻塞签到主流程 */ }
```

return data 加：`businessPointsEarned: businessPointsEarned > 0 ? businessPointsEarned : undefined,`

---

### Task 14: 商家导航 — 角色不同底部 Tab

**Files:**
- Modify: `src/app/business/layout.tsx`

```typescript
import { getSession } from "@/lib/auth";
import { BottomNav } from "@/components/ui/BottomNav";
import { redirect } from "next/navigation";

const businessTabs = [
  { icon: "📊", label: "概览", href: "/business" },
  { icon: "👥", label: "会员", href: "/business/members" },
  { icon: "🎫", label: "券管理", href: "/business/coupons" },
  { icon: "📅", label: "活动", href: "/business/campaigns" },
  { icon: "🏪", label: "门店", href: "/business/stores" },
];

const staffTabs = [
  { icon: "📊", label: "概览", href: "/business" },
  { icon: "📷", label: "核销", href: "/business/scan" },
  { icon: "👥", label: "会员", href: "/business/members" },
  { icon: "🏪", label: "本店", href: "/business/store" },
];

export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const tabs = session.role === "staff" ? staffTabs : businessTabs;

  return (
    <>
      <main className="pb-16 min-h-screen">{children}</main>
      <BottomNav tabs={tabs} />
    </>
  );
}
```

---

### Task 15: 门店管理页面（老板）

**Files:**
- Create: `src/app/business/stores/page.tsx`

服务端组件，读取门店列表 + 创建门店表单（客户端组件）。

```typescript
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StoreCreateForm } from "./StoreCreateForm";

export default async function StoresPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const stores = await prisma.store.findMany({
    where: { businessId: session.userId },
    include: { staff: { select: { id: true, displayName: true, phone: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
        <h1 className="text-lg font-semibold">门店管理</h1>
      </div>

      <div className="px-4 mt-4 space-y-4">
        <StoreCreateForm />

        {stores.map((store) => {
          const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          const storeUrl = `${origin}/store/${store.slug}`;
          return (
            <Card key={store.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">🏪 {store.name}</p>
                    {store.address && <p className="text-xs text-slate-400 mt-0.5">📍 {store.address}</p>}
                    {store.phone && <p className="text-xs text-slate-400">📞 {store.phone}</p>}
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/store/qr?storeId=${store.id}&size=80`} alt="QR" className="w-20 h-20 rounded-lg border" />
                </div>
                <p className="text-[10px] text-slate-400 font-mono break-all mb-2">{storeUrl}</p>
                {store.staff.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {store.staff.map((s) => (
                      <Badge key={s.id} variant="slate" size="sm">{s.displayName || s.phone}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">暂无店员</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

**Files:**
- Create: `src/app/business/stores/StoreCreateForm.tsx` — 客户端组件，新建门店表单

```typescript
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";

export function StoreCreateForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full p-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:border-[#1A6EFF] hover:text-[#1A6EFF]">
        + 新增门店
      </button>
    );
  }

  async function handleCreate() {
    if (!name) return;
    setLoading(true);
    const res = await fetch("/api/business/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, address, phone }),
    });
    if (res.ok) {
      setOpen(false); setName(""); setAddress(""); setPhone("");
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <Input label="门店名称" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：星巴克·国贸店" />
        <Input label="地址" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="选填" />
        <Input label="电话" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="选填" />
        <div className="flex gap-2">
          <Button className="flex-1" onClick={handleCreate} loading={loading}>创建</Button>
          <button onClick={() => setOpen(false)} className="flex-1 h-10 text-sm text-slate-500 bg-slate-100 rounded-full">取消</button>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

### Task 16: 本店设置页面（店员）

**Files:**
- Create: `src/app/business/store/page.tsx`

```typescript
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";

export default async function StoreSettingsPage() {
  const session = await getSession();
  if (!session || session.role !== "staff" || !session.storeId) redirect("/auth/login");

  const store = await prisma.store.findUnique({ where: { id: session.storeId } });
  if (!store) return <div className="p-8 text-center text-slate-400">门店不存在</div>;

  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const storeUrl = `${origin}/store/${store.slug}`;

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100">
        <h1 className="text-lg font-semibold">本店信息</h1>
      </div>
      <div className="px-4 mt-4 space-y-4">
        {/* 门店信息 */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">🏪 {store.name}</h3>
            {store.address && <p className="text-xs text-slate-500">📍 {store.address}</p>}
            {store.phone && <p className="text-xs text-slate-500">📞 {store.phone}</p>}
          </CardContent>
        </Card>

        {/* QR Code */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">📱 门店二维码</h3>
            <p className="text-xs text-slate-500 mb-4">客户扫码进入本店页面，查看并领取代金券</p>
            <div className="flex justify-center">
              <div className="w-48 h-48 bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/api/store/qr?size=192" alt="门店二维码" className="w-full h-full" />
              </div>
            </div>
            <div className="mt-3 bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">本店链接</p>
              <p className="text-sm font-mono text-slate-700 break-all">{storeUrl}</p>
            </div>
          </CardContent>
        </Card>

        {/* 使用建议 */}
        <div className="p-4 bg-[#1A6EFF]/5 rounded-xl">
          <h4 className="text-xs font-semibold text-[#1A6EFF] mb-2">💡 使用说明</h4>
          <ul className="text-xs text-slate-500 space-y-1">
            <li>• 打印二维码贴在收银台或桌面</li>
            <li>• 客户扫码即可领券并成为会员</li>
            <li>• 核销入口：「📷 核销」底部 Tab</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
```

---

### Task 17: 门店公开页

**Files:**
- Create: `src/app/store/[slug]/page.tsx`

内容类似 `/shop/[slug]/page.tsx`，但展示的是门店名 + 门店地址 + 公司所有可用券。模板：

```typescript
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { daysUntil } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await prisma.store.findUnique({
    where: { slug },
    include: { business: { select: { id: true, businessName: true, businessCategory: true } } },
  });
  if (!store) notFound();

  const coupons = await prisma.coupon.findMany({
    where: { businessId: store.business.id, status: "published", validUntil: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  const session = await getSession();
  const isLoggedIn = !!session;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-b from-[#1A6EFF] to-[#3B82F6] px-4 pt-8 pb-8 text-white">
        <div className="text-center">
          <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto text-3xl">🏪</div>
          <h1 className="text-xl font-bold mt-3">{store.name}</h1>
          <p className="text-white/60 text-xs mt-1">{store.business.businessName}</p>
          {store.address && <p className="text-white/60 text-xs mt-1">📍 {store.address}</p>}
        </div>
      </div>

      <div className="px-4 -mt-4 pb-8">
        <div className="bg-white rounded-t-2xl pt-5 px-1">
          <div className="flex items-center justify-between px-3 mb-3">
            <h2 className="text-base font-semibold text-slate-900">🎫 可领取代金券</h2>
            <span className="text-xs text-slate-400">{coupons.length}张</span>
          </div>

          {coupons.length > 0 ? (
            <div className="space-y-2 px-3">
              {coupons.map((c) => {
                const displayValue = c.type === "percentage" ? `${(c.valueCents / 100).toFixed(0)}折` : c.type === "free_item" ? "免单" : `¥${(c.valueCents / 100).toFixed(0)}`;
                const soldOut = c.remainingQuantity !== null && c.remainingQuantity <= 0;
                return (
                  <Link key={c.id} href={`/coupons/${c.id}`}>
                    <Card className={`hover:border-[#1A6EFF]/30 border-l-4 border-l-[#FF6B35] ${soldOut ? "opacity-50" : ""}`}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-base font-bold text-[#FF6B35]">{displayValue}</p>
                            <Badge variant="slate" size="sm">{c.pointsRequired}⭐</Badge>
                          </div>
                          <p className="text-sm font-medium text-slate-900 mt-1">{c.title}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">剩余 {c.remainingQuantity ?? "∞"} 张 · {daysUntil(c.validUntil)}天</p>
                        </div>
                        {!soldOut && <span className="px-3 py-1 bg-[#1A6EFF] text-white text-[10px] rounded-full shrink-0">领取</span>}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16"><p className="text-4xl mb-3">🎫</p><p className="text-sm text-slate-400">暂无可领取代金券</p></div>
          )}
        </div>

        {!isLoggedIn && coupons.length > 0 && (
          <div className="mx-3 mt-4 p-4 bg-[#1A6EFF]/5 rounded-xl text-center">
            <p className="text-sm text-slate-600">领取需要登录</p>
            <Link href={`/auth/login?redirect=/store/${store.slug}`} className="inline-block mt-2 px-6 py-2 bg-[#1A6EFF] text-white text-sm rounded-full">立即登录</Link>
          </div>
        )}

        <div className="text-center mt-6"><p className="text-[10px] text-slate-300">Powered by WeMembers</p></div>
      </div>
    </div>
  );
}
```

---

### Task 18: 会员列表页面增强

**Files:**
- Modify: `src/app/business/members/page.tsx`

完整的搜索+筛选+排序 UI，见计划原文 Task 8。

---

### Task 19: 会员详情页面增强

**Files:**
- Modify: `src/app/business/members/[id]/page.tsx` — 加积分流水、等级进度、手动积分操作
- Create: `src/app/business/members/[id]/TierProgress.tsx`
- Create: `src/app/business/members/[id]/PointsActions.tsx`

见计划原文 Task 9 的子组件。

---

### Task 20: 等级配置页面

**Files:**
- Create: `src/app/business/members/config/page.tsx`
- Create: `src/app/business/members/config/TierConfigForm.tsx`

见计划原文 Task 7。

---

### Task 21: 最终验证

- [ ] **Step 1: 编译检查**

```bash
npx tsc --noEmit
```

Expected: 只有之前已存在的 AI route error。

- [ ] **Step 2: Schema 验证**

```bash
npx prisma validate
npx prisma db push
```

- [ ] **Step 3: 启动 dev server 手动测试**

```bash
npm run dev
```

测试路径：
1. 注册公司 → 自动创建默认门店 → 进入设置页看到门店
2. 创建第二个门店、邀请店员
3. 店员登录 → 只有 4 个 Tab（概览/核销/会员/本店）
4. 店员核销 → 会员自动积分
5. 老板看会员详情 → 积分流水 + 等级进度
6. 老板配置等级规则
7. 客户扫码门店二维码 → 看到门店页 + 券

/**
 * Test helpers — create mock NextRequest/NextResponse, seed database, authenticate.
 */
import { PrismaClient } from "@prisma/client";
import { signToken } from "@/lib/auth";

import path from "path";

// Use the same worker-isolated DB as tests/setup.ts so helpers and tests
// always hit the same (per-worker) SQLite file.
const TEST_DB_PATH =
  process.env.DATABASE_URL ||
  "file:" +
    path.resolve(
      __dirname,
      `../prisma/test-${process.env.JEST_WORKER_ID || "0"}.db`
    );

export const testPrisma = new PrismaClient({
  datasources: { db: { url: TEST_DB_PATH } },
});

// ── Auth helpers ──

export async function createTestUser(overrides: Record<string, any> = {}) {
  return testPrisma.user.create({
    data: {
      phone: `+65${Math.floor(Math.random() * 90000000) + 10000000}`,
      role: overrides.role || "customer",
      displayName: overrides.displayName || "Test User",
      status: "active",
      ...overrides,
    },
  });
}

export async function createTestBusiness(overrides: Record<string, any> = {}) {
  const user = await createTestUser({
    role: "business",
    businessName: overrides.businessName || "Test Cafe",
    businessSlug: `test-cafe-${Date.now()}`,
    businessCategory: "cafe",
    ...overrides,
  });

  // Add TokenAccount
  await testPrisma.tokenAccount.create({
    data: { userId: user.id, balance: 10000, totalEarned: 10000 },
  });

  // Add default store
  const store = await testPrisma.store.create({
    data: {
      businessId: user.id,
      name: `${user.businessName} 总店`,
      slug: user.businessSlug!,
    },
  });

  return { user, store };
}

export async function signTestJwt(user: { id: string; role: string; storeId?: string }) {
  return signToken({
    userId: user.id,
    role: user.role as any,
    storeId: user.storeId,
  });
}

// ── Request helpers ──

export function mockRequest(body: any, overrides: Record<string, any> = {}) {
  const url = overrides.url || "http://localhost:3000/api/test";
  const method = overrides.method || "POST";
  const headers = overrides.headers || { "Content-Type": "application/json" };

  return {
    method,
    url,
    headers: new Headers(headers),
    json: async () => body,
    text: async () => JSON.stringify(body),
    cookies: new Map(),
    nextUrl: new URL(url),
  } as any;
}

export function setAuthCookie(req: any, token: string) {
  req.headers.set("Cookie", `gwm_token=${token}`);
  // 同步写入 mocked next/headers cookie store（getSession 读的是 cookies()）
  try {
    const { cookies } = require("next/headers");
    cookies().set("gwm_token", token, { httpOnly: true, path: "/" });
  } catch {}
}

// ── Assert helpers ──

export async function expectSuccess(res: Response) {
  const json = await res.json();
  if (res.status >= 400) {
    throw new Error(`Expected success but got ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

export async function expectError(res: Response, status: number) {
  const json = await res.json();
  if (res.status !== status) {
    throw new Error(`Expected ${status} but got ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

// ── DB Cleanup ──

/**
 * Delete users together with all FK-referencing rows, in dependency order.
 * SQLite enforces foreign keys, so a bare user.deleteMany throws when
 * verification codes / token accounts / stores / memberships still point at
 * the user.
 */
export async function deleteUsersSafe(userIds: string[]) {
  if (!userIds.length) return;
  // 快速路径：临时关闭 SQLite 外键约束，一次性删除用户及其关联数据。
  // beforeAll 会对每个 worker DB force-reset，因此这里不需要精确的依赖顺序。
  await testPrisma.$executeRawUnsafe(`PRAGMA foreign_keys = OFF`);
  try {
    await testPrisma.user.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await testPrisma.$executeRawUnsafe(`PRAGMA foreign_keys = ON`);
  }
}

/** @deprecated use deleteUsersSafe (FK-safe ordered cleanup) */
export async function cleanupTestData(userIds: string[]) {
  await deleteUsersSafe(userIds);
}

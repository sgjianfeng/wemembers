/**
 * Test helpers — create mock NextRequest/NextResponse, seed database, authenticate.
 */
import { PrismaClient } from "@prisma/client";
import { signToken } from "@/lib/auth";

import path from "path";

const TEST_DB_PATH = "file:" + path.resolve(__dirname, "../prisma/test.db");

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

export async function cleanupTestData(userIds: string[]) {
  for (const id of userIds) {
    await testPrisma.user.deleteMany({ where: { id } });
  }
}

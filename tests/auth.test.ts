/**
 * Auth system tests — register, login, verify code, role routing, staff roles.
 */
import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import { testPrisma, createTestBusiness, signTestJwt, mockRequest, setAuthCookie } from "./helpers";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("Auth System", () => {
  let testBusiness: any;

  beforeAll(async () => {
    testBusiness = await createTestBusiness({ businessName: "Auth Test Cafe" });
  });

  afterAll(async () => {
    await testPrisma.user.deleteMany({ where: { phone: { startsWith: "+65" } } });
    await prisma.$disconnect();
  });

  describe("Registration", () => {
    test("registers a customer with phone", async () => {
      const { POST } = await import("@/app/api/auth/register/route");
      const phone = `+6599999${Math.floor(Math.random() * 1000)}`;

      // Create verification code first
      await prisma.verificationCode.create({
        data: {
          contact: phone, code: "123456", purpose: "register",
          expiresAt: new Date(Date.now() + 300000),
        },
      });

      const req = mockRequest({
        contact: phone, code: "123456", role: "customer",
        displayName: "Test Customer",
      });
      const res = await POST(req as any);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.user.role).toBe("customer");
      expect(json.data.token).toBeDefined();

      // Verify DB
      const user = await prisma.user.findUnique({ where: { phone } });
      expect(user).toBeTruthy();
      expect(user!.role).toBe("customer");
    });

    test("registers a business and auto-creates store + token account", async () => {
      const { POST } = await import("@/app/api/auth/register/route");
      const email = `test-${Date.now()}@test.com`;

      await prisma.verificationCode.create({
        data: {
          contact: email, code: "654321", purpose: "register",
          expiresAt: new Date(Date.now() + 300000),
        },
      });

      const req = mockRequest({
        contact: email, code: "654321", role: "business",
        displayName: "Biz Owner", businessName: "Test Biz Co",
        businessCategory: "cafe",
      });
      const res = await POST(req as any);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.user.role).toBe("business");

      const user = await prisma.user.findUnique({
        where: { email },
        include: { tokenAccount: true, managedStores: true },
      });
      expect(user).toBeTruthy();
      expect(user!.tokenAccount).toBeTruthy();
      expect(user!.managedStores.length).toBeGreaterThan(0);
      expect(user!.tokenAccount!.balance).toBeGreaterThan(0);
    });

    test("rejects duplicate email", async () => {
      const { POST } = await import("@/app/api/auth/register/route");
      const email = testBusiness.user.email || "dup@test.com";

      const req = mockRequest({
        contact: email, code: "000000", role: "business",
      });
      const res = await POST(req as any);
      expect(res.status).toBe(409);
    });

    test("rejects invalid verification code", async () => {
      const { POST } = await import("@/app/api/auth/register/route");
      const req = mockRequest({
        contact: "unknown@test.com", code: "999999", role: "customer",
      });
      const res = await POST(req as any);
      expect(res.status).toBe(400);
    });
  });

  describe("Login", () => {
    test("sends verification code to existing customer", async () => {
      const { POST } = await import("@/app/api/auth/send-code/route");
      const req = mockRequest({ contact: testBusiness.user.phone, purpose: "login" });
      const res = await POST(req as any);
      expect(res.status).toBe(200);
    });

    test("verifies code and returns token with correct role", async () => {
      // Create valid code
      await prisma.verificationCode.create({
        data: {
          contact: testBusiness.user.phone!, code: "999999", purpose: "login",
          expiresAt: new Date(Date.now() + 300000),
        },
      });

      const { POST } = await import("@/app/api/auth/verify-code/route");
      const req = mockRequest({
        contact: testBusiness.user.phone, code: "999999", purpose: "login",
      });
      const res = await POST(req as any);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.user.role).toBe("business");
      expect(json.data.token).toBeDefined();
    });

    test("rejects expired code", async () => {
      await prisma.verificationCode.create({
        data: {
          contact: testBusiness.user.phone!, code: "111111", purpose: "login",
          expiresAt: new Date(Date.now() - 60000),
        },
      });

      const { POST } = await import("@/app/api/auth/verify-code/route");
      const req = mockRequest({
        contact: testBusiness.user.phone, code: "111111", purpose: "login",
      });
      const res = await POST(req as any);
      expect(res.status).toBe(400);
    });
  });

  describe("JWT Token", () => {
    test("signs and verifies JWT correctly", async () => {
      const token = await signTestJwt(testBusiness.user);
      const { verifyToken } = await import("@/lib/auth");
      const payload = await verifyToken(token);
      expect(payload).toBeTruthy();
      expect(payload!.userId).toBe(testBusiness.user.id);
      expect(payload!.role).toBe("business");
    });

    test("rejects invalid token", async () => {
      const { verifyToken } = await import("@/lib/auth");
      const payload = await verifyToken("invalid-token-here");
      expect(payload).toBeNull();
    });

    test("includes storeId for staff users", async () => {
      const staffUser = await testPrisma.user.create({
        data: {
          phone: `+65999${Math.floor(Math.random() * 100000)}`,
          role: "staff", storeId: testBusiness.store.id, status: "active",
        },
      });
      const token = await signTestJwt(staffUser);
      const { verifyToken } = await import("@/lib/auth");
      const payload = await verifyToken(token);
      expect(payload!.storeId).toBe(testBusiness.store.id);
    });
  });

  describe("GET /api/auth/me", () => {
    test("returns user info for authenticated user", async () => {
      const { GET } = await import("@/app/api/auth/me/route");
      const token = await signTestJwt(testBusiness.user);
      const req = mockRequest({}, { method: "GET" });
      setAuthCookie(req, token);

      const res = await GET(req as any);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.role).toBe("business");
      expect(json.data.businessName).toBe("Auth Test Cafe");
    });

    test("returns 401 for unauthenticated request", async () => {
      const { GET } = await import("@/app/api/auth/me/route");
      const req = mockRequest({}, { method: "GET" });
      const res = await GET(req as any);
      expect(res.status).toBe(401);
    });
  });
});

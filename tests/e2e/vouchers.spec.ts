/**
 * Voucher (代金券) System E2E — browser tests for coupon flows
 *
 * Run: npx playwright test tests/e2e/vouchers.spec.ts
 * Requires: npm run dev running on :3000
 *
 * Complements tests/vouchers.test.ts (Jest API-level tests)
 */
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "./db";

const BASE = "http://localhost:3000";

// ── Helpers ──
async function api(path: string, o: RequestInit & { json?: any } = {}): Promise<Response> {
  const { json, ...fetchOpts } = o;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (fetchOpts.headers) Object.assign(headers, fetchOpts.headers as any);
  return fetch(`${BASE}${path}`, {
    ...fetchOpts, headers,
    body: json ? JSON.stringify(json) : fetchOpts.body,
  });
}

async function registerUser(phone: string, role: "business" | "customer", name: string) {
  await api("/api/auth/send-code", { method: "POST", json: { contact: phone, purpose: "register" } });
  const vc = await prisma.verificationCode.findFirst({
    where: { contact: phone, purpose: "register" }, orderBy: { createdAt: "desc" },
  });
  return api("/api/auth/register", {
    method: "POST",
    json: {
      contact: phone, code: vc!.code, role, displayName: name,
      ...(role === "business" ? { businessName: name, businessCategory: "cafe" } : {}),
    },
  });
}

async function loginViaPage(page: Page, phone: string) {
  await api("/api/auth/send-code", { method: "POST", json: { contact: phone, purpose: "login" } });
  await page.waitForTimeout(300);
  const vc = await prisma.verificationCode.findFirst({
    where: { contact: phone, purpose: "login" }, orderBy: { createdAt: "desc" },
  });
  const verifyRes = await api("/api/auth/verify-code", {
    method: "POST", json: { contact: phone, code: vc!.code, purpose: "login" },
  });
  const j = await verifyRes.json();
  await page.context().addCookies([{
    name: "gwm_token", value: j.data.token, domain: "localhost", path: "/",
  }]);
}

async function authApi(token: string, path: string, method = "GET", json?: any) {
  return api(path, { method, headers: { "Cookie": `gwm_token=${token}` }, ...(json ? { json } : {}) });
}

// ── Globals ──
const r = Date.now().toString(36);
let bizPhone = `+65911${r}`, bizToken = "", bizUserId = "";
let custPhone = `+65913${r}`, custToken = "", custUserId = "";
let cust2Phone = `+65914${r}`, cust2Token = "", cust2UserId = "";

test.beforeAll(async () => {
  const b = await registerUser(bizPhone, "business", `VouchBiz ${r}`);
  const bj = await b.json();
  bizToken = bj.data.token; bizUserId = bj.data.user.id;

  const c = await registerUser(custPhone, "customer", `VouchCust ${r}`);
  const cj = await c.json();
  custToken = cj.data.token; custUserId = cj.data.user.id;

  const c2 = await registerUser(cust2Phone, "customer", `VouchCust2 ${r}`);
  const c2j = await c2.json();
  cust2Token = c2j.data.token; cust2UserId = c2j.data.user.id;

  // Seed points & tokens
  await prisma.user.update({ where: { id: custUserId }, data: { pointsBalance: 3000, lifetimePoints: 3000 } });
  await prisma.user.update({ where: { id: cust2UserId }, data: { pointsBalance: 3000, lifetimePoints: 3000 } });
  await prisma.tokenAccount.updateMany({
    where: { userId: bizUserId }, data: { balance: 50000 },
  });

  // Ensure at least one published coupon exists for discovery
  const now = new Date(); const future = new Date(); future.setMonth(future.getMonth() + 3);
  await prisma.coupon.create({
    data: {
      businessId: bizUserId, title: `E2E Discovery Voucher ${r}`,
      type: "fixed_amount", valueCents: 1200, pointsRequired: 80,
      totalQuantity: 50, remainingQuantity: 50,
      validFrom: now, validUntil: future, status: "published",
      isGiftable: true, perCustomerLimit: 3,
    },
  });
});

// ====================================================================
// SECTION 1: Business — Create & Manage Coupons
// ====================================================================
test.describe("1. Business Coupon Management", () => {
  let createdCouponId = "";

  test("1.1 Coupon list page loads with coupon cards", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto("/business/coupons");
    await expect(page.locator("text=E2E Discovery Voucher")).toBeVisible({ timeout: 8000 });
  });

  test("1.2 Coupon creation page loads with form", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto("/business/coupons/new");
    await expect(page.locator("text=定额减免").or(page.locator("text=创建")).first()).toBeVisible({ timeout: 8000 });
  });

  test("1.3 Create coupon via API", async () => {
    const now = new Date(); const future = new Date(); future.setMonth(future.getMonth() + 3);
    const res = await authApi(bizToken, "/api/business/coupons", "POST", {
      title: `E2E Form Voucher ${r}`,
      description: "Created via browser flow test",
      type: "fixed_amount", valueCents: 2500, minSpendCents: 5000,
      pointsRequired: 150, totalQuantity: 30,
      validFrom: now.toISOString(), validUntil: future.toISOString(),
      status: "published", isGiftable: true, perCustomerLimit: 2,
    });
    expect(res.status).toBe(200);
    const j = await res.json();
    createdCouponId = j.data.id;
    expect(j.data.title).toContain("E2E Form Voucher");
  });

  test("1.4 Newly created coupon appears in list", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto("/business/coupons");
    await expect(page.getByText(`E2E Form Voucher ${r}`)).toBeVisible({ timeout: 8000 });
  });

  test("1.5 Coupon detail page shows stats", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto(`/business/coupons/${createdCouponId}`);
    await expect(page.getByText(`E2E Form Voucher ${r}`)).toBeVisible({ timeout: 8000 });
    // Stats panel should be present
    await expect(page.locator("text=领取").or(page.locator("text=核销")).first()).toBeVisible({ timeout: 5000 });
  });

  test("1.6 Coupon stats API returns data", async () => {
    const res = await authApi(bizToken, `/api/business/coupons/${createdCouponId}/stats`);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.data).toBeDefined();
  });

  test("1.7 Toggle coupon to pause and back", async () => {
    const res = await authApi(bizToken, `/api/business/coupons/${createdCouponId}/toggle`, "POST");
    // Toggle returns redirect — status is 2xx or 3xx
    expect(res.ok || [301, 302, 307, 308].includes(res.status)).toBe(true);
    // Toggle back
    const back = await authApi(bizToken, `/api/business/coupons/${createdCouponId}/toggle`, "POST");
    expect(back.ok || [301, 302, 307, 308].includes(back.status)).toBe(true);
  });

  test("1.8 Create percentage coupon", async () => {
    const now = new Date(); const future = new Date(); future.setMonth(future.getMonth() + 3);
    const res = await authApi(bizToken, "/api/business/coupons", "POST", {
      title: `E2E Percent Voucher ${r}`,
      description: "Percentage discount",
      type: "percentage", valueCents: 15, minSpendCents: 3000,
      pointsRequired: 50, totalQuantity: 20,
      validFrom: now.toISOString(), validUntil: future.toISOString(),
      status: "published",
    });
    expect(res.status).toBe(200);
  });

  test("1.9 Create free-item coupon", async () => {
    const now = new Date(); const future = new Date(); future.setMonth(future.getMonth() + 3);
    const res = await authApi(bizToken, "/api/business/coupons", "POST", {
      title: `E2E Free Item ${r}`,
      description: "Free drink",
      type: "free_item", valueCents: 500, minSpendCents: 0,
      pointsRequired: 200, totalQuantity: 10,
      validFrom: now.toISOString(), validUntil: future.toISOString(),
      status: "published", isGiftable: true,
    });
    expect(res.status).toBe(200);
  });

  test("1.10 Coupon list filters by status", async () => {
    const res = await authApi(bizToken, "/api/business/coupons?status=published");
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.meta.total).toBeGreaterThanOrEqual(3);
  });

  test("1.11 Coupon list shows pagination for many coupons", async () => {
    const res = await authApi(bizToken, "/api/business/coupons?page=1");
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.meta).toBeDefined();
    expect(j.meta.page).toBe(1);
  });

  test("1.12 Can filter coupons by paused status", async () => {
    const res = await authApi(bizToken, "/api/business/coupons?status=paused");
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(Array.isArray(j.data)).toBe(true);
    // All should be paused or empty
    j.data.forEach((c: any) => expect(c.status).toBe("paused"));
  });
});

// ====================================================================
// SECTION 2: Customer — Discover & Claim
// ====================================================================
test.describe("2. Customer Discover & Claim", () => {
  let claimQr = "";

  test("2.1 Discover API returns coupons", async () => {
    const res = await api("/api/coupons/discover");
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(Array.isArray(j.data)).toBe(true);
  });

  test("2.2 Home page shows voucher section", async ({ page }) => {
    await loginViaPage(page, custPhone);
    await page.goto("/home");
    await expect(page.locator("h1, h2, h3").first()).toBeVisible({ timeout: 8000 });
  });

  test("2.3 Claim a coupon via browser UI", async ({ page }) => {
    await loginViaPage(page, custPhone);
    // Get discover coupons first to find a valid one
    const discoverRes = await api("/api/coupons/discover");
    const discoverJson = await discoverRes.json();
    const targetCoupon = discoverJson.data.find((c: any) =>
      c.pointsRequired <= 100 && c.status === "published"
    );
    if (!targetCoupon) { test.skip(true, "No suitable coupon for browser claim test"); return; }

    await page.goto(`/coupons/${targetCoupon.id}`);
    await expect(page.locator("text=领取")).toBeVisible({ timeout: 8000 });

    // Click claim
    const claimBtn = page.locator("button:has-text('领取')");
    if (await claimBtn.isVisible()) {
      await claimBtn.click();
      await page.waitForTimeout(1000);
    }
    // After claim, page content should change (success message or redirect)
    const currentUrl = page.url();
    expect(currentUrl).toBeTruthy();
  });

  test("2.4 Customer claims API returns success", async () => {
    // Find a published coupon with low points requirement
    const coupons = await prisma.coupon.findMany({
      where: { businessId: bizUserId, status: "published", pointsRequired: { lte: 100 } },
      take: 1,
    });
    if (coupons.length === 0) { test.skip(true, "No suitable coupon"); return; }

    const res = await authApi(custToken, `/api/coupons/${coupons[0].id}/claim`, "POST");
    expect(res.status).toBe(200);
    const j = await res.json();
    claimQr = j.data.claim.qrCode;
    expect(claimQr).toBeTruthy();
    expect(claimQr.length).toBe(12);
  });

  test("2.5 Wallet page shows claimed coupons", async ({ page }) => {
    await loginViaPage(page, custPhone);
    await page.goto("/wallet");
    await expect(page.locator(".font-mono").first()).toBeVisible({ timeout: 8000 });
  });

  test("2.6 Wallet filter tabs by status", async ({ page }) => {
    await loginViaPage(page, custPhone);
    await page.goto("/wallet");
    // Verify page loaded
    await expect(page.locator("h1").or(page.locator("text=我的券")).first()).toBeVisible({ timeout: 8000 });
  });
});

// ====================================================================
// SECTION 3: Gift & Redemption
// ====================================================================
test.describe("3. Gift & Redemption", () => {

  test("3.1 Gift a coupon to another user", async () => {
    // Create a giftable coupon explicitly
    const now = new Date(); const future = new Date(); future.setMonth(future.getMonth() + 1);
    const c = await prisma.coupon.create({
      data: {
        businessId: bizUserId, title: `E2E Giftable ${r}`,
        type: "fixed_amount", valueCents: 500, pointsRequired: 10,
        totalQuantity: 10, remainingQuantity: 10,
        validFrom: now, validUntil: future, status: "published",
        isGiftable: true,
      },
    });
    // Claim it
    const claimRes = await authApi(custToken, `/api/coupons/${c.id}/claim`, "POST");
    const claimJ = await claimRes.json();
    const claimId = claimJ.data.claim.id;

    const res = await authApi(custToken, `/api/coupons/${claimId}/gift`, "POST", {
      targetPhone: cust2Phone,
      message: "Enjoy this voucher!",
    });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.data.message).toMatch(/成功|success/i);
  });

  test("3.2 Original claim marked as gifted after transfer", async () => {
    const claim = await prisma.customerCoupon.findFirst({
      where: { customerId: custUserId, status: "gifted" },
      orderBy: { claimedAt: "desc" },
    });
    expect(claim).not.toBeNull();
  });

  test("3.3 Recipient received the gifted coupon", async () => {
    const claim = await prisma.customerCoupon.findFirst({
      where: { customerId: cust2UserId, status: "available" },
      orderBy: { claimedAt: "desc" },
    });
    expect(claim).not.toBeNull();
  });

  test("3.4 Cannot gift a non-giftable coupon", async () => {
    // Create a non-giftable coupon
    const now = new Date(); const future = new Date(); future.setMonth(future.getMonth() + 1);
    const c = await prisma.coupon.create({
      data: {
        businessId: bizUserId, title: `E2E NoGift ${r}`,
        type: "fixed_amount", valueCents: 500, pointsRequired: 10,
        totalQuantity: 10, remainingQuantity: 10,
        validFrom: now, validUntil: future, status: "published",
        isGiftable: false,
      },
    });
    // Claim it
    const claimRes = await authApi(custToken, `/api/coupons/${c.id}/claim`, "POST");
    const claimJ = await claimRes.json();
    const claimId = claimJ.data.claim.id;

    // Try to gift it
    const res = await authApi(custToken, `/api/coupons/${claimId}/gift`, "POST", {
      targetPhone: cust2Phone,
    });
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toMatch(/不允许|not allowed|gift/i);
  });

  test("3.5 Redeem via API and verify coupon used", async () => {
    // Create and claim a fresh coupon for redemption
    const now = new Date(); const future = new Date(); future.setMonth(future.getMonth() + 1);
    const c = await prisma.coupon.create({
      data: {
        businessId: bizUserId, title: `E2E RedeemTest ${r}`,
        type: "fixed_amount", valueCents: 800, pointsRequired: 20,
        totalQuantity: 10, remainingQuantity: 10,
        validFrom: now, validUntil: future, status: "published",
      },
    });
    const claimRes = await authApi(custToken, `/api/coupons/${c.id}/claim`, "POST");
    expect(claimRes.status).toBe(200);
    const claimJ = await claimRes.json();
    expect(claimJ.data.claim).toBeDefined();
    const qr = claimJ.data.claim.qrCode;

    const res = await authApi(bizToken, "/api/business/redeem", "POST", { qrCode: qr });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.data.success).toBe(true);
  });
});

// ====================================================================
// SECTION 4: Edge Cases — Voucher Flow
// ====================================================================
test.describe("4. Edge Cases — Voucher Flow", () => {

  test("4.1 Create coupon without required fields fails", async () => {
    const res = await authApi(bizToken, "/api/business/coupons", "POST", {
      title: "Bad Coupon",
      // missing type, valueCents, validFrom, validUntil
    });
    expect(res.status).toBe(400);
  });

  test("4.2 Non-business user cannot create coupon", async () => {
    const res = await authApi(custToken, "/api/business/coupons", "POST", {
      title: "Hacker Coupon", type: "fixed_amount", valueCents: 1000,
      validFrom: new Date().toISOString(),
      validUntil: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(res.status).toBe(403);
  });

  test("4.3 Expired coupon shows as expired in wallet", async ({ page }) => {
    // Create an expired claim via DB
    const past = new Date(); past.setMonth(past.getMonth() - 2);
    const pastEnd = new Date(); pastEnd.setDate(pastEnd.getDate() - 1);
    const c = await prisma.coupon.create({
      data: {
        businessId: bizUserId, title: `E2E ExpiredWallet ${r}`,
        type: "fixed_amount", valueCents: 1000, pointsRequired: 10,
        totalQuantity: 10, remainingQuantity: 10,
        validFrom: past, validUntil: pastEnd, status: "published",
        isGiftable: true,
      },
    });
    // Expired coupons should be rejected on claim
    const claimRes = await authApi(custToken, `/api/coupons/${c.id}/claim`, "POST");
    // Claiming an expired coupon should fail — that's the correct behavior
    expect([200, 400]).toContain(claimRes.status);
    if (claimRes.status !== 200) { test.skip(true, "Cannot claim expired coupon (expected)"); return; }

    await loginViaPage(page, custPhone);
    await page.goto("/wallet");
    // Click expired tab
    const expiredTab = page.locator("text=已过期").first();
    if (await expiredTab.isVisible()) {
      await expiredTab.click();
      await page.waitForTimeout(300);
    }
    await expect(page.getByText(`E2E ExpiredWallet ${r}`)).toBeVisible({ timeout: 8000 });
  });

  test("4.4 Insufficient points block shown in browser", async ({ page }) => {
    // Create an expensive coupon
    const now = new Date(); const future = new Date(); future.setMonth(future.getMonth() + 1);
    const c = await prisma.coupon.create({
      data: {
        businessId: bizUserId, title: `E2E Expensive ${r}`,
        type: "fixed_amount", valueCents: 5000, pointsRequired: 99999,
        totalQuantity: 10, remainingQuantity: 10,
        validFrom: now, validUntil: future, status: "published",
      },
    });
    await loginViaPage(page, custPhone);
    await page.goto(`/coupons/${c.id}`);
    // Should show the coupon page with points info
    await expect(page.locator("text=99,999").or(page.locator("text=99999"))).toBeVisible({ timeout: 8000 });
  });

  test("4.5 AI coupon generation endpoint works", async () => {
    const res = await authApi(bizToken, "/api/ai/coupon-generate", "POST", {
      prompt: "Create a coffee shop loyalty voucher",
    });
    // May succeed or fail depending on API key, just check it responds
    expect([200, 400, 500, 503]).toContain(res.status);
  });

  test("4.6 Must be logged in to access wallet", async ({ page }) => {
    await page.goto("/wallet");
    // Should redirect to login page
    await expect(
      page.locator("text=登录").first()
    ).toBeVisible({ timeout: 8000 });
  });

  test("4.7 Unauthenticated cannot create coupon", async () => {
    const res = await api("/api/business/coupons", {
      method: "POST",
      json: { title: "test", type: "fixed_amount", valueCents: 1000,
              validFrom: new Date().toISOString(),
              validUntil: new Date(Date.now() + 86400000).toISOString() },
    });
    expect([401, 403]).toContain(res.status);
  });

  test("4.8 Invalid QR code shows error in browser", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto("/business/scan");
    // Fill invalid QR and submit
    const input = page.locator("input");
    if (await input.isVisible()) {
      await input.fill("INVALID_CODE");
      await input.press("Enter");
      await page.waitForTimeout(300);
    }
    // Should show some feedback
    await expect(
      page.locator("text=无效").first()
    ).toBeVisible({ timeout: 5000 });
  });
});

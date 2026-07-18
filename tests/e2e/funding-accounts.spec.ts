/**
 * E2E: company settings / tokens / stores / customer profile / promoter withdraw.
 * Live Stripe payment is entry-only (URL); ledger paths covered by unit tests.
 *
 * Run: npx playwright test tests/e2e/funding-accounts.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "./db";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

async function api(path: string, o: RequestInit & { json?: unknown } = {}) {
  const { json, ...fetchOpts } = o;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (fetchOpts.headers) Object.assign(headers, fetchOpts.headers as Record<string, string>);
  return fetch(`${BASE}${path}`, {
    ...fetchOpts,
    headers,
    body: json !== undefined ? JSON.stringify(json) : (fetchOpts.body as BodyInit | undefined),
  });
}

async function registerUser(phone: string, role: "business" | "customer", name: string) {
  await api("/api/auth/send-code", {
    method: "POST",
    json: { contact: phone, purpose: "register" },
  });
  const vc = await prisma.verificationCode.findFirst({
    where: { contact: phone, purpose: "register" },
    orderBy: { createdAt: "desc" },
  });
  if (!vc) throw new Error(`No verification code for ${phone}`);
  return api("/api/auth/register", {
    method: "POST",
    json: {
      contact: phone,
      code: vc.code,
      role,
      displayName: name,
      ...(role === "business"
        ? { businessName: name, businessCategory: "cafe" }
        : {}),
    },
  });
}

async function loginViaCookie(page: Page, phone: string) {
  await api("/api/auth/send-code", {
    method: "POST",
    json: { contact: phone, purpose: "login" },
  });
  await page.waitForTimeout(150);
  const vc = await prisma.verificationCode.findFirst({
    where: { contact: phone, purpose: "login" },
    orderBy: { createdAt: "desc" },
  });
  if (!vc) throw new Error(`No login code for ${phone}`);
  const verifyRes = await api("/api/auth/verify-code", {
    method: "POST",
    json: { contact: phone, code: vc.code, purpose: "login" },
  });
  const j = await verifyRes.json();
  if (!j.data?.token) throw new Error(`Login failed: ${JSON.stringify(j)}`);
  await page.context().addCookies([
    {
      name: "gwm_token",
      value: j.data.token,
      domain: "localhost",
      path: "/",
    },
  ]);
  return j.data.token as string;
}

async function authApi(token: string, path: string, method = "GET", json?: unknown) {
  return api(path, {
    method,
    headers: { Cookie: `gwm_token=${token}` },
    ...(json !== undefined ? { json } : {}),
  });
}

const r = Date.now().toString().slice(-8);

test.describe("Funding & accounts E2E", () => {
  let bizPhone: string;
  let custPhone: string;
  let bizToken: string;
  let custToken: string;

  test.beforeAll(async () => {
    bizPhone = `+6591${r}1`;
    custPhone = `+6592${r}2`;
    await registerUser(bizPhone, "business", `Fund Co ${r}`);
    await registerUser(custPhone, "customer", `Fund User ${r}`);
  });

  test("company: settings PATCH + stores + tokens UI", async ({ page }) => {
    bizToken = await loginViaCookie(page, bizPhone);

    // Settings API
    const patch = await authApi(bizToken, "/api/business/settings", "PATCH", {
      businessName: `Fund Co Updated ${r}`,
      phone: bizPhone,
      displayName: "Owner",
    });
    expect(patch.status).toBe(200);
    const pj = await patch.json();
    expect(pj.data.businessName).toContain("Updated");

    // Settings page form
    await page.goto("/business/settings");
    await expect(page.getByRole("button", { name: /保存|Save/i })).toBeVisible({ timeout: 15000 });

    // Store create
    const storeRes = await authApi(bizToken, "/api/business/stores", "POST", {
      name: `Branch ${r}`,
      address: "CBD",
    });
    expect(storeRes.status).toBe(200);

    // Tokens page
    await page.goto("/business/tokens");
    await expect(page.getByRole("button", { name: /充值/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /提现/ })).toBeVisible();
    await page.getByRole("button", { name: /充值/ }).click();
    await expect(page.getByText(/充值金额/)).toBeVisible({ timeout: 5000 });

    // Withdraw guard without Connect
    const w = await authApi(bizToken, "/api/stripe/withdraw", "POST", { amountCents: 1000 });
    expect(w.status).toBe(400);
    const wj = await w.json();
    expect(wj.error || wj.code).toBeTruthy();
  });

  test("customer: profile rename + balance page", async ({ page }) => {
    custToken = await loginViaCookie(page, custPhone);

    const patch = await authApi(custToken, "/api/profile", "PATCH", {
      displayName: `Nick ${r}`,
    });
    expect(patch.status).toBe(200);
    const j = await patch.json();
    expect(j.data.displayName).toContain("Nick");

    await page.goto("/profile");
    await expect(page.getByText(new RegExp(`Nick ${r}`))).toBeVisible({ timeout: 15000 });

    await page.goto("/balance");
    await expect(page.getByText(/余额|Balance|voucher/i).first()).toBeVisible({ timeout: 15000 });
  });

  test("promoter: activate + withdraw min guard + page", async ({ page }) => {
    if (!custToken) custToken = await loginViaCookie(page, custPhone);

    // Ensure promoter account with balance
    const user = await prisma.user.findFirst({ where: { phone: custPhone } });
    expect(user).toBeTruthy();
    await prisma.promoterAccount.upsert({
      where: { userId: user!.id },
      create: {
        userId: user!.id,
        isActive: true,
        availableBalance: 2500,
        totalEarned: 2500,
      },
      update: { isActive: true, availableBalance: 2500 },
    });

    const low = await authApi(custToken, "/api/promoter/withdraw", "POST", {
      amount: 5,
      method: "paynow",
    });
    expect(low.status).toBe(400);

    const ok = await authApi(custToken, "/api/promoter/withdraw", "POST", {
      amount: 10,
      method: "paynow",
    });
    expect(ok.status).toBe(200);
    const oj = await ok.json();
    expect(oj.data.success).toBe(true);

    await page.goto("/promoter/withdraw");
    await expect(page.getByText(/PayNow|提现/i).first()).toBeVisible({ timeout: 15000 });
  });
});

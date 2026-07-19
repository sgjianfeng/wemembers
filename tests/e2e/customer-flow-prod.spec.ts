/**
 * Consumer full path on production:
 *   Home → Register → Login → Home + main tabs/pages
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=https://wemembers.store npx playwright test \
 *     tests/e2e/customer-flow-prod.spec.ts --config=playwright.prod.config.ts
 *
 * Codes read from prod Postgres via SSH (same as meow-bbq-register-prod).
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "https://wemembers.store";
const PASSWORD = process.env.CUST_PASSWORD || "CustFlow2026!";

const SSH_KEY =
  process.env.SERVER_KEY || path.join(os.homedir(), ".ssh", "wemember_key");
const SERVER = "root@43.106.94.37";

function sshNode(script: string): string {
  const remote = `cd /var/www/wemembers/current && node <<'NODE'\n${script}\nNODE`;
  return execFileSync(
    "ssh",
    [
      "-i",
      SSH_KEY,
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "ConnectTimeout=15",
      SERVER,
      remote,
    ],
    { encoding: "utf8", timeout: 45000 }
  ).trim();
}

function fetchCode(contact: string, purpose: "register" | "login"): string {
  const out = sshNode(`
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const vc = await p.verificationCode.findFirst({
    where: { contact: ${JSON.stringify(contact)}, purpose: ${JSON.stringify(purpose)}, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  console.log(vc ? vc.code : "NO_CODE");
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
`);
  const line = out.split("\n").filter(Boolean).pop() || "";
  if (!/^\d{6}$/.test(line)) {
    throw new Error(`No ${purpose} code for ${contact}: ${out}`);
  }
  return line;
}

/** Unique SG mobile: +65 + 8 digits (9xxxxxxx) */
function uniquePhone(): string {
  const n = Date.now().toString().slice(-7);
  return `+659${n}`;
}

async function fillCode(page: Page, code: string) {
  // CodeInput may be one field or 6 boxes
  const multi = page.locator('input[inputmode="numeric"], input[maxlength="1"]');
  const count = await multi.count();
  if (count >= 6) {
    for (let i = 0; i < 6; i++) {
      await multi.nth(i).fill(code[i]!);
    }
    return;
  }
  const single = page
    .locator('input[placeholder*="验证"], input[placeholder*="code" i], input[name="code"]')
    .first();
  if (await single.count()) {
    await single.fill(code);
    return;
  }
  // Fallback: any visible textbox on code step
  await page.locator("input").last().fill(code);
}

test.describe.configure({ mode: "serial" });

const phone = uniquePhone();
const phoneLocal = phone.replace("+65", ""); // form may accept 8-digit
let registered = false;

test("1. Homepage is consumer-only (no dual role tabs)", async ({ page }) => {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/买券抽大奖|Buy & Win/i)).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByText(/我是消费者|For Consumers/i)).toHaveCount(0);
  await expect(page.getByText(/我是商家 · 入驻|For business/i)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /免费注册|Sign up free/i }).first()
  ).toBeVisible();
});

test("2. Customer register from homepage", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

  await page
    .getByRole("link", { name: /^🎰?\s*免费注册$|Sign up free/i })
    .first()
    .click();
  await page.waitForURL(/\/auth\/register/, { timeout: 15000 });

  // Should land on details (role=customer) or role step
  const phoneInput = page
    .locator(
      'input[type="tel"], input[placeholder*="手机"], input[placeholder*="9123"], input[placeholder*="Phone"]'
    )
    .first();

  // If still on role step, pick customer
  const customerCard = page
    .locator("button")
    .filter({ hasText: /客户|消费者|Customer/i })
    .first();
  if (await customerCard.isVisible().catch(() => false)) {
    await customerCard.click();
    const next = page.getByRole("button", { name: /下一步|Next|继续/i });
    if (await next.isVisible().catch(() => false)) await next.click();
  }

  await phoneInput.waitFor({ state: "visible", timeout: 15000 });
  // Prefer 8-digit local; app normalizes to +65
  await phoneInput.fill(phoneLocal);

  const nameInput = page
    .locator(
      'input[placeholder*="昵称"], input[placeholder*="称呼"], input[placeholder*="name" i]'
    )
    .first();
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill(`Flow User ${phoneLocal.slice(-4)}`);
  }

  const pw = page.locator('input[type="password"]').first();
  if (await pw.isVisible().catch(() => false)) {
    await pw.fill(PASSWORD);
  }

  // Send code / next
  const sendBtn = page.getByRole("button", {
    name: /发送|验证码|下一步|继续|Next|Send/i,
  });
  await sendBtn.first().click();

  // Wait for code step
  await page.waitForTimeout(1500);
  let code = "";
  for (let i = 0; i < 8; i++) {
    try {
      code = fetchCode(phone, "register");
      break;
    } catch {
      await page.waitForTimeout(800);
    }
  }
  expect(code, "SMS/code stored in DB").toMatch(/^\d{6}$/);

  await fillCode(page, code);

  // Confirm register if needed
  const confirm = page.getByRole("button", {
    name: /注册|完成|确认|提交|Verify|Register|完成注册/i,
  });
  if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirm.click();
  }

  // Should reach customer home — not /business
  await page.waitForURL(/\/(home|auth)/, { timeout: 30000 });
  // If still on auth, try wait a bit more after code auto-submit
  if (page.url().includes("/auth")) {
    await page.waitForTimeout(2000);
  }
  await expect(page).not.toHaveURL(/\/business/);
  // Soft: prefer /home
  const url = page.url();
  if (!url.includes("/home")) {
    // Some flows stay on register until button — click again
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await page.waitForURL("**/home", { timeout: 20000 });
  }
  await expect(page).toHaveURL(/\/home/);
  registered = true;
});

/** Password login via API + set cookie (more reliable than UI for auth step) */
async function apiPasswordLogin(page: Page, contact: string, password: string) {
  const res = await page.request.post(`${BASE}/api/auth/login`, {
    data: {
      contact,
      password,
      intentRole: "customer",
      rememberMe: true,
    },
  });
  const j = await res.json();
  expect(res.ok(), JSON.stringify(j)).toBeTruthy();
  // Cookie is set by Set-Cookie on API response in browser request context
  const headers = res.headers();
  const setCookie = headers["set-cookie"] || "";
  const m = setCookie.match(/gwm_token=([^;]+)/);
  if (m) {
    await page.context().addCookies([
      {
        name: "gwm_token",
        value: m[1]!,
        domain: new URL(BASE).hostname,
        path: "/",
      },
    ]);
  }
  return j;
}

test("3. Password login (API) + session reaches /home", async ({ page }) => {
  test.skip(!registered, "register failed");
  test.setTimeout(60000);

  await page.context().clearCookies();
  await apiPasswordLogin(page, phoneLocal, PASSWORD);

  const res = await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  expect(res?.status() ?? 0).toBeLessThan(500);
  await expect(page).toHaveURL(/\/home/);
  await expect(page).not.toHaveURL(/\/business/);
  // Smoke: home has content
  await expect(page.locator("body")).not.toContainText("Application error");
});

test("4. Customer main pages load (no 5xx, not kicked to business)", async ({
  page,
}) => {
  test.skip(!registered, "register failed");
  test.setTimeout(120000);

  await apiPasswordLogin(page, phoneLocal, PASSWORD);
  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/home/);

  const pages: { path: string; name: string; ok?: RegExp }[] = [
    { path: "/home", name: "home" },
    { path: "/wallet", name: "wallet" },
    { path: "/balance", name: "balance" },
    { path: "/profile", name: "profile" },
    { path: "/my-tokens", name: "my-tokens" },
    { path: "/voucher/meow-bbq-s10-voucher", name: "s10-voucher" },
    { path: "/voucher/meow-bbq-draw-3tier", name: "draw-3tier" },
    { path: "/shop/meow-bbq", name: "shop-meow" },
    { path: "/", name: "landing" },
  ];

  const failures: string[] = [];

  for (const p of pages) {
    const res = await page.goto(`${BASE}${p.path}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const status = res?.status() ?? 0;
    const url = page.url();
    const body = await page.locator("body").innerText().catch(() => "");

    if (status >= 500) {
      failures.push(`${p.name}: HTTP ${status}`);
      continue;
    }
    if (url.includes("/business") && p.path !== "/") {
      failures.push(`${p.name}: redirected to business ${url}`);
      continue;
    }
    if (/Application error|Internal Server Error|PrismaClient/i.test(body)) {
      failures.push(`${p.name}: error text in body`);
      continue;
    }
    // Logged-out redirect to login is ok for protected routes if session lost
    if (
      url.includes("/auth/login") &&
      ["/home", "/wallet", "/balance", "/profile", "/my-tokens"].includes(p.path)
    ) {
      failures.push(`${p.name}: lost session → login`);
    }
  }

  expect(failures, failures.join("\n")).toEqual([]);
});

test("5. Merchant entry is separate", async ({ page }) => {
  await page.goto(`${BASE}/for-business`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/商家|Business|Business/i).first()).toBeVisible({
    timeout: 15000,
  });
  const res = await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  expect(res?.status()).toBeLessThan(500);
  await expect(page.getByText(/我是消费者|For Consumers/i)).toHaveCount(0);
});

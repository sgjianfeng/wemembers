/**
 * Meow BBQ pilot — register business on production (https://wemembers.store)
 *
 * Run (no local webServer):
 *   PLAYWRIGHT_BASE_URL=https://wemembers.store npx playwright test \
 *     tests/e2e/meow-bbq-register-prod.spec.ts --config=playwright.prod.config.ts
 *
 * Verification code is read from production DB via SSH (root + wemember_key).
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "https://wemembers.store";
const EMAIL = process.env.MEOW_EMAIL || "meow.jianfeng@gmail.com";
const PASSWORD = process.env.MEOW_PASSWORD || "MeowPilot2026!";
const COMPANY = "Uncle Meow Pte. Ltd.";
const BRAND = "Meow BBQ 猫抓烤肉";
const UEN = "202216301G";
const PHONE = "91251676";
const STORE_NAME = "Meow BBQ Vivo City";
const STORE_ADDRESS =
  process.env.MEOW_STORE_ADDRESS ||
  "1 HarbourFront Walk, #02-156/157 VivoCity, Singapore 098585";
const SLUG = "meow-bbq";

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
    { encoding: "utf8", timeout: 30000 }
  ).trim();
}

function fetchRegisterCode(contact: string): string {
  const out = sshNode(`
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const vc = await p.verificationCode.findFirst({
    where: { contact: ${JSON.stringify(contact.toLowerCase())}, purpose: "register", usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!vc) {
    console.log("NO_CODE");
  } else {
    console.log(vc.code);
  }
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
`);
  const line = out.split("\n").filter(Boolean).pop() || "";
  if (!/^\d{6}$/.test(line)) {
    throw new Error(`Could not fetch register code for ${contact}: ${out}`);
  }
  return line;
}

async function fillByPlaceholder(page: Page, placeholder: string, value: string) {
  const el = page.locator(`input[placeholder="${placeholder}"]`).first();
  await el.waitFor({ state: "visible", timeout: 15000 });
  await el.fill(value);
}

test.describe.configure({ mode: "serial" });

test("Meow BBQ: register business on production", async ({ page }) => {
  test.setTimeout(120000);

  await page.goto(`${BASE}/auth/register`, { waitUntil: "domcontentloaded" });

  // Step role — pick business card (second option)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const businessCard = page
    .locator("button")
    .filter({ hasText: /商家|Business|企业/ })
    .first();
  await businessCard.click();
  await page.getByRole("button", { name: /下一步|Next|继续/ }).click();

  // Details
  await fillByPlaceholder(page, "name@company.com", EMAIL);
  // company name placeholder may be zh
  const companyInput = page.locator('input[placeholder*="公司"], input[placeholder*="Company"], input[placeholder*="星巴克"]').first();
  if (await companyInput.count()) {
    await companyInput.fill(COMPANY);
  } else {
    // fallback: second text input after email
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator("input").nth(1).fill(COMPANY);
  }

  // UEN
  const uenInput = page.locator("input.font-mono, input[autocapitalize='characters']").first();
  await uenInput.fill(UEN);

  // Category food
  await page.locator("select").selectOption({ value: "food" });

  // Password — PasswordField is type password
  await page.locator('input[type="password"]').first().fill(PASSWORD);

  // Send code
  await page.getByRole("button", { name: /发送验证码|Send code|获取验证码/i }).click();

  // Wait for code step (6 digit inputs) or error
  await page.waitForTimeout(2500);
  const err = page.locator("p.text-red-500, .text-red-500");
  if (await err.isVisible().catch(() => false)) {
    const msg = await err.first().textContent();
    throw new Error(`send-code failed: ${msg}`);
  }

  // Fetch code from prod DB
  let code = "";
  for (let i = 0; i < 8; i++) {
    try {
      code = fetchRegisterCode(EMAIL);
      break;
    } catch {
      await page.waitForTimeout(1000);
    }
  }
  expect(code, "verification code from DB").toMatch(/^\d{6}$/);

  // Enter 6 digits
  const digits = page.locator('input[inputmode="numeric"]');
  await expect(digits).toHaveCount(6, { timeout: 15000 });
  for (let i = 0; i < 6; i++) {
    await digits.nth(i).fill(code[i]);
  }

  // After register → /business/stores
  await page.waitForURL(/\/business(\/stores)?/, { timeout: 30000 });
  await expect(page).toHaveURL(/business/);

  // Settings: legal name, slug, UEN (cookie from register)
  await page.goto(`${BASE}/business/settings`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  const patch = await page.evaluate(
    async ({ businessName, businessSlug, businessUen, phone, displayName }) => {
      const res = await fetch("/api/business/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          businessSlug,
          businessUen,
          businessCategory: "food",
          phone,
          displayName,
        }),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
    {
      businessName: COMPANY,
      businessSlug: SLUG,
      businessUen: UEN,
      phone: PHONE,
      displayName: BRAND,
    }
  );
  expect(patch.status, JSON.stringify(patch.body)).toBeLessThan(300);

  // Create Vivo City store via API (reliable after UI register)
  const storeRes = await page.evaluate(
    async ({ name, address, phone }) => {
      const list = await fetch("/api/business/stores");
      const lj = await list.json();
      const stores = (lj.data || []) as { id: string; name: string }[];
      if (Array.isArray(stores) && stores.length > 0) {
        return { status: 200, existing: stores, created: false };
      }
      const res = await fetch("/api/business/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address, phone }),
      });
      return {
        status: res.status,
        body: await res.json().catch(() => ({})),
        created: true,
      };
    },
    { name: STORE_NAME, address: STORE_ADDRESS, phone: PHONE }
  );
  expect(storeRes.status, JSON.stringify(storeRes)).toBeLessThan(300);

  // Dashboard smoke
  await page.goto(`${BASE}/business`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toContainText(/Uncle Meow|Meow|企业|Company|门店|Store/i);

  // Screenshot proof
  await page.screenshot({
    path: "tests/screenshots/flow-review/meow-bbq-prod-registered.png",
    fullPage: true,
  });
});

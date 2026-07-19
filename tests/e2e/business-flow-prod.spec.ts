/**
 * Business main path on production (Meow BBQ pilot account)
 *
 * Flow: OTP login → dashboard / stores / campaigns / scan / settings / physical
 *        + verify pilot campaigns exist via API
 *
 * Run:
 *   npm run test:e2e:business-prod
 *   # or
 *   PLAYWRIGHT_BASE_URL=https://wemembers.store npx playwright test \
 *     tests/e2e/business-flow-prod.spec.ts --config=playwright.prod.config.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "https://wemembers.store";
const EMAIL = process.env.MEOW_EMAIL || "meow.jianfeng@gmail.com";
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

function fetchLoginCode(contact: string): string {
  const out = sshNode(`
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const vc = await p.verificationCode.findFirst({
    where: { contact: ${JSON.stringify(contact.toLowerCase())}, purpose: "login", usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  console.log(vc ? vc.code : "NO_CODE");
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
`);
  const line = out.split("\n").filter(Boolean).pop() || "";
  if (!/^\d{6}$/.test(line)) {
    throw new Error(`No login code for ${contact}: ${out}`);
  }
  return line;
}

/** Use page.request so Set-Cookie lands in the same browser context */
async function businessOtpLogin(page: Page) {
  const send = await page.request.post(`${BASE}/api/auth/send-code`, {
    data: { contact: EMAIL, purpose: "login" },
  });
  const sj = await send.json();
  expect(send.ok(), JSON.stringify(sj)).toBeTruthy();

  let code = "";
  for (let i = 0; i < 10; i++) {
    try {
      code = fetchLoginCode(EMAIL);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  expect(code).toMatch(/^\d{6}$/);

  const verify = await page.request.post(`${BASE}/api/auth/verify-code`, {
    data: {
      contact: EMAIL,
      code,
      purpose: "login",
      intentRole: "business",
      rememberMe: true,
    },
  });
  const vj = await verify.json();
  expect(verify.ok(), JSON.stringify(vj)).toBeTruthy();
  expect(vj.data?.user?.role).toMatch(/business|staff/);

  // page.request shares cookies with the page context in Playwright
  const setCookie = verify.headers()["set-cookie"] || "";
  const m = setCookie.match(/gwm_token=([^;]+)/);
  if (m) {
    await page.context().addCookies([
      {
        name: "gwm_token",
        value: decodeURIComponent(m[1]!),
        domain: new URL(BASE).hostname,
        path: "/",
      },
    ]);
  }

  return vj.data.user;
}

test.describe.configure({ mode: "serial" });

test("1. Business OTP login + dashboard", async ({ page }) => {
  test.setTimeout(90000);
  const user = await businessOtpLogin(page);
  expect(user.email || EMAIL).toBeTruthy();

  const res = await page.goto(`${BASE}/business`, {
    waitUntil: "domcontentloaded",
  });
  expect(res?.status() ?? 0).toBeLessThan(500);
  await expect(page).toHaveURL(/\/business/);
  await expect(page).not.toHaveURL(/\/auth\/login/);
  await expect(page.locator("body")).not.toContainText("Application error");
  // Should not show pure customer home chrome only
  await expect(page.locator("body")).not.toContainText("无权访问");
});

test("2. Core business pages load", async ({ page }) => {
  test.setTimeout(120000);
  await businessOtpLogin(page);

  const paths = [
    "/business",
    "/business/stores",
    "/business/campaigns",
    "/business/campaigns/new",
    "/business/coupons",
    "/business/scan",
    "/business/settings",
    "/business/members",
    "/business/physical",
    "/business/tokens",
    "/business/settlements",
    "/for-business",
  ];

  const failures: string[] = [];
  for (const p of paths) {
    const res = await page.goto(`${BASE}${p}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const status = res?.status() ?? 0;
    const url = page.url();
    const body = await page.locator("body").innerText().catch(() => "");

    if (status >= 500) failures.push(`${p}: HTTP ${status}`);
    if (url.includes("/auth/login")) failures.push(`${p}: kicked to login`);
    if (url.includes("/home") && p.startsWith("/business"))
      failures.push(`${p}: wrong role home`);
    if (/Application error|Internal Server Error|PrismaClient/i.test(body))
      failures.push(`${p}: error body`);
    if (/无权访问/.test(body)) failures.push(`${p}: 无权访问`);
  }
  expect(failures, failures.join("\n")).toEqual([]);
});

test("3. Pilot campaigns visible via business API", async ({ page }) => {
  test.setTimeout(60000);
  await businessOtpLogin(page);

  // Use browser cookie for same-origin API
  await page.goto(`${BASE}/business`, { waitUntil: "domcontentloaded" });
  const data = await page.evaluate(async () => {
    const res = await fetch("/api/business/campaigns");
    return { status: res.status, body: await res.json().catch(() => ({})) };
  });
  expect(data.status).toBe(200);
  const list = (data.body.data || data.body || []) as { slug?: string; name?: string; status?: string }[];
  const arr = Array.isArray(list) ? list : [];
  const slugs = arr.map((c) => c.slug).filter(Boolean);
  // May be nested
  const flat = JSON.stringify(data.body);
  expect(
    flat.includes("meow-bbq-s10-voucher") || flat.includes("S$10"),
    `missing s10 campaign: ${flat.slice(0, 500)}`
  ).toBeTruthy();
  expect(
    flat.includes("meow-bbq-draw-3tier") || flat.includes("抽奖"),
    `missing draw campaign: ${flat.slice(0, 500)}`
  ).toBeTruthy();
});

test("4. Public pilot voucher pages still 200", async ({ page }) => {
  for (const slug of ["meow-bbq-s10-voucher", "meow-bbq-draw-3tier"]) {
    const res = await page.goto(`${BASE}/voucher/${slug}`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status() ?? 0, slug).toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText("Application error");
  }
});

test("5. Store list has Meow BBQ Vivo", async ({ page }) => {
  test.setTimeout(60000);
  await businessOtpLogin(page);
  await page.goto(`${BASE}/business/stores`, { waitUntil: "domcontentloaded" });
  const data = await page.evaluate(async () => {
    const res = await fetch("/api/business/stores");
    return { status: res.status, body: await res.json().catch(() => ({})) };
  });
  expect(data.status).toBe(200);
  const stores = (data.body.data || []) as { name?: string }[];
  expect(stores.length).toBeGreaterThan(0);
  const names = stores.map((s) => s.name || "").join(" ");
  expect(names).toMatch(/Meow|Vivo|BBQ/i);
});

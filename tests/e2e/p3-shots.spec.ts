/**
 * Throwaway visual check for the P3 refresh (business dashboard + public store page).
 *   PLAYWRIGHT_BASE_URL=http://localhost:3200 npx playwright test \
 *     tests/e2e/p3-shots.spec.ts --config=playwright.prod.config.ts
 */
import { test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3200";
const OUT = path.resolve(__dirname, "../screenshots/p3");
const prisma = new PrismaClient({
  datasources: { db: { url: "file:" + path.resolve(__dirname, "../../prisma/dev.db") } },
});

async function api(p: string, json?: unknown) {
  return fetch(`${BASE}${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json ?? {}),
  });
}
async function latestCode(contact: string, purpose: string): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const vc = await prisma.verificationCode.findFirst({
      where: { contact, purpose }, orderBy: { createdAt: "desc" },
    });
    if (vc) return vc.code;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`no ${purpose} code for ${contact}`);
}
function tokenFrom(res: Response): string | null {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const m = c.match(/gwm_token=([^;]+)/);
    if (m) return m[1];
  }
  return null;
}
async function shot(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

test("P3 shots: business dashboard + public store", async ({ page }) => {
  const email = `biz${Date.now()}@example.com`;
  await api("/api/auth/send-code", { contact: email, purpose: "register" });
  const code = await latestCode(email, "register");
  const res = await api("/api/auth/register", {
    contact: email, code, role: "business", password: "test1234",
    displayName: "验证老板", businessName: "验证咖啡馆", businessCategory: "餐饮美食",
    businessUen: `2019${Date.now().toString().slice(-5)}A`,
  });
  const j = await res.json();
  const token = (j.data?.token ?? tokenFrom(res)) as string;
  if (typeof token !== "string") throw new Error("register failed: " + JSON.stringify(j));
  await page.context().addCookies([
    { name: "gwm_token", value: token, domain: "localhost", path: "/" },
  ]);

  await page.goto(`${BASE}/business`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await shot(page, "business-dashboard");

  const u = await prisma.user.findFirst({
    where: { email }, select: { businessSlug: true },
  });
  if (u?.businessSlug) {
    await page.goto(`${BASE}/shop/${u.businessSlug}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await shot(page, "shop-public");
  }
  await prisma.$disconnect();
});

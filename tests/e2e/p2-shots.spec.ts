/**
 * Throwaway visual check for the P2 redesign (home draw hero + voucher draw detail).
 * Reuses the r1-sweep registration flow. Run against a local dev server:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test \
 *     tests/e2e/p2-shots.spec.ts --config=playwright.prod.config.ts
 */
import { test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100";
const OUT = path.resolve(__dirname, "../screenshots/p2");
const prisma = new PrismaClient({
  datasources: {
    db: { url: "file:" + path.resolve(__dirname, "../../prisma/dev.db") },
  },
});

async function api(p: string, json?: unknown) {
  return fetch(`${BASE}${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json ?? {}),
  });
}
async function latestCode(contact: string, purpose: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const vc = await prisma.verificationCode.findFirst({
      where: { contact, purpose },
      orderBy: { createdAt: "desc" },
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
async function registerCustomer(): Promise<string> {
  const phone = `+659${Date.now().toString().slice(-7)}`;
  await api("/api/auth/send-code", { contact: phone, purpose: "register" });
  const code = await latestCode(phone, "register");
  const res = await api("/api/auth/register", {
    contact: phone,
    code,
    role: "customer",
    displayName: "P2 Shot",
  });
  const j = await res.json();
  return (j.data?.token ?? tokenFrom(res)) as string;
}
async function asCustomer(page: Page, token: string) {
  await page.context().addCookies([
    { name: "gwm_token", value: token, domain: "localhost", path: "/" },
  ]);
}
async function shot(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

test("P2 shots: home + voucher draw", async ({ page }) => {
  const token = await registerCustomer();
  await asCustomer(page, token);

  await page.goto(`${BASE}/home`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "home");

  const draw = await prisma.campaign.findFirst({
    where: {
      type: { in: ["lucky_draw_v2", "voucher_sale", "lucky_draw"] },
      status: "active",
    },
    orderBy: { endDate: "asc" },
    select: { slug: true, id: true },
  });
  const slug = draw?.slug || draw?.id;
  if (slug) {
    await page.goto(`${BASE}/voucher/${slug}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await shot(page, "voucher-draw");
  }
  await prisma.$disconnect();
});

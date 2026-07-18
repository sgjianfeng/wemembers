/**
 * Capture key flow screenshots for product review.
 * Uses month-seed accounts when present; falls back to fresh register.
 *
 * Output: tests/screenshots/flow-review/*.png
 *
 *   npx playwright test tests/e2e/flow-screenshots.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "./db";
import * as fs from "fs";
import * as path from "path";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const OUT = path.resolve(__dirname, "../screenshots/flow-review");
const r = Date.now().toString(36);

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

async function loginToken(contact: string): Promise<string> {
  await api("/api/auth/send-code", {
    method: "POST",
    json: { contact, purpose: "login" },
  });
  await new Promise((r) => setTimeout(r, 150));
  const vc = await prisma.verificationCode.findFirst({
    where: { contact, purpose: "login" },
    orderBy: { createdAt: "desc" },
  });
  if (!vc) throw new Error(`No login code for ${contact}`);
  const res = await api("/api/auth/verify-code", {
    method: "POST",
    json: { contact, code: vc.code, purpose: "login" },
  });
  const j = await res.json();
  if (!j.data?.token) throw new Error(`Login fail ${contact}: ${JSON.stringify(j)}`);
  return j.data.token as string;
}

async function setCookie(page: Page, token: string) {
  await page.context().addCookies([
    { name: "gwm_token", value: token, domain: "localhost", path: "/" },
  ]);
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log("📸", file);
}

test.describe.configure({ mode: "serial" });

test("capture flow screenshots from seed + live actions", async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });

  // Prefer month-seed business
  let bizContact = "month-biz-a@wemembers.test";
  let bizUser = await prisma.user.findUnique({ where: { email: bizContact } });
  if (!bizUser) {
    // register fallback
    const phone = `+65941${r}`;
    await api("/api/auth/send-code", {
      method: "POST",
      json: { contact: phone, purpose: "register" },
    });
    const vc = await prisma.verificationCode.findFirst({
      where: { contact: phone, purpose: "register" },
      orderBy: { createdAt: "desc" },
    });
    await api("/api/auth/register", {
      method: "POST",
      json: {
        contact: phone,
        code: vc!.code,
        role: "business",
        displayName: `ShotBiz ${r}`,
        businessName: `ShotBiz ${r}`,
        businessCategory: "cafe",
      },
    });
    bizContact = phone;
    bizUser = await prisma.user.findFirst({ where: { phone } });
  }

  const bizToken = await loginToken(bizContact);
  await setCookie(page, bizToken);

  // 01 Business dashboard
  await page.goto("/business");
  await page.waitForTimeout(800);
  await shot(page, "01-business-dashboard");

  // 02 Campaigns list
  await page.goto("/business/campaigns");
  await page.waitForTimeout(600);
  await shot(page, "02-business-campaigns");

  // Ensure a draw campaign with slug exists
  let draw = await prisma.campaign.findFirst({
    where: {
      businessId: bizUser!.id,
      type: "lucky_draw_v2",
      status: "active",
      slug: { not: null },
    },
  });
  if (!draw) {
    const res = await api("/api/business/campaigns", {
      method: "POST",
      headers: { Cookie: `gwm_token=${bizToken}` },
      json: {
        templateId: "draw_standard",
        name: `Shot Draw ${r}`,
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
    });
    const j = await res.json();
    draw = await prisma.campaign.findUnique({ where: { id: j.data.id } });
  }

  // 03 Campaign detail (share + QR)
  await page.goto(`/business/campaigns/${draw!.id}`);
  await page.waitForTimeout(800);
  await shot(page, "03-campaign-detail-share");

  // 04 New campaign picker
  await page.goto("/business/campaigns/new");
  await page.waitForTimeout(600);
  await shot(page, "04-campaign-new-templates");

  // 05 Earnings
  await page.goto("/business/earnings");
  await page.waitForTimeout(800);
  await shot(page, "05-business-earnings");

  // 06 Scan
  await page.goto("/business/scan");
  await page.waitForTimeout(500);
  await shot(page, "06-business-scan");

  // 07 Public voucher draw page
  await page.goto(`/voucher/${draw!.slug}`);
  await page.waitForTimeout(1200);
  await shot(page, "07-public-voucher-draw");

  // Discount page if any
  const disc = await prisma.campaign.findFirst({
    where: {
      businessId: bizUser!.id,
      type: "voucher_sale",
      slug: { not: null },
      status: "active",
    },
  });
  if (disc?.slug) {
    await page.goto(`/voucher/${disc.slug}`);
    await page.waitForTimeout(1000);
    await shot(page, "08-public-voucher-discount");
  }

  // Customer path
  let custPhone = "+65981000001";
  let cust = await prisma.user.findUnique({ where: { phone: custPhone } });
  if (!cust) {
    custPhone = `+65942${r}`;
    await api("/api/auth/send-code", {
      method: "POST",
      json: { contact: custPhone, purpose: "register" },
    });
    const vc = await prisma.verificationCode.findFirst({
      where: { contact: custPhone, purpose: "register" },
      orderBy: { createdAt: "desc" },
    });
    const reg = await api("/api/auth/register", {
      method: "POST",
      json: {
        contact: custPhone,
        code: vc!.code,
        role: "customer",
        displayName: `ShotCust ${r}`,
      },
    });
    const rj = await reg.json();
    // buy a voucher for QR
    await api(`/api/voucher/purchase?slug=${draw!.slug}`, {
      method: "POST",
      headers: { Cookie: `gwm_token=${rj.data.token}` },
      json: { amountSgd: 50, spendNowSgd: 0, skipPayment: true },
    });
  } else {
    // ensure has active voucher
    const has = await prisma.voucher.findFirst({
      where: { customerId: cust.id, status: "active", balanceCents: { gt: 0 } },
    });
    if (!has) {
      const tok = await loginToken(custPhone);
      await api(`/api/voucher/purchase?slug=${draw!.slug}`, {
        method: "POST",
        headers: { Cookie: `gwm_token=${tok}` },
        json: { amountSgd: 50, spendNowSgd: 0, skipPayment: true },
      });
    }
  }

  const custToken = await loginToken(custPhone);
  await setCookie(page, custToken);

  // 09 Customer home
  await page.goto("/home");
  await page.waitForTimeout(800);
  await shot(page, "09-customer-home");

  // 10 Balance + QR
  await page.goto("/balance");
  await page.waitForTimeout(800);
  await shot(page, "10-customer-balance");
  const qrBtn = page.getByRole("button", { name: /出示核销码|Show redeem QR/i }).first();
  if (await qrBtn.count()) {
    await qrBtn.click();
    await page.waitForTimeout(600);
    await shot(page, "11-customer-redeem-qr");
  }

  // 12 Seller as promoter if exists
  const promPhone = "+65982000001";
  const prom = await prisma.user.findUnique({ where: { phone: promPhone } });
  if (prom) {
    const pTok = await loginToken(promPhone);
    await setCookie(page, pTok);
    await page.goto("/seller");
    await page.waitForTimeout(1000);
    await shot(page, "12-seller-center");
  }

  // 13 Store public page
  const store = await prisma.store.findFirst({
    where: { businessId: bizUser!.id },
  });
  if (store?.slug) {
    await page.goto(`/store/${store.slug}`);
    await page.waitForTimeout(800);
    await shot(page, "13-store-public");
  }

  // index listing for report
  const files = fs.readdirSync(OUT).filter((f) => f.endsWith(".png")).sort();
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Flow Review</title>
  <style>body{font-family:system-ui;background:#f8fafc;padding:24px}h1{font-size:20px}
  .card{background:#fff;border-radius:12px;padding:16px;margin:16px 0;box-shadow:0 1px 3px #0001}
  img{max-width:390px;width:100%;border:1px solid #e2e8f0;border-radius:8px}
  .name{font-weight:600;margin-bottom:8px;color:#0f172a}</style></head><body>
  <h1>WeMembers 流程截图 · ${new Date().toISOString()}</h1>
  <p>共 ${files.length} 张 · 路径 tests/screenshots/flow-review/</p>
  ${files
    .map(
      (f) =>
        `<div class="card"><div class="name">${f}</div><img src="./${f}" alt="${f}"/></div>`
    )
    .join("\n")}
  </body></html>`;
  fs.writeFileSync(path.join(OUT, "index.html"), html);
  console.log("\n✅ Report:", path.join(OUT, "index.html"));
  expect(files.length).toBeGreaterThanOrEqual(8);
});

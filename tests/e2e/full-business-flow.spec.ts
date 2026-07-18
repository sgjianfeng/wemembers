/**
 * Full business flow E2E — multi-role smoke through open network + seller path.
 *
 * Covers:
 *   1. Register 2 businesses + 2 customers + promoter activate
 *   2. Create stores + draw/discount campaigns
 *   3. Purchase (direct) with seller attribution
 *   4. Cross-store redeem (open network)
 *   5. UI: balance QR, scan lookup, seller center, earnings
 *
 * Run:
 *   npm run test:e2e -- tests/e2e/full-business-flow.spec.ts
 *
 * Requires: app on :3000, ALLOW_DIRECT_VOUCHER_PURCHASE (playwright webServer sets it)
 */
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "./db";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
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

async function registerUser(
  contact: string,
  role: "business" | "customer",
  name: string
) {
  await api("/api/auth/send-code", {
    method: "POST",
    json: { contact, purpose: "register" },
  });
  const vc = await prisma.verificationCode.findFirst({
    where: { contact, purpose: "register" },
    orderBy: { createdAt: "desc" },
  });
  if (!vc) throw new Error(`No code for ${contact}`);
  return api("/api/auth/register", {
    method: "POST",
    json: {
      contact,
      code: vc.code,
      role,
      displayName: name,
      ...(role === "business"
        ? { businessName: name, businessCategory: "cafe" }
        : {}),
    },
  });
}

async function setTokenCookie(page: Page, token: string) {
  await page.context().addCookies([
    { name: "gwm_token", value: token, domain: "localhost", path: "/" },
  ]);
}

async function authApi(token: string, path: string, method = "GET", json?: unknown) {
  return api(path, {
    method,
    headers: { Cookie: `gwm_token=${token}` },
    ...(json !== undefined ? { json } : {}),
  });
}

test.describe.configure({ mode: "serial" });

const bizAPhone = `+65931${r}`;
const bizBPhone = `+65932${r}`;
const custPhone = `+65933${r}`;
const promPhone = `+65934${r}`;

let bizAToken = "";
let bizBToken = "";
let custToken = "";
let promToken = "";
let bizAId = "";
let bizBId = "";
let promId = "";
let storeAId = "";
let storeBId = "";
let drawSlug = "";
let discSlug = "";
let voucherId = "";

test.describe("Full business flow", () => {
  test("1. Register multi-role accounts", async () => {
    const a = await registerUser(bizAPhone, "business", `FlowBizA ${r}`);
    const aj = await a.json();
    expect(a.status, JSON.stringify(aj)).toBe(200);
    bizAToken = aj.data.token;
    bizAId = aj.data.user.id;

    const b = await registerUser(bizBPhone, "business", `FlowBizB ${r}`);
    const bj = await b.json();
    expect(b.status).toBe(200);
    bizBToken = bj.data.token;
    bizBId = bj.data.user.id;

    const c = await registerUser(custPhone, "customer", `FlowCust ${r}`);
    const cj = await c.json();
    expect(c.status).toBe(200);
    custToken = cj.data.token;

    const p = await registerUser(promPhone, "customer", `FlowProm ${r}`);
    const pj = await p.json();
    expect(p.status).toBe(200);
    promToken = pj.data.token;
    promId = pj.data.user.id;

    // Activate promoter
    const act = await authApi(promToken, "/api/promoter/activate", "POST", {});
    expect(act.status).toBe(200);
    const eligible = await authApi(promToken, "/api/seller/me");
    const ej = await eligible.json();
    expect(ej.data.eligible).toBe(true);
    expect(ej.data.kind).toBe("promoter");
  });

  test("2. Create stores + campaigns (draw + discount)", async () => {
    const sa = await authApi(bizAToken, "/api/business/stores", "POST", {
      name: `Flow Store A ${r}`,
      address: "A Street",
    });
    const saj = await sa.json();
    storeAId = saj.data?.id || saj.data?.store?.id;
    expect(storeAId).toBeTruthy();

    const sb = await authApi(bizBToken, "/api/business/stores", "POST", {
      name: `Flow Store B ${r}`,
      address: "B Street",
    });
    const sbj = await sb.json();
    storeBId = sbj.data?.id || sbj.data?.store?.id;
    expect(storeBId).toBeTruthy();

    // B needs a campaign to join open network
    const bCamp = await authApi(bizBToken, "/api/business/campaigns", "POST", {
      templateId: "draw_standard",
      name: `Flow B Network ${r}`,
      startDate: new Date(Date.now() - 86400000).toISOString(),
      endDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
    expect(bCamp.status).toBe(200);

    const draw = await authApi(bizAToken, "/api/business/campaigns", "POST", {
      templateId: "draw_standard",
      name: `Flow Draw ${r}`,
      startDate: new Date(Date.now() - 86400000).toISOString(),
      endDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      shareSellingEnabled: true,
    });
    const dj = await draw.json();
    expect(draw.status, JSON.stringify(dj)).toBe(200);
    drawSlug = dj.data?.slug;
    expect(drawSlug).toBeTruthy();

    const disc = await authApi(bizAToken, "/api/business/campaigns", "POST", {
      templateId: "voucher_discount",
      name: `Flow Disc ${r}`,
      discountPercent: 15,
      startDate: new Date(Date.now() - 86400000).toISOString(),
      endDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
    const discj = await disc.json();
    expect(disc.status, JSON.stringify(discj)).toBe(200);
    discSlug = discj.data?.slug;
    expect(discSlug).toBeTruthy();
  });

  test("3. Customer buys draw voucher with promoter seller", async () => {
    const res = await authApi(
      custToken,
      `/api/voucher/purchase?slug=${drawSlug}`,
      "POST",
      {
        amountSgd: 50,
        spendNowSgd: 0,
        sellerId: promId,
        skipPayment: true,
      }
    );
    const j = await res.json();
    expect(res.status, JSON.stringify(j)).toBe(200);
    voucherId = j.data.voucher.id;
    expect(j.data.voucher.balanceSgd).toBe("50.00");
    expect(j.data.split.sellerCommissionCents).toBe(0); // not paid until redeem
    expect(j.data.instantPrize).toBeTruthy();

    const v = await prisma.voucher.findUnique({ where: { id: voucherId } });
    expect(v?.sellerId).toBe(promId);
  });

  test("4. Self-buy seller ignored", async () => {
    const res = await authApi(
      custToken,
      `/api/voucher/purchase?slug=${discSlug}`,
      "POST",
      {
        amountSgd: 50,
        spendNowSgd: 0,
        sellerId: (await prisma.user.findFirst({
          where: { phone: custPhone },
        }))!.id,
        skipPayment: true,
      }
    );
    const j = await res.json();
    expect(res.status).toBe(200);
    const v = await prisma.voucher.findUnique({ where: { id: j.data.voucher.id } });
    expect(v?.sellerId).toBeNull();
  });

  test("5. Open network: B redeems A voucher", async () => {
    // Staff session with store B — use business B owner redeem
    const res = await authApi(bizBToken, "/api/voucher/redeem", "POST", {
      voucherId,
      amountCents: 1500,
    });
    const j = await res.json();
    expect(res.status, JSON.stringify(j)).toBe(200);
    expect(j.data.usage.storeIncomeSgd).toBe("12.00");
    expect(j.data.voucher.remainingBalanceSgd).toBe("35.00");

    // Promoter got commission
    const prom = await prisma.tokenAccount.findUnique({ where: { userId: promId } });
    expect(prom).toBeTruthy();
    // commission 5% of 1500 = 75 cents frozen or balance
    const txs = await prisma.tokenTransaction.findMany({
      where: { account: { userId: promId }, type: "seller_commission" },
    });
    expect(txs.some((t) => t.amount === 75)).toBe(true);
  });

  test("6. UI — customer balance QR", async ({ page }) => {
    await setTokenCookie(page, custToken);
    await page.goto("/balance");
    await expect(page.getByText(/我的余额券|My vouchers/i)).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /出示核销码|Show redeem QR/i }).first().click();
    await expect(page.locator('img[alt="Redeem QR"]')).toBeVisible({ timeout: 10000 });
  });

  test("7. UI — staff scan lookup with wmv: prefix", async ({ page }) => {
    await setTokenCookie(page, bizBToken);
    await page.goto("/business/scan");
    await expect(page.getByText(/全网互核|Open network/i)).toBeVisible({ timeout: 10000 });
    await page.getByPlaceholder(/wmv|券 ID|Voucher/i).fill(`wmv:${voucherId}`);
    await page.getByRole("button", { name: /查询余额|Look up/i }).click();
    await expect(page.getByText(/余额|Balance/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("S$35.00")).toBeVisible();
  });

  test("8. UI — seller center lists campaigns", async ({ page }) => {
    await setTokenCookie(page, promToken);
    await page.goto("/seller");
    await expect(page.getByText("卖家中心")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("推广人", { exact: true })).toBeVisible();
    await expect(page.getByText(/推广活动|出码/)).toBeVisible();
  });

  test("9. UI — business earnings board", async ({ page }) => {
    await setTokenCookie(page, bizBToken);
    await page.goto("/business/earnings");
    await expect(page.getByText("经营看板")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("heading", { name: /接待核销/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /售出归因/ })).toBeVisible();
  });

  test("10. UI — voucher page network banner + paynow copy", async ({ page }) => {
    await page.goto(`/voucher/${drawSlug}`);
    await expect(page.getByText(/全网可花|Spend across the network/i)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole("button", { name: /PayNow/i })).toBeVisible();
  });

  test("11. Discount purchase credits paid not face", async () => {
    const res = await authApi(
      custToken,
      `/api/voucher/purchase?slug=${discSlug}`,
      "POST",
      { amountSgd: 100, spendNowSgd: 0, skipPayment: true }
    );
    const j = await res.json();
    expect(res.status, JSON.stringify(j)).toBe(200);
    // 15% off → paid 85, balance 85
    expect(j.data.voucher.balanceSgd).toBe("85.00");
    expect(j.data.voucher.paidSgd).toBe("85.00");
  });
});

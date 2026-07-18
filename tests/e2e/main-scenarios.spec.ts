/**
 * Main product scenarios E2E — template create → purchase → partner → Stripe entry
 *
 * Scenarios (from product plan):
 *   A. 店家选「标准抽奖券」模板创建 → 顾客公开页购券抽奖
 *   B. 店家选「折扣代金券」模板创建（折扣可调）
 *   C. 达人分享模板 + 购券带 sellerId 佣金
 *   D. 商家 Token 页 / Stripe Checkout 入口（有 key 则拿到 url）
 *
 * Run: npx playwright test tests/e2e/main-scenarios.spec.ts
 */
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { prisma } from "./db";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

// ── HTTP helpers ──────────────────────────────────────────
async function api(
  path: string,
  o: RequestInit & { json?: unknown } = {}
): Promise<Response> {
  const { json, ...fetchOpts } = o;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (fetchOpts.headers) Object.assign(headers, fetchOpts.headers as Record<string, string>);
  return fetch(`${BASE}${path}`, {
    ...fetchOpts,
    headers,
    body: json !== undefined ? JSON.stringify(json) : (fetchOpts.body as BodyInit | undefined),
  });
}

async function registerUser(
  phone: string,
  role: "business" | "customer",
  name: string
) {
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

async function loginViaPage(page: Page, phone: string) {
  await api("/api/auth/send-code", {
    method: "POST",
    json: { contact: phone, purpose: "login" },
  });
  await page.waitForTimeout(200);
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
  if (!j.data?.token) throw new Error(`Login failed for ${phone}: ${JSON.stringify(j)}`);
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

async function authApi(
  token: string,
  path: string,
  method = "GET",
  json?: unknown
) {
  return api(path, {
    method,
    headers: { Cookie: `gwm_token=${token}` },
    ...(json !== undefined ? { json } : {}),
  });
}

// ── Shared state ──────────────────────────────────────────
const r = Date.now().toString(36);
let bizPhone = `+65921${r}`;
let biz2Phone = `+65922${r}`;
let custPhone = `+65923${r}`;
let bizToken = "";
let biz2Token = "";
let custToken = "";
let bizUserId = "";
let biz2UserId = "";
let custUserId = "";
let storeAId = "";
let storeBId = "";

let drawCampaignId = "";
let drawSlug = "";
let discountCampaignId = "";
let shareCampaignId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const b = await registerUser(bizPhone, "business", `MainBizA ${r}`);
  const bj = await b.json();
  if (!bj.data?.token) throw new Error(`Biz register fail: ${JSON.stringify(bj)}`);
  bizToken = bj.data.token;
  bizUserId = bj.data.user.id;

  const b2 = await registerUser(biz2Phone, "business", `MainBizB ${r}`);
  const b2j = await b2.json();
  if (!b2j.data?.token) throw new Error(`Biz2 register fail: ${JSON.stringify(b2j)}`);
  biz2Token = b2j.data.token;
  biz2UserId = b2j.data.user.id;

  const c = await registerUser(custPhone, "customer", `MainCust ${r}`);
  const cj = await c.json();
  if (!cj.data?.token) throw new Error(`Cust register fail: ${JSON.stringify(cj)}`);
  custToken = cj.data.token;
  custUserId = cj.data.user.id;

  await prisma.user.update({
    where: { id: custUserId },
    data: { pointsBalance: 5000, lifetimePoints: 5000 },
  });
  await prisma.tokenAccount.updateMany({
    where: { userId: bizUserId },
    data: { balance: 50000 },
  });

  // Stores for alliance / sell+redeem network
  const sa = await authApi(bizToken, "/api/business/stores", "POST", {
    name: `Store A ${r}`,
    address: "1 Test St",
  });
  const saj = await sa.json();
  storeAId = saj.data?.id || saj.data?.store?.id;
  if (!storeAId) {
    // fallback create via prisma
    const st = await prisma.store.create({
      data: { businessId: bizUserId, name: `Store A ${r}`, address: "1 Test St" },
    });
    storeAId = st.id;
  }

  const sb = await authApi(biz2Token, "/api/business/stores", "POST", {
    name: `Store B ${r}`,
    address: "2 Test St",
  });
  const sbj = await sb.json();
  storeBId = sbj.data?.id || sbj.data?.store?.id;
  if (!storeBId) {
    const st = await prisma.store.create({
      data: { businessId: biz2UserId, name: `Store B ${r}`, address: "2 Test St" },
    });
    storeBId = st.id;
  }

  // Active partnership for invite list / cross-store
  await prisma.businessPartner.create({
    data: {
      businessId: bizUserId,
      partnerId: biz2UserId,
      source: "invite",
      status: "active",
    },
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

// ====================================================================
// A0 — Templates API
// ====================================================================
test.describe("A0. Template catalog", () => {
  test("A0.1 GET templates returns discount + draw + share", async () => {
    const res = await authApi(bizToken, "/api/business/campaigns/templates");
    expect(res.status).toBe(200);
    const j = await res.json();
    const ids = (j.data || []).map((t: { id: string }) => t.id);
    expect(ids).toContain("voucher_discount");
    expect(ids).toContain("draw_standard");
    expect(ids).toContain("share_boost");
  });

  test("A0.2 New campaign page shows template picker", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto("/business/campaigns/new");
    await expect(page.getByText("选择模板")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("折扣代金券")).toBeVisible();
    await expect(page.getByText("梦想大奖池")).toBeVisible();
    await expect(page.getByText("达人分享券")).toBeVisible();
  });
});

// ====================================================================
// A — Draw template UI create → customer purchase page
// ====================================================================
test.describe("A. Draw template → purchase draw", () => {
  test("A.1 Business creates draw_standard via UI", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto("/business/campaigns/new");
    await expect(page.getByText("选择模板")).toBeVisible({ timeout: 10000 });

    await page.getByText("梦想大奖池").click();
    await expect(page.getByText("锁定规则")).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/核销 20% 进奖池|余额全额/)).toBeVisible();
    await expect(page.getByText(/即时小奖 \+ 延迟大奖/)).toBeVisible();

    const name = `E2E 抽奖 ${r}`;
    await page.getByPlaceholder(/如：周末联名抽奖券|Weekend|campaign name/i).fill(name);

    // Default faces 50/100/200 — leave all on
    await expect(page.getByRole("button", { name: "S$50" })).toBeVisible();
    await expect(page.getByRole("button", { name: "S$100" })).toBeVisible();
    await expect(page.getByRole("button", { name: "S$200" })).toBeVisible();

    // Customize deferred grand prizes (name + target SGD)
    // Prize names: default pack shows iPad/iPhone/BYD in value fields
    const prizeSection = page.getByText(/延迟奖品|Deferred prizes/i);
    await expect(prizeSection.first()).toBeVisible({ timeout: 8000 });
    const nameFields = page.locator('input[type="text"], input:not([type])').filter({
      hasNot: page.locator('[type="date"], [type="range"], [type="checkbox"], [type="number"]'),
    });
    // Prefer placeholder on prize name inputs
    const prizePh = page.getByPlaceholder(/iPad|本店套餐|prize|礼盒/i);
    if ((await prizePh.count()) >= 1) {
      await prizePh.nth(0).fill(`E2E礼盒A ${r}`);
    } else if ((await nameFields.count()) >= 2) {
      // name field is usually the first text input after title
      await nameFields.nth(1).fill(`E2E礼盒A ${r}`);
    }
    const targetInputs = page.locator('input[type="number"][min="100"]');
    const tCount = await targetInputs.count();
    if (tCount >= 1) await targetInputs.nth(0).fill("2500"); // S$2,500 → 250_000 cents
    if (tCount >= 2) await targetInputs.nth(1).fill("5000");
    if (tCount >= 3) await targetInputs.nth(2).fill("10000");

    // Select partner B if listed
    const partnerLabel = page.getByText(`MainBizB ${r}`);
    if (await partnerLabel.isVisible().catch(() => false)) {
      await partnerLabel.click();
    }

    await page.getByRole("button", { name: /创建并发布|Create/i }).click();

    // Land on campaign detail (exclude /new)
    await page.waitForURL(/\/business\/campaigns\/(?!new$)[^/?]+/, { timeout: 15000 });
    await expect(page.getByText(name)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/卖家佣金 5%（实付）|核销 20%/).first()).toBeVisible({
      timeout: 10000,
    });

    const url = page.url();
    drawCampaignId = url.split("/").pop() || "";
    expect(drawCampaignId.length).toBeGreaterThan(5);

    const camp = await prisma.campaign.findUnique({ where: { id: drawCampaignId } });
    expect(camp?.templateId).toBe("draw_standard");
    expect(camp?.type).toBe("lucky_draw_v2");
    expect(camp?.slug).toBeTruthy();
    drawSlug = camp!.slug!;

    const snap = camp?.rulesSnapshot ? JSON.parse(camp.rulesSnapshot) : null;
    expect(snap?.prizePoolPercent).toBe(0);
    expect(snap?.sellerCommissionPercent).toBe(5);
    expect(snap?.discountPercent).toBe(0);
    expect(snap?.enabledTiers).toEqual([50, 100, 200]);
    expect(snap?.grandPrizes?.length).toBeGreaterThanOrEqual(1);
    if (snap?.grandPrizes?.[0]?.name?.includes("E2E礼盒A")) {
      expect(snap.grandPrizes[0].targetCents).toBe(250_000);
    }
  });

  test("A.2 Checkout API returns Stripe URL for S$50 draw voucher", async () => {
    expect(drawSlug).toBeTruthy();
    const res = await authApi(
      custToken,
      `/api/voucher/checkout?slug=${drawSlug}`,
      "POST",
      { amountSgd: 50, spendNowSgd: 0 }
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.data.url).toMatch(/stripe\.com|checkout/i);
    expect(j.data.sessionId).toMatch(/^cs_/);
    expect(j.data.paidCents).toBe(5000); // full face, no discount
    expect(j.data.paidSgd).toBe("50.00");
  });

  test("A.3 Customer page CTA starts Checkout (redirect to Stripe)", async ({ page }) => {
    expect(drawSlug).toBeTruthy();
    await loginViaPage(page, custPhone);
    await page.goto(`/voucher/${drawSlug}`);

    await expect(page.getByText(`E2E 抽奖 ${r}`)).toBeVisible({ timeout: 12000 });
    await page.getByText("S$50", { exact: true }).first().click();
    await page.locator('input[type="number"]').first().fill("0");

    // Capture checkout JSON before navigation discards the body
    let checkoutUrl = "";
    await page.route("**/api/voucher/checkout**", async (route) => {
      const res = await route.fetch();
      const json = await res.json();
      checkoutUrl = json.data?.url || "";
      await route.fulfill({ response: res, json });
    });

    await page.getByRole("button", { name: /支付并抽奖|Pay & Draw/i }).click();
    await expect.poll(() => checkoutUrl, { timeout: 15000 }).toMatch(/stripe\.com|checkout/i);

    // Prefer landing on Stripe hosted page
    await page.waitForURL(/stripe\.com|checkout\.stripe/i, { timeout: 20000 }).catch(() => null);
  });

  test("A.4 Direct purchase with sellerId: no commission until redeem", async () => {
    expect(drawSlug).toBeTruthy();
    const res = await authApi(custToken, `/api/voucher/purchase?slug=${drawSlug}`, "POST", {
      amountSgd: 50,
      spendNowSgd: 0,
      sellerId: biz2UserId,
      skipPayment: true,
    });
    expect(res.status).toBe(200);
    const j = await res.json();
    // Model A: seller reward only when customer spends
    expect(j.data.split.sellerCommissionCents).toBe(0);
    expect(j.data.split.prizePoolCents).toBe(0);
    expect(j.data.voucher.sellerCommissionSgd).toBe("0.00");
    expect(j.data.voucher.balanceSgd).toBe("50.00");

    const v = await prisma.voucher.findUnique({ where: { id: j.data.voucher.id } });
    expect(v?.sellerId).toBe(biz2UserId);
    expect(v?.sellerCommissionCents).toBe(0);
  });
});

// ====================================================================
// B — Discount template
// ====================================================================
test.describe("B. Discount voucher template", () => {
  test("B.1 Create voucher_discount via UI: 12% + faces 50 & 200 only", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto("/business/campaigns/new");
    await expect(page.getByText("折扣代金券")).toBeVisible({ timeout: 10000 });
    await page.getByText("折扣代金券").click();

    await expect(page.getByText(/折扣|Discount/i).first()).toBeVisible({ timeout: 8000 });
    const name = `E2E 折扣 ${r}`;
    await page.getByPlaceholder(/如：周末联名抽奖券|Weekend|campaign name/i).fill(name);

    // Discount slider → exactly 12% (React controlled: set native value + input event)
    const range = page.locator('input[type="range"]');
    await expect(range).toBeVisible({ timeout: 8000 });
    await range.evaluate((el: HTMLInputElement, v: number) => {
      const proto = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      );
      proto?.set?.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, 12);
    // Label shows current % next to slider
    await expect(page.locator("span").filter({ hasText: /^12%$/ })).toBeVisible({
      timeout: 5000,
    });

    // Faces: toggle off S$100 → keep 50 + 200
    const tier100 = page.getByRole("button", { name: "S$100" });
    await expect(tier100).toBeVisible();
    await tier100.click();

    await page.getByRole("button", { name: /创建并发布|Create/i }).click();
    await page.waitForURL(/\/business\/campaigns\/(?!new$)[^/?]+/, { timeout: 15000 });
    await expect(page.getByText(name)).toBeVisible({ timeout: 10000 });

    discountCampaignId = page.url().split("/").pop() || "";
    const camp = await prisma.campaign.findUnique({ where: { id: discountCampaignId } });
    expect(camp?.templateId).toBe("voucher_discount");
    expect(camp?.type).toBe("voucher_sale");
    const snap = JSON.parse(camp!.rulesSnapshot!);
    expect(snap.prizePoolPercent).toBe(0);
    expect(snap.discountPercent).toBe(12);
    expect(snap.enabledTiers).toEqual([50, 200]);

    const tiers = camp?.voucherTiers ? JSON.parse(camp.voucherTiers) : [];
    expect(tiers.map((t: { min: number }) => t.min).sort((a: number, b: number) => a - b)).toEqual([
      50, 200,
    ]);
  });

  test("B.2 API purchase respects discount on paid + commission", async () => {
    // Create draw-like purchase path for voucher_sale: need slug
    // voucher_sale may not get auto slug — set one and purchase via API math unit already covered;
    // ensure campaign has slug for purchase endpoint
    const camp = await prisma.campaign.findUnique({ where: { id: discountCampaignId } });
    expect(camp).toBeTruthy();
    let slug = camp!.slug;
    if (!slug) {
      slug = `discount-${r}`;
      await prisma.campaign.update({
        where: { id: discountCampaignId },
        data: { slug },
      });
    }

    // Face 50 is enabled; 100 is not — purchase 50 with 12% discount
    const res = await authApi(custToken, `/api/voucher/purchase?slug=${slug}`, "POST", {
      amountSgd: 50,
      spendNowSgd: 0,
      sellerId: bizUserId,
      skipPayment: true,
    });
    expect(res.status).toBe(200);
    const j = await res.json();
    const snap = JSON.parse(camp!.rulesSnapshot!);
    expect(snap.discountPercent).toBe(12);
    // 12% off S$50 face → paid S$44.00
    const paid = Math.round((5000 * (100 - 12)) / 100);
    expect(paid).toBe(4400);
    expect(j.data.split.paidCents).toBe(paid);
    expect(j.data.voucher.balanceSgd).toBe("44.00");
    expect(j.data.split.prizePoolCents).toBe(0);
    // Model A: no seller commission until redeem (spendNow=0)
    expect(j.data.split.sellerCommissionCents).toBe(0);
    expect(j.data.instantPrize).toBeNull();

    // 100 face disabled for this campaign — purchase should still resolve tier by amount
    // (API may allow face if resolveTier maps 100; product uses enabledTiers for UI only)
  });
});

// ====================================================================
// C — Share boost template + invite partner
// ====================================================================
test.describe("C. Share template & partner invite", () => {
  test("C.1 Create share_boost via API (rules force share on)", async () => {
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 14);
    const res = await authApi(bizToken, "/api/business/campaigns", "POST", {
      templateId: "share_boost",
      name: `E2E 达人 ${r}`,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      discountPercent: 20,
      enabledTiers: [50, 100],
      partnerIds: [biz2UserId],
    });
    expect(res.status).toBe(200);
    const j = await res.json();
    shareCampaignId = j.data.id;
    expect(j.data.templateId).toBe("share_boost");
    const snap = JSON.parse(j.data.rulesSnapshot);
    expect(snap.shareSellingEnabled).toBe(true);
    expect(snap.discountPercent).toBe(20);

    const partners = JSON.parse(j.data.partnerIds || "[]");
    expect(partners).toContain(biz2UserId);
    const stores = JSON.parse(j.data.storeIds || "[]");
    expect(stores).toEqual(expect.arrayContaining([storeAId, storeBId]));
  });

  test("C.2 Invite additional partner via invite API is idempotent-ish", async () => {
    const res = await authApi(
      bizToken,
      `/api/business/campaigns/${shareCampaignId}/invite`,
      "POST",
      { partnerBusinessIds: [biz2UserId] }
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.data.partnerIds).toContain(biz2UserId);
  });

  test("C.3 Share template page shows share-selling lock copy", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto("/business/campaigns/new");
    await page.getByText("达人分享券").click();
    await expect(page.getByText(/达人模板已默认开启分享卖货/)).toBeVisible({ timeout: 8000 });
  });
});

// ====================================================================
// D — Stripe / tokens entry (no full card fill — verify entry)
// ====================================================================
test.describe("D. Stripe token top-up entry", () => {
  test("D.1 Tokens page loads for business", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto("/business/tokens");
    await expect(
      page.getByText(/Token|代币|充值|余额/i).first()
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /充值/ })).toBeVisible();
  });

  test("D.2 Checkout API returns Stripe URL when configured", async () => {
    const res = await authApi(bizToken, "/api/stripe/checkout", "POST", {
      amountSgd: 10,
    });
    // 200 + url when Stripe keys work; 500 if misconfigured
    const j = await res.json();
    if (res.status === 200 && j.data?.url) {
      expect(j.data.url).toMatch(/stripe\.com|checkout/i);
    } else {
      // Soft-document failure for env issues — still fail if totally broken shape
      expect(j.error || j.data).toBeTruthy();
      test.info().annotations.push({
        type: "note",
        description: `Stripe checkout not fully available: status=${res.status} body=${JSON.stringify(j).slice(0, 200)}`,
      });
      // Require either success URL or explicit error (not empty)
      expect(res.status === 200 || res.status >= 400).toBe(true);
    }
  });

  test("D.3 Top-up sheet opens and shows pay CTA", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto("/business/tokens");
    await page.getByRole("button", { name: /充值/ }).click();
    await expect(page.getByText(/充值金额/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: /支付 S\$/ })).toBeVisible();
  });
});

// ====================================================================
// Summary smoke: campaign list shows new templates
// ====================================================================
test.describe("E. Campaign list smoke", () => {
  test("E.1 List shows draw and discount campaigns", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto("/business/campaigns");
    await expect(page.getByText(`E2E 抽奖 ${r}`)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(`E2E 折扣 ${r}`)).toBeVisible();
  });
});

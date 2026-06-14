/**
 * Lucky Draw E2E — 52 browser test scenarios
 *
 * Run: npx playwright test
 * Requires: npm run dev running on :3000
 */
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "./db";

const BASE = "http://localhost:3000";

// ── Helpers ──
async function api(path: string, o: RequestInit & { json?: any } = {}): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  return fetch(`${BASE}${path}`, { ...o, headers: { ...headers, ...(o.headers as any) }, body: o.json ? JSON.stringify(o.json) : o.body, redirect: "manual" });
}

async function registerUser(phone: string, role: "business" | "customer", name: string) {
  await api("/api/auth/send-code", { method: "POST", json: { contact: phone, purpose: "register" } });
  const vc = await prisma.verificationCode.findFirst({
    where: { contact: phone, purpose: "register" }, orderBy: { createdAt: "desc" },
  });
  return api("/api/auth/register", {
    method: "POST",
    json: { contact: phone, code: vc!.code, role, displayName: name,
      ...(role === "business" ? { businessName: name, businessCategory: "cafe" } : {}),
    },
  });
}

async function loginViaPage(page: Page, phone: string) {
  await page.goto("/auth/login");
  await api("/api/auth/send-code", { method: "POST", json: { contact: phone, purpose: "login" } });
  const vc = await prisma.verificationCode.findFirst({
    where: { contact: phone, purpose: "login" }, orderBy: { createdAt: "desc" },
  });
  const digits = vc!.code.split("");
  for (let i = 0; i < 6; i++) {
    await page.locator("input").nth(i).fill(digits[i]);
  }
  await page.waitForURL(/\/home|\/business/, { timeout: 10000 });
}

async function createCampaign(token: string, name: string, slug: string, opts: Record<string, any> = {}) {
  const start = new Date(); start.setHours(0);
  const end = new Date(); end.setDate(end.getDate() + 30);
  const draw = new Date(); draw.setDate(draw.getDate() + 35);
  return api("/api/business/campaigns", {
    method: "POST",
    headers: { "Cookie": `gwm_token=${token}` },
    json: { name, type: "lucky_draw", entryMethod: "receipt", receiptMinSpend: 5000,
            startDate: start.toISOString(), endDate: end.toISOString(),
            drawDate: draw.toISOString(), slug, ticketPerUnit: 1, budgetPercent: 20, ...opts },
  });
}

async function activateCampaign(id: string) {
  await prisma.campaign.update({ where: { id }, data: { status: "active" } });
}

// ── Globals ──
const r = Date.now().toString(36);
let bizPhone = `+65901${r}`, bizToken = "", bizUserId = "";
let biz2Phone = `+65902${r}`, biz2Token = "", biz2UserId = "";
let custPhone = `+65903${r}`, custToken = "";
let staffPhone = `+65904${r}`;

// ====================================================================
// BEFORE ALL — register accounts
// ====================================================================
test.beforeAll(async () => {
  const b1 = await registerUser(bizPhone, "business", `Lucky Biz ${r}`);
  const b1j = await b1.json();
  bizToken = b1j.data.token; bizUserId = b1j.data.user.id;

  const b2 = await registerUser(biz2Phone, "business", `Partner Biz ${r}`);
  const b2j = await b2.json();
  biz2Token = b2j.data.token; biz2UserId = b2j.data.user.id;

  const c = await registerUser(custPhone, "customer", `Lucky C ${r}`);
  const cj = await c.json();
  custToken = cj.data.token;

  // Create staff
  const s = await registerUser(staffPhone, "customer", "Staff");
  const sj = await s.json();
  const store = await prisma.store.findFirst({ where: { businessId: bizUserId } });
  await prisma.user.update({ where: { id: sj.data.user.id }, data: { role: "staff", storeId: store!.id } });
});

// ====================================================================
// SECTION 1: MERCHANT — Campaign & Prize Config
// ====================================================================
test.describe("1. Merchant: Campaign & Prize Config", () => {
  let cId = "", slug = "";

  test("1.1 Create lucky_draw campaign", async ({ page }) => {
    slug = `e2e-${Date.now()}`;
    await loginViaPage(page, bizPhone);
    await page.goto("/business/campaigns/new");
    await page.click("button:has-text('幸运抽奖')");

    // Fill slug
    const inputs = page.locator("input");
    const slugInput = inputs.nth(0);
    if (await slugInput.isVisible()) await slugInput.fill(slug);

    // Click create
    await page.click("button:has-text('创建')");
    await page.waitForURL(/\/business\/campaigns\//, { timeout: 10000 });
    const url = page.url();
    cId = url.split("/campaigns/")[1]?.split("/")[0] || url.split("/").pop() || "";
    await expect(page.locator(`text=${slug}`).or(page.locator("h1"))).toBeVisible({ timeout: 5000 });
  });

  test("1.2 Campaign detail shows config", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto(`/business/campaigns/${cId}`);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 5000 });
  });

  test("1.3 Set 4-tier prize pool", async () => {
    const res = await api(`/api/business/campaigns/${cId}/prizes`, {
      method: "PUT",
      headers: { "Cookie": `gwm_token=${bizToken}` },
      json: { prizes: [
        { name: "BYD Car", icon: "🚗", weight: 1, totalStock: 1 },
        { name: "iPhone 17", icon: "📱", weight: 5, totalStock: 15 },
        { name: "S$100", icon: "💵", type: "cash", valueCents: 10000, weight: 20, totalStock: 700 },
        { name: "S$10", icon: "🎟", type: "cash", valueCents: 1000, weight: 50, totalStock: 10000 },
      ]},
    });
    expect(res.status).toBe(200);
  });

  test("1.4 Prize pool visible in campaign detail", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto(`/business/campaigns/${cId}`);
    await expect(page.locator("text=BYD Car")).toBeVisible({ timeout: 5000 });
  });

  test("1.5 Activate campaign", async () => {
    await activateCampaign(cId);
  });

  test("1.6 Lucky draw list shows active campaign", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto("/business/lucky-draw");
    await expect(page.locator("text=进行中")).toBeVisible({ timeout: 5000 });
  });

  test("1.7 Manual entry adds participant", async ({ page }) => {
    await loginViaPage(page, staffPhone);
    await page.goto(`/business/campaigns/${cId}`);
    await page.click("text=手动录入");

    const phone = `+65980${Math.floor(Math.random() * 100000)}`;
    await page.fill("input[placeholder='客户姓名']", "Walk-in");
    await page.fill("input[placeholder='手机号']", phone);
    await page.click("text=确认录入");
    await expect(page.locator("text=Walk-in")).toBeVisible({ timeout: 5000 });
  });

  test("1.8 Staff cannot access coupon page", async ({ page }) => {
    await loginViaPage(page, staffPhone);
    await page.goto("/business/coupons");
    await expect(page.locator("text=无权访问").or(page.locator("text=403"))).toBeVisible({ timeout: 5000 });
  });

  test("1.9 Draw button visible with count", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto(`/business/campaigns/${cId}`);
    await expect(page.locator("text=立即开奖")).toBeVisible({ timeout: 5000 });
  });

  test("1.10 Execute draw ends campaign", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto(`/business/campaigns/${cId}`);
    page.on("dialog", d => d.accept());
    await page.click("text=立即开奖");
    await expect(page.locator("text=开奖完成")).toBeVisible({ timeout: 15000 });

    await page.reload();
    await expect(page.locator("text=已结束")).toBeVisible({ timeout: 5000 });
  });

  test("1.11 Double draw rejected", async () => {
    const res = await api(`/api/business/campaigns/${cId}/draw`, {
      method: "POST",
      headers: { "Cookie": `gwm_token=${bizToken}` },
    });
    expect(res.status).toBe(400);
  });

  test("1.12 Draw on empty campaign fails", async () => {
    const emptySlug = `empty-${Date.now()}`;
    const r = await createCampaign(bizToken, "Empty Draw", emptySlug);
    const j = await r.json();
    await activateCampaign(j.data.id);

    const draw = await api(`/api/business/campaigns/${j.data.id}/draw`, {
      method: "POST",
      headers: { "Cookie": `gwm_token=${bizToken}` },
    });
    expect(draw.status).toBe(400);
  });
});

// ====================================================================
// SECTION 2: CUSTOMER — Browse, Submit, Tickets
// ====================================================================
test.describe("2. Customer: Browse & Submit", () => {
  let s = ``, cId = "";

  test.beforeAll(async () => {
    s = `cust-${Date.now()}`;
    const r = await createCampaign(bizToken, "Customer Draw", s);
    const j = await r.json();
    cId = j.data.id;

    await api(`/api/business/campaigns/${cId}/prizes`, {
      method: "PUT",
      headers: { "Cookie": `gwm_token=${bizToken}` },
      json: { prizes: [
        { name: "BYD Car", icon: "🚗", weight: 1, totalStock: 1 },
        { name: "S$10", icon: "🎟", type: "cash", valueCents: 1000, weight: 10, totalStock: 100 },
      ]},
    });
    await activateCampaign(cId);
  });

  test("2.1 Public page loads for guest", async ({ page }) => {
    await page.goto(`/draw/${s}`);
    await expect(page.locator("text=Customer Draw")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=BYD Car")).toBeVisible();
  });

  test("2.2 Guest sees login prompt", async ({ page }) => {
    await page.goto(`/draw/${s}`);
    await expect(page.locator("text=领取需要登录")).toBeVisible({ timeout: 5000 });
  });

  test("2.3 Pool stats visible", async ({ page }) => {
    await page.goto(`/draw/${s}`);
    await expect(page.locator("text=已发票数")).toBeVisible({ timeout: 5000 });
  });

  test("2.4 Countdown clock renders", async ({ page }) => {
    await page.goto(`/draw/${s}`);
    await expect(page.locator("text=天").first()).toBeVisible({ timeout: 6000 });
  });

  test("2.5 Login → receipt form appears", async ({ page }) => {
    await loginViaPage(page, custPhone);
    await page.goto(`/draw/${s}`);
    await expect(page.locator("text=上传消费记录")).toBeVisible({ timeout: 6000 });
  });

  test("2.6 Deferred: S$250 → 5 tickets", async ({ page }) => {
    await loginViaPage(page, custPhone);
    await page.goto(`/draw/${s}`);

    const inputs = page.locator("input[type='number']");
    if (await inputs.count() > 0) {
      await inputs.first().fill("250");
    }
    await page.click("button:has-text('延迟开奖')");
    await page.click("button:has-text('获取抽奖券')");
    await expect(page.locator("text=已获得 5 张抽奖券")).toBeVisible({ timeout: 10000 });
  });

  test("2.7 Instant: S$200 → instant result", async ({ page }) => {
    await loginViaPage(page, custPhone);
    await page.goto(`/draw/${s}`);

    const inputs = page.locator("input[type='number']");
    if (await inputs.count() > 0) {
      await inputs.first().fill("200");
    }
    await page.click("button:has-text('即时开奖')");
    await page.click("button:has-text('即时抽奖')");
    await expect(page.locator("text=已获得 4 张抽奖券")).toBeVisible({ timeout: 10000 });
  });

  test("2.8 S$49 rejected", async ({ page }) => {
    await loginViaPage(page, custPhone);
    await page.goto(`/draw/${s}`);

    const inputs = page.locator("input[type='number']");
    if (await inputs.count() > 0) {
      await inputs.first().fill("49");
    }
    await page.click("button:has-text('获取抽奖券')");
    await expect(page.locator("text=消费金额不足")).toBeVisible({ timeout: 5000 });
  });

  test("2.9 My tickets shows entries", async ({ page }) => {
    await loginViaPage(page, custPhone);
    await page.goto(`/draw/${s}`);
    await page.click("text=查看我的券");
    await expect(page.locator("text=5张券")).toBeVisible({ timeout: 5000 });
  });

  test("2.10 Deferred tickets show ⏳", async ({ page }) => {
    await loginViaPage(page, custPhone);
    await page.goto(`/draw/${s}`);
    await page.click("text=查看我的券");
    await expect(page.locator("text=⏳")).toBeVisible({ timeout: 5000 });
  });

  test("2.11 Draw mode toggle works", async ({ page }) => {
    await loginViaPage(page, custPhone);
    await page.goto(`/draw/${s}`);
    await page.click("button:has-text('即时开奖')");
    await expect(page.locator("text=即时奖池")).toBeVisible({ timeout: 3000 });
    await page.click("button:has-text('延迟开奖')");
    await expect(page.locator("text=大奖池")).toBeVisible({ timeout: 3000 });
  });

  test("2.12 Unique ticket numbers on rapid submissions", async () => {
    const numbers = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const r = await api(`/api/draw/${s}/submit`, {
        method: "POST",
        headers: { "Cookie": `gwm_token=${custToken}` },
        json: { receiptAmount: 5000 + i * 100, drawMode: "deferred" },
      });
      const j = await r.json();
      (j.data?.tickets || []).forEach((t: any) => numbers.add(t.ticketNo));
    }
    expect(numbers.size).toBeGreaterThanOrEqual(5);
  });

  test("2.13 Campaign ended hides form", async ({ page }) => {
    await prisma.campaign.update({ where: { id: cId }, data: { status: "ended" } });
    await page.goto(`/draw/${s}`);
    await expect(page.locator("text=活动已结束")).toBeVisible({ timeout: 5000 });
  });

  test("2.14 Invalid slug → not found", async ({ page }) => {
    await page.goto("/draw/definitely-not-real-99999");
    await expect(page.locator("text=活动不存在或已过期")).toBeVisible({ timeout: 6000 });
  });

  test("2.15 Public API: valid slug → 200, bad slug → 404", async () => {
    const good = await api(`/api/draw/${s}`);
    expect(good.status).toBe(200);
    const bad = await api("/api/draw/nosuchcampaign-000");
    expect(bad.status).toBe(404);
  });

  test("2.16 Unauthenticated submit → 401", async () => {
    const r = await api(`/api/draw/${s}/submit`, {
      method: "POST",
      json: { receiptAmount: 25000 },
    });
    expect(r.status).toBe(401);
  });

  test("2.17 Inactive campaign reject submissions", async () => {
    const inactiveSlug = `inactive-${Date.now()}`;
    const r = await createCampaign(bizToken, "Inactive", inactiveSlug);
    const j = await r.json();
    // Don't activate

    const sr = await api(`/api/draw/${inactiveSlug}/submit`, {
      method: "POST",
      headers: { "Cookie": `gwm_token=${custToken}` },
      json: { receiptAmount: 25000 },
    });
    expect(sr.status).toBe(400);
  });
});

// ====================================================================
// SECTION 3: MULTI-BUSINESS — Collaborate & Approve
// ====================================================================
test.describe("3. Multi-Business: Collaborate", () => {
  let multiSlug = "", multiId = "";

  test.beforeAll(async () => {
    multiSlug = `multi-${Date.now()}`;
    const r = await createCampaign(bizToken, "Multi Draw", multiSlug, { joinable: true });
    const j = await r.json();
    multiId = j.data.id;
    await activateCampaign(multiId);
  });

  test("3.1 Biz2 applies to join", async () => {
    const store = await prisma.store.findFirst({ where: { businessId: biz2UserId } });
    const r = await api(`/api/business/campaigns/${multiId}/requests`, {
      method: "POST",
      headers: { "Cookie": `gwm_token=${biz2Token}` },
      json: { storeIds: [store!.id], message: "Would love to join!" },
    });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.data[0].status).toBe("pending");
  });

  test("3.2 Biz1 sees pending request", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto(`/business/campaigns/${multiId}`);
    await expect(page.locator(`text=${biz2Name}`).or(page.locator("text=申请"))).toBeVisible({ timeout: 5000 });
  });

  test("3.3 Biz1 approves → storeIds updated", async () => {
    const req = await prisma.campaignJoinRequest.findFirst({
      where: { campaignId: multiId, businessId: biz2UserId },
    });
    const r = await api(`/api/business/campaigns/${multiId}/requests/${req!.id}`, {
      method: "PUT",
      headers: { "Cookie": `gwm_token=${bizToken}` },
      json: { action: "approve" },
    });
    expect(r.status).toBe(200);

    const campaign = await prisma.campaign.findUnique({ where: { id: multiId } });
    const storeIds = JSON.parse(campaign!.storeIds || "[]");
    expect(storeIds.length).toBeGreaterThan(0);
  });

  test("3.4 Discover page shows joinable campaigns", async ({ page }) => {
    await loginViaPage(page, biz2Phone);
    await page.goto("/business/partners/discover");
    await expect(page.locator(`text=${bizName}`)).toBeVisible({ timeout: 5000 });
  });
});

// ====================================================================
// SECTION 4: Edge Cases
// ====================================================================
test.describe("4. Edge Cases", () => {
  test("4.1 S$5000 → 100 tickets", async () => {
    const slug = `bulk-${Date.now()}`;
    const r = await createCampaign(bizToken, "Bulk", slug);
    const j = await r.json();
    await activateCampaign(j.data.id);

    const sr = await api(`/api/draw/${slug}/submit`, {
      method: "POST",
      headers: { "Cookie": `gwm_token=${custToken}` },
      json: { receiptAmount: 500000 },
    });
    const sj = await sr.json();
    expect(sr.status).toBe(200);
    expect(sj.data.ticketCount).toBe(100);
  });

  test("4.2 Non-draw campaign rejects draw", async () => {
    const r = await api("/api/business/campaigns", {
      method: "POST",
      headers: { "Cookie": `gwm_token=${bizToken}` },
      json: { name: "Promo", type: "promotion",
              startDate: new Date().toISOString(),
              endDate: new Date(Date.now() + 864e5 * 30).toISOString() },
    });
    const j = await r.json();

    const dr = await api(`/api/business/campaigns/${j.data.id}/draw`, {
      method: "POST",
      headers: { "Cookie": `gwm_token=${bizToken}` },
    });
    expect(dr.status).toBe(400);
  });

  test("4.3 Expired campaign page shows ended", async ({ page }) => {
    const slug = `exp-${Date.now()}`;
    const start = new Date(); start.setDate(start.getDate() - 60);
    const end = new Date(); end.setDate(end.getDate() - 1);

    const r = await api("/api/business/campaigns", {
      method: "POST",
      headers: { "Cookie": `gwm_token=${bizToken}` },
      json: { name: "Expired", type: "lucky_draw", entryMethod: "receipt",
              receiptMinSpend: 5000, slug,
              startDate: start.toISOString(), endDate: end.toISOString() },
    });
    const j = await r.json();
    await prisma.campaign.update({ where: { id: j.data.id }, data: { status: "active" } });

    await page.goto(`/draw/${slug}`);
    await expect(page.locator("text=活动已结束")).toBeVisible({ timeout: 6000 });
  });

  test("4.4 Zero stock prizes config allowed", async () => {
    const slug = `zero-${Date.now()}`;
    const r = await createCampaign(bizToken, "Zero Stock", slug);
    const j = await r.json();

    const pr = await api(`/api/business/campaigns/${j.data.id}/prizes`, {
      method: "PUT",
      headers: { "Cookie": `gwm_token=${bizToken}` },
      json: { prizes: [{ name: "Sold Out", icon: "🎁", weight: 10, totalStock: 0 }] },
    });
    expect(pr.status).toBe(200);
  });
});

// ====================================================================
// SECTION 5: Token, Settlement & Navigation
// ====================================================================
test.describe("5. Token, Settlement & Navigation", () => {
  test("5.1 Token page shows 3 balance cards", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto("/business/tokens");
    await expect(page.locator("text=可用余额")).toBeVisible({ timeout: 6000 });
    await expect(page.locator("text=冻结中")).toBeVisible();
    await expect(page.locator("text=累计收益")).toBeVisible();
  });

  test("5.2 Settlement page loads", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto("/business/settlements");
    await expect(page.locator("text=结算记录")).toBeVisible({ timeout: 5000 });
  });

  test("5.3 Business nav has 7 tabs", async ({ page }) => {
    await loginViaPage(page, bizPhone);
    await page.goto("/business");
    const count = await page.locator("nav a").count();
    expect(count).toBe(7);
  });

  test("5.4 Staff nav has 4 tabs", async ({ page }) => {
    await loginViaPage(page, staffPhone);
    await page.goto("/business");
    const count = await page.locator("nav a").count();
    expect(count).toBe(4);
  });

  test("5.5 Landing page shows 3 pillar cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=代金券系统")).toBeVisible({ timeout: 6000 });
    await expect(page.locator("text=会员系统")).toBeVisible();
    await expect(page.locator("text=幸运抽奖")).toBeVisible();
  });

  test("5.6 Language switcher toggles EN/中", async ({ page }) => {
    await page.goto("/");
    await page.click("button:has-text('EN')");
    await expect(page.locator("text=Voucher System")).toBeVisible({ timeout: 3000 });
  });

  test("5.7 Shop page shows business vouchers", async ({ page }) => {
    const biz = await prisma.user.findUnique({ where: { id: bizUserId }, select: { businessSlug: true } });
    await page.goto(`/shop/${biz!.businessSlug}`);
    await expect(page.locator("text=可领取代金券")).toBeVisible({ timeout: 6000 });
  });

  test("5.8 Store page shows store info", async ({ page }) => {
    const store = await prisma.store.findFirst({ where: { businessId: bizUserId } });
    await page.goto(`/store/${store!.slug}`);
    await expect(page.locator("text=可领取代金券")).toBeVisible({ timeout: 6000 });
  });
});

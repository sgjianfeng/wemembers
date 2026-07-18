/**
 * Screenshot capture — visits every page and takes fullPage screenshots
 *
 * Run: npx playwright test tests/screenshots/capture.ts
 * Requires: npm run dev running on :3000
 */
import { test, type Page } from "@playwright/test";
import { prisma, getVerificationCode } from "../e2e/db";

const BASE = "http://localhost:3000";

// ── API helpers ──
async function api(path: string, o: RequestInit & { json?: any } = {}): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { json, ...fetchOpts } = o;
  return fetch(`${BASE}${path}`, {
    ...fetchOpts, headers: { ...headers, ...(fetchOpts.headers as any) },
    body: json ? JSON.stringify(json) : fetchOpts.body,
    redirect: "manual",
  });
}

async function authApi(token: string, path: string, method = "GET", json?: any) {
  return api(path, { method, headers: { "Cookie": `gwm_token=${token}` }, ...(json ? { json } : {}) });
}

async function registerUser(phone: string, role: string, name: string): Promise<{ token: string; userId: string; businessSlug?: string }> {
  await api("/api/auth/send-code", { method: "POST", json: { contact: phone, purpose: "register" } });
  await new Promise(r => setTimeout(r, 300));
  const vc = await getVerificationCode(phone, "register");
  if (!vc) throw new Error(`No registration code for ${phone}`);
  const res = await api("/api/auth/register", {
    method: "POST",
    json: { contact: phone, code: vc.code, role, displayName: name,
      ...(role === "business" ? { businessName: name, businessCategory: "cafe" } : {}),
    },
  });
  const j = await res.json();
  return { token: j.data.token, userId: j.data.user.id, businessSlug: j.data.user.businessSlug };
}

async function getFreshToken(phone: string): Promise<string> {
  await api("/api/auth/send-code", { method: "POST", json: { contact: phone, purpose: "login" } });
  await new Promise(r => setTimeout(r, 300));
  const vc = await getVerificationCode(phone, "login");
  if (!vc) throw new Error(`No login code for ${phone}`);
  const res = await api("/api/auth/verify-code", { method: "POST", json: { contact: phone, code: vc.code, purpose: "login" } });
  const j = await res.json();
  return j.data.token;
}

async function setCookie(page: Page, token: string) {
  await page.context().addCookies([{ name: "gwm_token", value: token, domain: "localhost", path: "/" }]);
}

// ── Screenshot helper ──
async function shot(page: Page, id: string) {
  await page.screenshot({ path: `tests/screenshots/output/${id}.png`, fullPage: true });
}

// ── Metadata collector ──
const pagesMeta: { id: string; group: string; url: string; title: string; description: string; role: string }[] = [];
function meta(id: string, group: string, url: string, description: string, role: string) {
  pagesMeta.push({ id, group, url, title: "", description, role });
}

// ── Globals ──
const R = Date.now().toString(36);
const BIZ_PHONE = `+65951${R}`;
const CUST_PHONE = `+65952${R}`;
const STAFF_PHONE = `+65953${R}`;
const ADMIN_PHONE = `+65954${R}`;

let bizToken = ""; let bizUserId = "";
let custToken = ""; let custUserId = "";
let staffToken = "";
let adminToken = "";

// ── IDs / slugs populated at seed time ──
let VOUCHER_SLUG = "";
let CUST_COUPON_ID = "";   // for redeem page
let BIZ_SLUG = "";          // for shop page
let STORE_SLUG = "";
let CAMPAIGN_ID = "";
let COUPON_ID = "";
let MEMBER_ID = "";
let PUBLISHED_COUPON_ID = "";
let BUSINESS_ID = "";       // for admin/businesses/[id]
let PROMOTER_CODE = "";

// ====================================================================
// SEED — one test that sets up all data
// ====================================================================
test("seed all test data", async () => {
  // ── Register accounts (registerUser now returns { token, userId, businessSlug }) ──
  const b = await registerUser(BIZ_PHONE, "business", `Biz-${R}`);
  bizToken = b.token; bizUserId = b.userId;
  // businessSlug not in register API response — query from DB
  const bizUser = await prisma.user.findUnique({ where: { id: bizUserId }, select: { businessSlug: true } });
  BIZ_SLUG = bizUser?.businessSlug || "";

  const c = await registerUser(CUST_PHONE, "customer", `截图用户-${R}`);
  custToken = c.token; custUserId = c.userId;

  const s = await registerUser(STAFF_PHONE, "customer", "店员截图");
  const staffStore = await prisma.store.findFirst({ where: { businessId: bizUserId } });
  await prisma.user.update({ where: { id: s.userId }, data: { role: "staff", storeId: staffStore!.id } });
  staffToken = await getFreshToken(STAFF_PHONE); // fresh token with staff role

  // Admin: register as customer, change role, then get fresh token
  const a = await registerUser(ADMIN_PHONE, "customer", "管理员截图");
  await prisma.user.update({ where: { id: a.userId }, data: { role: "admin" } });
  adminToken = await getFreshToken(ADMIN_PHONE); // fresh token with admin role
  BUSINESS_ID = bizUserId;

  // ── Token accounts ──
  await prisma.tokenAccount.upsert({ where: { userId: bizUserId }, create: { userId: bizUserId, balance: 50000 }, update: { balance: 50000 } });
  await prisma.tokenAccount.upsert({ where: { userId: custUserId }, create: { userId: custUserId, balance: 1000 }, update: { balance: 1000 } });

  // ── Seed points & membership ──
  await prisma.user.update({ where: { id: custUserId }, data: { pointsBalance: 3000, lifetimePoints: 5000 } });
  await prisma.membership.create({
    data: { businessId: bizUserId, customerId: custUserId, points: 1500, visitsCount: 12, totalSpent: 350, tier: "gold" },
  });
  const member = await prisma.membership.findFirst({ where: { businessId: bizUserId, customerId: custUserId } });
  MEMBER_ID = member!.id;

  // ── Membership tier config ──
  await prisma.membershipTierConfig.createMany({
    data: [
      { businessId: bizUserId, tier: "regular", name: "普通会员", pointsRequired: 0, color: "#999", benefits: "[]" },
      { businessId: bizUserId, tier: "silver", name: "银卡会员", pointsRequired: 200, color: "#C0C0C0", benefits: '["95折"]' },
      { businessId: bizUserId, tier: "gold", name: "金卡会员", pointsRequired: 500, color: "#FFD700", benefits: '["9折","生日礼"]' },
    ],
  });

  // ── Store ──
  const store = await prisma.store.findFirst({ where: { businessId: bizUserId } });
  STORE_SLUG = store?.slug || BIZ_SLUG;

  // ── Voucher v2 Campaign ──
  const start = new Date(); start.setHours(0);
  const end = new Date(); end.setDate(end.getDate() + 60);
  VOUCHER_SLUG = `ss-vouch-${R}`;
  const camp = await prisma.campaign.create({
    data: {
      businessId: bizUserId, name: "截图测试-代金券抽奖", type: "lucky_draw_v2",
      slug: VOUCHER_SLUG, status: "active",
      startDate: start, endDate: end,
      budgetPercent: 20, instantPoolCents: 30000,
      storeIds: JSON.stringify([store!.id]),
    },
  });
  CAMPAIGN_ID = camp.id;

  // ── Published Coupons ──
  const now = new Date(); const future = new Date(); future.setMonth(future.getMonth() + 3);
  const cp = await prisma.coupon.create({
    data: {
      businessId: bizUserId, title: `截图测试-咖啡券-${R}`, type: "fixed_amount", valueCents: 1500,
      minSpendCents: 3000, pointsRequired: 80, totalQuantity: 50, remainingQuantity: 50,
      validFrom: now, validUntil: future, status: "published", isGiftable: true, perCustomerLimit: 3,
    },
  });
  PUBLISHED_COUPON_ID = cp.id;
  COUPON_ID = cp.id;

  // Create another coupon (for list variety)
  await prisma.coupon.create({
    data: {
      businessId: bizUserId, title: `截图测试-甜品券-${R}`, type: "percentage", valueCents: 15,
      minSpendCents: 5000, pointsRequired: 50, totalQuantity: 30, remainingQuantity: 30,
      validFrom: now, validUntil: future, status: "published", isGiftable: false, perCustomerLimit: 1,
    },
  });
  await prisma.coupon.create({
    data: {
      businessId: bizUserId, title: `截图测试-新品体验-${R}`, type: "free_item", valueCents: 800,
      minSpendCents: 0, pointsRequired: 120, totalQuantity: 10, remainingQuantity: 10,
      validFrom: now, validUntil: future, status: "published", isGiftable: true, perCustomerLimit: 2,
    },
  });

  // ── Claimed coupon (for redeem / wallet) ──
  const claimRes = await authApi(custToken, `/api/coupons/${cp.id}/claim`, "POST");
  if (claimRes.ok) {
    const j = await claimRes.json();
    CUST_COUPON_ID = j.data?.claim?.id || "";
  }

  // ── Voucher purchase ──
  try {
    await authApi(custToken, `/api/voucher/purchase?slug=${VOUCHER_SLUG}`, "POST", { amountSgd: 50, spendNowSgd: 0 });
  } catch {}

  // ── Promoter link ──
  await prisma.promoterAccount.upsert({ where: { userId: custUserId }, create: { userId: custUserId, totalEarned: 0, availableBalance: 0, isActive: true }, update: {} });
  const pl = await prisma.promoterLink.create({
    data: { promoterId: custUserId, couponId: cp.id, code: `SS${R.toUpperCase()}` },
  });
  PROMOTER_CODE = pl.code;

  // ── Check-in streak ──
  await prisma.checkIn.create({ data: { userId: custUserId, date: new Date().toISOString().slice(0, 10), dayNumber: 3, bonus: 10 } });

  console.log(`✅ Seed done. VOUCHER_SLUG=${VOUCHER_SLUG} BIZ_SLUG=${BIZ_SLUG} STORE_SLUG=${STORE_SLUG}`);
});

// ====================================================================
// SECTION 1: PUBLIC PAGES (no login)
// ====================================================================
test.describe("1. Public", () => {

  test("1.1 Landing page", async ({ page }) => { meta("p01", "Public", "/", "首页 - 消费者默认", "guest"); await page.goto("/"); await page.waitForSelector('text=热门代金券', { timeout: 8000 }).catch(() => page.waitForTimeout(1500)); await shot(page, "p01"); });
  test("1.2 For Business", async ({ page }) => { meta("p02", "Public", "/for-business", "商戶合作页", "guest"); await page.goto("/for-business"); await shot(page, "p02"); });
  test("1.3 Login", async ({ page }) => { meta("p03", "Public", "/auth/login", "登录页", "guest"); await page.goto("/auth/login"); await shot(page, "p03"); });
  test("1.4 Register", async ({ page }) => { meta("p04", "Public", "/auth/register", "注册页", "guest"); await page.goto("/auth/register"); await shot(page, "p04"); });
  test("1.5 Shop page", async ({ page }) => { meta("p05", "Public", `/shop/${BIZ_SLUG}`, "商戶优惠券展示", "guest"); await page.goto(`/shop/${BIZ_SLUG}`); await shot(page, "p05"); });
  test("1.6 Store page", async ({ page }) => { meta("p06", "Public", `/store/${STORE_SLUG}`, "门店页面", "guest"); await page.goto(`/store/${STORE_SLUG}`); await shot(page, "p06"); });
  test("1.7 Voucher campaign (guest)", async ({ page }) => { meta("p07", "Public", `/voucher/${VOUCHER_SLUG}`, "代金券抽奖页(游客)", "guest"); await page.goto(`/voucher/${VOUCHER_SLUG}`); await page.waitForSelector('text=奖池进度', { timeout: 8000 }).catch(() => page.waitForSelector('text=S$50', { timeout: 5000 }).catch(() => page.waitForTimeout(2000))); await shot(page, "p07"); });
  test("1.8 Coupon detail (guest)", async ({ page }) => { meta("p08", "Public", `/coupons/${PUBLISHED_COUPON_ID}`, "优惠券详情(游客)", "guest"); await page.goto(`/coupons/${PUBLISHED_COUPON_ID}`); await shot(page, "p08"); });
});

// ====================================================================
// SECTION 2: CUSTOMER PAGES
// ====================================================================
test.describe("2. Customer", () => {

  test("2.1 Home tab", async ({ page }) => { meta("c01", "Customer", "/home", "用户首页", "customer"); await setCookie(page, custToken); await page.goto("/home"); await shot(page, "c01"); });
  test("2.2 Wallet tab", async ({ page }) => { meta("c02", "Customer", "/wallet", "我的钱包-优惠券", "customer"); await setCookie(page, custToken); await page.goto("/wallet"); await shot(page, "c02"); });
  test("2.3 Balance tab", async ({ page }) => { meta("c03", "Customer", "/balance", "积分/余额页", "customer"); await setCookie(page, custToken); await page.goto("/balance"); await shot(page, "c03"); });
  test("2.4 Profile tab", async ({ page }) => { meta("c04", "Customer", "/profile", "个人中心", "customer"); await setCookie(page, custToken); await page.goto("/profile"); await shot(page, "c04"); });
  test("2.5 Card page", async ({ page }) => { meta("c05", "Customer", `/card/${BIZ_SLUG}`, "会员卡页面", "customer"); await setCookie(page, custToken); await page.goto(`/card/${BIZ_SLUG}`); await shot(page, "c05"); });
  test("2.6 Voucher campaign (logged in)", async ({ page }) => { meta("c06", "Customer", `/voucher/${VOUCHER_SLUG}`, "购券抽奖页(已登录)", "customer"); await setCookie(page, custToken); await page.goto(`/voucher/${VOUCHER_SLUG}`); await page.waitForSelector('text=奖池进度', { timeout: 8000 }).catch(() => page.waitForSelector('text=S$50', { timeout: 5000 }).catch(() => page.waitForTimeout(2000))); await shot(page, "c06"); });
  test("2.7 My Tokens", async ({ page }) => { meta("c07", "Customer", "/my-tokens", "我的代币", "customer"); await setCookie(page, custToken); await page.goto("/my-tokens"); await shot(page, "c07"); });
  test("2.8 Redeem page", async ({ page }) => { meta("c08", "Customer", `/redeem/${CUST_COUPON_ID}`, "核销优惠券", "customer"); await setCookie(page, custToken); await page.goto(`/redeem/${CUST_COUPON_ID}`); await shot(page, "c08"); });
  test("2.9 Coupon detail (logged in)", async ({ page }) => { meta("c09", "Customer", `/coupons/${PUBLISHED_COUPON_ID}`, "优惠券详情(已登录)", "customer"); await setCookie(page, custToken); await page.goto(`/coupons/${PUBLISHED_COUPON_ID}`); await shot(page, "c09"); });
  test("2.10 Promoter dashboard", async ({ page }) => { meta("c10", "Customer", "/promoter", "推广中心", "customer"); await setCookie(page, custToken); await page.goto("/promoter"); await shot(page, "c10"); });
  test("2.11 Promoter withdraw", async ({ page }) => { meta("c11", "Customer", "/promoter/withdraw", "推广提现", "customer"); await setCookie(page, custToken); await page.goto("/promoter/withdraw"); await shot(page, "c11"); });
  test("2.12 Promoter link page", async ({ page }) => { meta("c12", "Customer", `/p/${PROMOTER_CODE}`, "推广链接落地页", "customer"); await page.goto(`/p/${PROMOTER_CODE}`); await shot(page, "c12"); });
});

// ====================================================================
// SECTION 3: BUSINESS PAGES
// ====================================================================
test.describe("3. Business", () => {

  test("3.1 Dashboard", async ({ page }) => { meta("b01", "Business", "/business", "商戶仪表盘", "business"); await setCookie(page, bizToken); await page.goto("/business"); await shot(page, "b01"); });
  test("3.2 Campaigns list", async ({ page }) => { meta("b02", "Business", "/business/campaigns", "营销活动列表", "business"); await setCookie(page, bizToken); await page.goto("/business/campaigns"); await shot(page, "b02"); });
  test("3.3 Campaign detail", async ({ page }) => { meta("b03", "Business", `/business/campaigns/${CAMPAIGN_ID}`, "活动详情", "business"); await setCookie(page, bizToken); await page.goto(`/business/campaigns/${CAMPAIGN_ID}`); await shot(page, "b03"); });
  test("3.4 New campaign", async ({ page }) => { meta("b04", "Business", "/business/campaigns/new", "创建新活动", "business"); await setCookie(page, bizToken); await page.goto("/business/campaigns/new"); await shot(page, "b04"); });
  test("3.5 Coupons list", async ({ page }) => { meta("b05", "Business", "/business/coupons", "优惠券管理列表", "business"); await setCookie(page, bizToken); await page.goto("/business/coupons"); await shot(page, "b05"); });
  test("3.6 Coupon detail", async ({ page }) => { meta("b06", "Business", `/business/coupons/${COUPON_ID}`, "优惠券详情/统计", "business"); await setCookie(page, bizToken); await page.goto(`/business/coupons/${COUPON_ID}`); await shot(page, "b06"); });
  test("3.7 New coupon", async ({ page }) => { meta("b07", "Business", "/business/coupons/new", "创建优惠券", "business"); await setCookie(page, bizToken); await page.goto("/business/coupons/new"); await shot(page, "b07"); });
  test("3.8 Lucky draw list", async ({ page }) => { meta("b08", "Business", "/business/lucky-draw", "抽奖活动列表", "business"); await setCookie(page, bizToken); await page.goto("/business/lucky-draw"); await shot(page, "b08"); });
  test("3.9 Members list", async ({ page }) => { meta("b09", "Business", "/business/members", "会员列表", "business"); await setCookie(page, bizToken); await page.goto("/business/members"); await shot(page, "b09"); });
  test("3.10 Member detail", async ({ page }) => { meta("b10", "Business", `/business/members/${MEMBER_ID}`, "会员详情", "business"); await setCookie(page, bizToken); await page.goto(`/business/members/${MEMBER_ID}`); await shot(page, "b10"); });
  test("3.11 Member tier config", async ({ page }) => { meta("b11", "Business", "/business/members/config", "会员等级配置", "business"); await setCookie(page, bizToken); await page.goto("/business/members/config"); await shot(page, "b11"); });
  test("3.12 Partners list", async ({ page }) => { meta("b12", "Business", "/business/partners", "合作伙伴", "business"); await setCookie(page, bizToken); await page.goto("/business/partners"); await shot(page, "b12"); });
  test("3.13 Discover partners", async ({ page }) => { meta("b13", "Business", "/business/partners/discover", "发现合作活动", "business"); await setCookie(page, bizToken); await page.goto("/business/partners/discover"); await shot(page, "b13"); });
  test("3.14 Scan QR", async ({ page }) => { meta("b14", "Business", "/business/scan", "扫码核销", "business"); await setCookie(page, bizToken); await page.goto("/business/scan"); await shot(page, "b14"); });
  test("3.15 Settings", async ({ page }) => { meta("b15", "Business", "/business/settings", "商戶设置", "business"); await setCookie(page, bizToken); await page.goto("/business/settings"); await shot(page, "b15"); });
  test("3.16 Store page", async ({ page }) => { meta("b16", "Business", "/business/store", "门店管理页", "business"); await setCookie(page, bizToken); await page.goto("/business/store"); await shot(page, "b16"); });
  test("3.17 Stores list", async ({ page }) => { meta("b17", "Business", "/business/stores", "门店列表", "business"); await setCookie(page, bizToken); await page.goto("/business/stores"); await shot(page, "b17"); });
  test("3.18 Settlements", async ({ page }) => { meta("b18", "Business", "/business/settlements", "结算记录", "business"); await setCookie(page, bizToken); await page.goto("/business/settlements"); await shot(page, "b18"); });
  test("3.19 Tokens", async ({ page }) => { meta("b19", "Business", "/business/tokens", "代币管理", "business"); await setCookie(page, bizToken); await page.goto("/business/tokens"); await shot(page, "b19"); });
  test("3.20 Token history", async ({ page }) => { meta("b20", "Business", "/business/tokens/history", "代币流水", "business"); await setCookie(page, bizToken); await page.goto("/business/tokens/history"); await shot(page, "b20"); });
});

// ====================================================================
// SECTION 4: STAFF PAGES
// ====================================================================
test.describe("4. Staff", () => {

  test("4.1 Staff dashboard", async ({ page }) => { meta("s01", "Staff", "/business", "店员视图(有限导航)", "staff"); await setCookie(page, staffToken); await page.goto("/business"); await shot(page, "s01"); });
  test("4.2 Staff scan", async ({ page }) => { meta("s02", "Staff", "/business/scan", "店员扫码核销", "staff"); await setCookie(page, staffToken); await page.goto("/business/scan"); await shot(page, "s02"); });
});

// ====================================================================
// SECTION 5: ADMIN PAGES
// ====================================================================
test.describe("5. Admin", () => {

  test("5.1 Admin dashboard", async ({ page }) => { meta("a01", "Admin", "/admin", "管理后台首页", "admin"); await setCookie(page, adminToken); await page.goto("/admin"); await shot(page, "a01"); });
  test("5.2 Businesses list", async ({ page }) => { meta("a02", "Admin", "/admin/businesses", "商戶管理列表", "admin"); await setCookie(page, adminToken); await page.goto("/admin/businesses"); await shot(page, "a02"); });
  test("5.3 Business detail", async ({ page }) => { meta("a03", "Admin", `/admin/businesses/${BUSINESS_ID}`, "商戶详情/审批", "admin"); await setCookie(page, adminToken); await page.goto(`/admin/businesses/${BUSINESS_ID}`); await shot(page, "a03"); });
  test("5.4 Admin tokens", async ({ page }) => { meta("a04", "Admin", "/admin/tokens", "代币管理", "admin"); await setCookie(page, adminToken); await page.goto("/admin/tokens"); await shot(page, "a04"); });
  test("5.5 System settings", async ({ page }) => { meta("a05", "Admin", "/admin/system", "系统设置", "admin"); await setCookie(page, adminToken); await page.goto("/admin/system"); await shot(page, "a05"); });
});

// ====================================================================
// AFTER ALL — save metadata
// ====================================================================
test.afterAll(async () => {
  const fs = await import("fs");
  const path = "tests/screenshots/output/metadata.json";
  // Merge with existing metadata (in case of worker restarts/retries)
  let existing: typeof pagesMeta = [];
  try { existing = JSON.parse(fs.readFileSync(path, "utf-8")); } catch {}
  const seen = new Set(existing.map((m) => m.id));
  for (const m of pagesMeta) { if (!seen.has(m.id)) { existing.push(m); seen.add(m.id); } }
  // Sort by id for consistent ordering
  existing.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(path, JSON.stringify(existing, null, 2));
  console.log(`\n📸 ${pagesMeta.length} new / ${existing.length} total pages. Metadata saved.`);
});

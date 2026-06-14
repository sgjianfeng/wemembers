# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: lucky-draw.spec.ts >> 1. Merchant: Campaign & Prize Config >> 1.5 Activate campaign
- Location: tests/e2e/lucky-draw.spec.ts:152:7

# Error details

```
PrismaClientKnownRequestError: 
Invalid `prisma.campaign.update()` invocation in
/Users/it-macbook/Jianfeng/Github/jianfeng-projects/wemembers/tests/e2e/lucky-draw.spec.ts:68:25

  65 }
  66 
  67 async function activateCampaign(id: string) {
→ 68   await prisma.campaign.update(
An operation failed because it depends on one or more records that were required but not found. Record to update not found.
```

# Test source

```ts
  1   | /**
  2   |  * Lucky Draw E2E — 52 browser test scenarios
  3   |  *
  4   |  * Run: npx playwright test
  5   |  * Requires: npm run dev running on :3000
  6   |  */
  7   | import { test, expect, type Page } from "@playwright/test";
  8   | import { prisma } from "./db";
  9   | 
  10  | const BASE = "http://localhost:3000";
  11  | 
  12  | // ── Helpers ──
  13  | async function api(path: string, o: RequestInit & { json?: any } = {}): Promise<Response> {
  14  |   const headers: Record<string, string> = { "Content-Type": "application/json" };
  15  |   return fetch(`${BASE}${path}`, { ...o, headers: { ...headers, ...(o.headers as any) }, body: o.json ? JSON.stringify(o.json) : o.body, redirect: "manual" });
  16  | }
  17  | 
  18  | async function registerUser(phone: string, role: "business" | "customer", name: string) {
  19  |   await api("/api/auth/send-code", { method: "POST", json: { contact: phone, purpose: "register" } });
  20  |   const vc = await prisma.verificationCode.findFirst({
  21  |     where: { contact: phone, purpose: "register" }, orderBy: { createdAt: "desc" },
  22  |   });
  23  |   return api("/api/auth/register", {
  24  |     method: "POST",
  25  |     json: { contact: phone, code: vc!.code, role, displayName: name,
  26  |       ...(role === "business" ? { businessName: name, businessCategory: "cafe" } : {}),
  27  |     },
  28  |   });
  29  | }
  30  | 
  31  | async function loginViaPage(page: Page, phone: string) {
  32  |   // Get JWT token via API (bypasses browser login UI)
  33  |   await api("/api/auth/send-code", { method: "POST", json: { contact: phone, purpose: "login" } });
  34  |   await page.waitForTimeout(300);
  35  | 
  36  |   const vc = await prisma.verificationCode.findFirst({
  37  |     where: { contact: phone, purpose: "login" }, orderBy: { createdAt: "desc" },
  38  |   });
  39  | 
  40  |   // Verify code via API to get token
  41  |   const verifyRes = await api("/api/auth/verify-code", {
  42  |     method: "POST",
  43  |     json: { contact: phone, code: vc!.code, purpose: "login" },
  44  |   });
  45  |   const verifyJson = await verifyRes.json();
  46  |   const token = verifyJson.data.token;
  47  | 
  48  |   // Set cookie in browser
  49  |   await page.context().addCookies([{
  50  |     name: "gwm_token", value: token, domain: "localhost", path: "/",
  51  |   }]);
  52  | }
  53  | 
  54  | async function createCampaign(token: string, name: string, slug: string, opts: Record<string, any> = {}) {
  55  |   const start = new Date(); start.setHours(0);
  56  |   const end = new Date(); end.setDate(end.getDate() + 30);
  57  |   const draw = new Date(); draw.setDate(draw.getDate() + 35);
  58  |   return api("/api/business/campaigns", {
  59  |     method: "POST",
  60  |     headers: { "Cookie": `gwm_token=${token}` },
  61  |     json: { name, type: "lucky_draw", entryMethod: "receipt", receiptMinSpend: 5000,
  62  |             startDate: start.toISOString(), endDate: end.toISOString(),
  63  |             drawDate: draw.toISOString(), slug, ticketPerUnit: 1, budgetPercent: 20, ...opts },
  64  |   });
  65  | }
  66  | 
  67  | async function activateCampaign(id: string) {
> 68  |   await prisma.campaign.update({ where: { id }, data: { status: "active" } });
      |                         ^ PrismaClientKnownRequestError: 
  69  | }
  70  | 
  71  | // ── Globals ──
  72  | const r = Date.now().toString(36);
  73  | let bizPhone = `+65901${r}`, bizToken = "", bizUserId = "";
  74  | let biz2Phone = `+65902${r}`, biz2Token = "", biz2UserId = "";
  75  | let custPhone = `+65903${r}`, custToken = "";
  76  | let staffPhone = `+65904${r}`;
  77  | 
  78  | // ====================================================================
  79  | // BEFORE ALL — register accounts
  80  | // ====================================================================
  81  | test.beforeAll(async () => {
  82  |   const b1 = await registerUser(bizPhone, "business", `Lucky Biz ${r}`);
  83  |   const b1j = await b1.json();
  84  |   bizToken = b1j.data.token; bizUserId = b1j.data.user.id;
  85  | 
  86  |   const b2 = await registerUser(biz2Phone, "business", `Partner Biz ${r}`);
  87  |   const b2j = await b2.json();
  88  |   biz2Token = b2j.data.token; biz2UserId = b2j.data.user.id;
  89  | 
  90  |   const c = await registerUser(custPhone, "customer", `Lucky C ${r}`);
  91  |   const cj = await c.json();
  92  |   custToken = cj.data.token;
  93  | 
  94  |   // Create staff
  95  |   const s = await registerUser(staffPhone, "customer", "Staff");
  96  |   const sj = await s.json();
  97  |   const store = await prisma.store.findFirst({ where: { businessId: bizUserId } });
  98  |   await prisma.user.update({ where: { id: sj.data.user.id }, data: { role: "staff", storeId: store!.id } });
  99  | });
  100 | 
  101 | // ====================================================================
  102 | // SECTION 1: MERCHANT — Campaign & Prize Config
  103 | // ====================================================================
  104 | test.describe("1. Merchant: Campaign & Prize Config", () => {
  105 |   let cId = "", slug = "";
  106 | 
  107 |   test("1.1 Create lucky_draw campaign", async ({ page }) => {
  108 |     slug = `e2e-${Date.now()}`;
  109 |     await loginViaPage(page, bizPhone);
  110 |     await page.goto("/business/campaigns/new");
  111 |     await page.click("button:has-text('幸运抽奖')");
  112 | 
  113 |     // Fill slug
  114 |     const inputs = page.locator("input");
  115 |     const slugInput = inputs.nth(0);
  116 |     if (await slugInput.isVisible()) await slugInput.fill(slug);
  117 | 
  118 |     // Click create
  119 |     await page.click("button:has-text('创建')");
  120 |     await page.waitForURL(/\/business\/campaigns\//, { timeout: 10000 });
  121 |     const url = page.url();
  122 |     cId = url.split("/campaigns/")[1]?.split("/")[0] || url.split("/").pop() || "";
  123 |     await expect(page.locator(`text=${slug}`).or(page.locator("h1"))).toBeVisible({ timeout: 5000 });
  124 |   });
  125 | 
  126 |   test("1.2 Campaign detail shows config", async ({ page }) => {
  127 |     await loginViaPage(page, bizPhone);
  128 |     await page.goto(`/business/campaigns/${cId}`);
  129 |     await expect(page.locator("h1").first()).toBeVisible({ timeout: 5000 });
  130 |   });
  131 | 
  132 |   test("1.3 Set 4-tier prize pool", async () => {
  133 |     const res = await api(`/api/business/campaigns/${cId}/prizes`, {
  134 |       method: "PUT",
  135 |       headers: { "Cookie": `gwm_token=${bizToken}` },
  136 |       json: { prizes: [
  137 |         { name: "BYD Car", icon: "🚗", weight: 1, totalStock: 1 },
  138 |         { name: "iPhone 17", icon: "📱", weight: 5, totalStock: 15 },
  139 |         { name: "S$100", icon: "💵", type: "cash", valueCents: 10000, weight: 20, totalStock: 700 },
  140 |         { name: "S$10", icon: "🎟", type: "cash", valueCents: 1000, weight: 50, totalStock: 10000 },
  141 |       ]},
  142 |     });
  143 |     expect(res.status).toBe(200);
  144 |   });
  145 | 
  146 |   test("1.4 Prize pool visible in campaign detail", async ({ page }) => {
  147 |     await loginViaPage(page, bizPhone);
  148 |     await page.goto(`/business/campaigns/${cId}`);
  149 |     await expect(page.locator("text=BYD Car")).toBeVisible({ timeout: 5000 });
  150 |   });
  151 | 
  152 |   test("1.5 Activate campaign", async () => {
  153 |     await activateCampaign(cId);
  154 |   });
  155 | 
  156 |   test("1.6 Lucky draw list shows active campaign", async ({ page }) => {
  157 |     await loginViaPage(page, bizPhone);
  158 |     await page.goto("/business/lucky-draw");
  159 |     await expect(page.locator("text=进行中")).toBeVisible({ timeout: 5000 });
  160 |   });
  161 | 
  162 |   test("1.7 Manual entry adds participant", async ({ page }) => {
  163 |     await loginViaPage(page, staffPhone);
  164 |     await page.goto(`/business/campaigns/${cId}`);
  165 |     await page.click("text=手动录入");
  166 | 
  167 |     const phone = `+65980${Math.floor(Math.random() * 100000)}`;
  168 |     await page.fill("input[placeholder='客户姓名']", "Walk-in");
```
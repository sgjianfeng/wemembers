# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: lucky-draw.spec.ts >> 1. Merchant: Campaign & Prize Config >> 1.7 Manual entry adds participant
- Location: tests/e2e/lucky-draw.spec.ts:162:7

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: page.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for locator('text=手动录入')

```

# Page snapshot

```yaml
- generic [ref=e2]: "{\"error\":\"无权访问\"}"
```

# Test source

```ts
  65  | }
  66  | 
  67  | async function activateCampaign(id: string) {
  68  |   await prisma.campaign.update({ where: { id }, data: { status: "active" } });
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
> 165 |     await page.click("text=手动录入");
      |                ^ Error: page.click: Test timeout of 60000ms exceeded.
  166 | 
  167 |     const phone = `+65980${Math.floor(Math.random() * 100000)}`;
  168 |     await page.fill("input[placeholder='客户姓名']", "Walk-in");
  169 |     await page.fill("input[placeholder='手机号']", phone);
  170 |     await page.click("text=确认录入");
  171 |     await expect(page.locator("text=Walk-in")).toBeVisible({ timeout: 5000 });
  172 |   });
  173 | 
  174 |   test("1.8 Staff cannot access coupon page", async ({ page }) => {
  175 |     await loginViaPage(page, staffPhone);
  176 |     await page.goto("/business/coupons");
  177 |     await expect(page.locator("text=无权访问").or(page.locator("text=403"))).toBeVisible({ timeout: 5000 });
  178 |   });
  179 | 
  180 |   test("1.9 Draw button visible with count", async ({ page }) => {
  181 |     await loginViaPage(page, bizPhone);
  182 |     await page.goto(`/business/campaigns/${cId}`);
  183 |     await expect(page.locator("text=立即开奖")).toBeVisible({ timeout: 5000 });
  184 |   });
  185 | 
  186 |   test("1.10 Execute draw ends campaign", async ({ page }) => {
  187 |     await loginViaPage(page, bizPhone);
  188 |     await page.goto(`/business/campaigns/${cId}`);
  189 |     page.on("dialog", d => d.accept());
  190 |     await page.click("text=立即开奖");
  191 |     await expect(page.locator("text=开奖完成")).toBeVisible({ timeout: 15000 });
  192 | 
  193 |     await page.reload();
  194 |     await expect(page.locator("text=已结束")).toBeVisible({ timeout: 5000 });
  195 |   });
  196 | 
  197 |   test("1.11 Double draw rejected", async () => {
  198 |     const res = await api(`/api/business/campaigns/${cId}/draw`, {
  199 |       method: "POST",
  200 |       headers: { "Cookie": `gwm_token=${bizToken}` },
  201 |     });
  202 |     expect(res.status).toBe(400);
  203 |   });
  204 | 
  205 |   test("1.12 Draw on empty campaign fails", async () => {
  206 |     const emptySlug = `empty-${Date.now()}`;
  207 |     const r = await createCampaign(bizToken, "Empty Draw", emptySlug);
  208 |     const j = await r.json();
  209 |     await activateCampaign(j.data.id);
  210 | 
  211 |     const draw = await api(`/api/business/campaigns/${j.data.id}/draw`, {
  212 |       method: "POST",
  213 |       headers: { "Cookie": `gwm_token=${bizToken}` },
  214 |     });
  215 |     expect(draw.status).toBe(400);
  216 |   });
  217 | });
  218 | 
  219 | // ====================================================================
  220 | // SECTION 2: CUSTOMER — Browse, Submit, Tickets
  221 | // ====================================================================
  222 | test.describe("2. Customer: Browse & Submit", () => {
  223 |   let s = ``, cId = "";
  224 | 
  225 |   test.beforeAll(async () => {
  226 |     s = `cust-${Date.now()}`;
  227 |     const r = await createCampaign(bizToken, "Customer Draw", s);
  228 |     const j = await r.json();
  229 |     cId = j.data.id;
  230 | 
  231 |     await api(`/api/business/campaigns/${cId}/prizes`, {
  232 |       method: "PUT",
  233 |       headers: { "Cookie": `gwm_token=${bizToken}` },
  234 |       json: { prizes: [
  235 |         { name: "BYD Car", icon: "🚗", weight: 1, totalStock: 1 },
  236 |         { name: "S$10", icon: "🎟", type: "cash", valueCents: 1000, weight: 10, totalStock: 100 },
  237 |       ]},
  238 |     });
  239 |     await activateCampaign(cId);
  240 |   });
  241 | 
  242 |   test("2.1 Public page loads for guest", async ({ page }) => {
  243 |     await page.goto(`/draw/${s}`);
  244 |     await expect(page.locator("text=Customer Draw")).toBeVisible({ timeout: 8000 });
  245 |     await expect(page.locator("text=BYD Car")).toBeVisible();
  246 |   });
  247 | 
  248 |   test("2.2 Guest sees login prompt", async ({ page }) => {
  249 |     await page.goto(`/draw/${s}`);
  250 |     await expect(page.locator("text=立即登录").or(page.locator("text=Login"))).toBeVisible({ timeout: 5000 });
  251 |   });
  252 | 
  253 |   test("2.3 Pool stats visible", async ({ page }) => {
  254 |     await page.goto(`/draw/${s}`);
  255 |     await expect(page.locator("text=已发票数")).toBeVisible({ timeout: 5000 });
  256 |   });
  257 | 
  258 |   test("2.4 Countdown clock renders", async ({ page }) => {
  259 |     await page.goto(`/draw/${s}`);
  260 |     await expect(page.locator("text=天").first()).toBeVisible({ timeout: 6000 });
  261 |   });
  262 | 
  263 |   test("2.5 Login → receipt form appears", async ({ page }) => {
  264 |     await loginViaPage(page, custPhone);
  265 |     await page.goto(`/draw/${s}`);
```
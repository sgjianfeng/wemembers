# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: lucky-draw.spec.ts >> 2. Customer: Browse & Submit >> 2.9 My tickets shows entries
- Location: tests/e2e/lucky-draw.spec.ts:307:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=5张券')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=5张券')

```

```yaml
- button "EN"
- paragraph: 🎰
- heading "Customer Draw" [level=1]
- paragraph: Lucky Biz mqdwus74
- text: "50 = 1 张券 · Draw: 7/19/2026"
- paragraph: 距离开奖
- text: "34"
- paragraph: 天
- text: ": 23"
- paragraph: 时
- text: ": 59"
- paragraph: 分
- text: ": 55"
- paragraph: 秒
- text: 奖池 S$0 目标 S$200,000 0% 0 张券 🔴 可能来不及！需要 S$5,882/天
- paragraph: S$0.00
- paragraph: 即时奖池
- paragraph: ⏳ Locked
- paragraph: 比亚迪 S$200K
- paragraph: "0"
- paragraph: 已发票数
- paragraph: "0"
- paragraph: 参与人次
- paragraph: 0%
- paragraph: 奖池 %
- heading "🚗 延迟抽大奖品" [level=3]
- paragraph: 攒到大奖池再抽，奖品更丰厚
- text: 🚗 BYD Car ×1
- heading "📸 上传消费记录" [level=3]
- paragraph: 每满 S$50 获得 1 张抽奖券
- text: S$
- spinbutton
- text: Draw Mode
- button "🚗 延迟开奖 等大奖池积累，争取比亚迪":
  - text: 🚗 延迟开奖
  - paragraph: 等大奖池积累，争取比亚迪
- button "⚡ 即时开奖 当场抽，中 S$5-S$200 券":
  - text: ⚡ 即时开奖
  - paragraph: 当场抽，中 S$5-S$200 券
- text: 💡 大奖池 0% 完成，还差 S$200000
- button "🚗 获取抽奖券"
- button "隐藏"
- paragraph: 还没有参与记录
- text: Powered by WeMembers
- alert
```

# Test source

```ts
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
  266 |     await expect(page.locator("text=上传消费记录")).toBeVisible({ timeout: 6000 });
  267 |   });
  268 | 
  269 |   test("2.6 Deferred: S$250 → 5 tickets", async ({ page }) => {
  270 |     await loginViaPage(page, custPhone);
  271 |     await page.goto(`/draw/${s}`);
  272 | 
  273 |     const inputs = page.locator("input[type='number']");
  274 |     if (await inputs.count() > 0) {
  275 |       await inputs.first().fill("250");
  276 |     }
  277 |     await page.click("button:has-text('延迟开奖')");
  278 |     await page.click("button:has-text('获取抽奖券')");
  279 |     await expect(page.locator("text=已获得 5 张抽奖券")).toBeVisible({ timeout: 10000 });
  280 |   });
  281 | 
  282 |   test("2.7 Instant: S$200 → instant result", async ({ page }) => {
  283 |     await loginViaPage(page, custPhone);
  284 |     await page.goto(`/draw/${s}`);
  285 | 
  286 |     const inputs = page.locator("input[type='number']");
  287 |     if (await inputs.count() > 0) {
  288 |       await inputs.first().fill("200");
  289 |     }
  290 |     await page.click("button:has-text('即时开奖')");
  291 |     await page.click("button:has-text('即时抽奖')");
  292 |     await expect(page.locator("text=已获得 4 张抽奖券")).toBeVisible({ timeout: 10000 });
  293 |   });
  294 | 
  295 |   test("2.8 S$49 rejected", async ({ page }) => {
  296 |     await loginViaPage(page, custPhone);
  297 |     await page.goto(`/draw/${s}`);
  298 | 
  299 |     const inputs = page.locator("input[type='number']");
  300 |     if (await inputs.count() > 0) {
  301 |       await inputs.first().fill("49");
  302 |     }
  303 |     await page.click("button:has-text('获取抽奖券')");
  304 |     await expect(page.locator("text=消费金额不足")).toBeVisible({ timeout: 5000 });
  305 |   });
  306 | 
  307 |   test("2.9 My tickets shows entries", async ({ page }) => {
  308 |     await loginViaPage(page, custPhone);
  309 |     await page.goto(`/draw/${s}`);
  310 |     await page.click("text=查看我的券");
> 311 |     await expect(page.locator("text=5张券")).toBeVisible({ timeout: 5000 });
      |                                            ^ Error: expect(locator).toBeVisible() failed
  312 |   });
  313 | 
  314 |   test("2.10 Deferred tickets show ⏳", async ({ page }) => {
  315 |     await loginViaPage(page, custPhone);
  316 |     await page.goto(`/draw/${s}`);
  317 |     await page.click("text=查看我的券");
  318 |     await expect(page.locator("text=⏳")).toBeVisible({ timeout: 5000 });
  319 |   });
  320 | 
  321 |   test("2.11 Draw mode toggle works", async ({ page }) => {
  322 |     await loginViaPage(page, custPhone);
  323 |     await page.goto(`/draw/${s}`);
  324 |     await page.click("button:has-text('即时开奖')");
  325 |     await expect(page.locator("text=即时奖池")).toBeVisible({ timeout: 3000 });
  326 |     await page.click("button:has-text('延迟开奖')");
  327 |     await expect(page.locator("text=大奖池")).toBeVisible({ timeout: 3000 });
  328 |   });
  329 | 
  330 |   test("2.12 Unique ticket numbers on rapid submissions", async () => {
  331 |     const numbers = new Set<string>();
  332 |     for (let i = 0; i < 5; i++) {
  333 |       const r = await api(`/api/draw/${s}/submit`, {
  334 |         method: "POST",
  335 |         headers: { "Cookie": `gwm_token=${custToken}` },
  336 |         json: { receiptAmount: 5000 + i * 100, drawMode: "deferred" },
  337 |       });
  338 |       const j = await r.json();
  339 |       (j.data?.tickets || []).forEach((t: any) => numbers.add(t.ticketNo));
  340 |     }
  341 |     expect(numbers.size).toBeGreaterThanOrEqual(5);
  342 |   });
  343 | 
  344 |   test("2.13 Campaign ended hides form", async ({ page }) => {
  345 |     await prisma.campaign.update({ where: { id: cId }, data: { status: "ended" } });
  346 |     await page.goto(`/draw/${s}`);
  347 |     await expect(page.locator("text=活动已结束")).toBeVisible({ timeout: 5000 });
  348 |   });
  349 | 
  350 |   test("2.14 Invalid slug → not found", async ({ page }) => {
  351 |     await page.goto("/draw/definitely-not-real-99999");
  352 |     await expect(page.locator("text=活动不存在").or(page.locator("text=not found")).or(page.locator("text=404"))).toBeVisible({ timeout: 6000 });
  353 |   });
  354 | 
  355 |   test("2.15 Public API: valid slug → 200, bad slug → 404", async () => {
  356 |     const good = await api(`/api/draw/${s}`);
  357 |     expect(good.status).toBe(200);
  358 |     const bad = await api("/api/draw/nosuchcampaign-000");
  359 |     expect(bad.status).toBe(404);
  360 |   });
  361 | 
  362 |   test("2.16 Unauthenticated submit → 401", async () => {
  363 |     const r = await api(`/api/draw/${s}/submit`, {
  364 |       method: "POST",
  365 |       json: { receiptAmount: 25000 },
  366 |     });
  367 |     expect(r.status).toBe(401);
  368 |   });
  369 | 
  370 |   test("2.17 Inactive campaign reject submissions", async () => {
  371 |     const inactiveSlug = `inactive-${Date.now()}`;
  372 |     const r = await createCampaign(bizToken, "Inactive", inactiveSlug);
  373 |     const j = await r.json();
  374 |     // Don't activate
  375 | 
  376 |     const sr = await api(`/api/draw/${inactiveSlug}/submit`, {
  377 |       method: "POST",
  378 |       headers: { "Cookie": `gwm_token=${custToken}` },
  379 |       json: { receiptAmount: 25000 },
  380 |     });
  381 |     expect(sr.status).toBe(400);
  382 |   });
  383 | });
  384 | 
  385 | // ====================================================================
  386 | // SECTION 3: MULTI-BUSINESS — Collaborate & Approve
  387 | // ====================================================================
  388 | test.describe("3. Multi-Business: Collaborate", () => {
  389 |   let multiSlug = "", multiId = "";
  390 | 
  391 |   test.beforeAll(async () => {
  392 |     multiSlug = `multi-${Date.now()}`;
  393 |     const r = await createCampaign(bizToken, "Multi Draw", multiSlug, { joinable: true });
  394 |     const j = await r.json();
  395 |     multiId = j.data.id;
  396 |     await activateCampaign(multiId);
  397 |   });
  398 | 
  399 |   test("3.1 Biz2 applies to join", async () => {
  400 |     const store = await prisma.store.findFirst({ where: { businessId: biz2UserId } });
  401 |     const r = await api(`/api/business/campaigns/${multiId}/requests`, {
  402 |       method: "POST",
  403 |       headers: { "Cookie": `gwm_token=${biz2Token}` },
  404 |       json: { storeIds: [store!.id], message: "Would love to join!" },
  405 |     });
  406 |     expect(r.status).toBe(200);
  407 |     const j = await r.json();
  408 |     expect(j.data[0].status).toBe("pending");
  409 |   });
  410 | 
  411 |   test("3.2 Biz1 sees pending request", async ({ page }) => {
```
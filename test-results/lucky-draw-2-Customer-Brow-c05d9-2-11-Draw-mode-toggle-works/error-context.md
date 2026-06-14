# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: lucky-draw.spec.ts >> 2. Customer: Browse & Submit >> 2.11 Draw mode toggle works
- Location: tests/e2e/lucky-draw.spec.ts:321:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=即时奖池')
Expected: visible
Error: strict mode violation: locator('text=即时奖池') resolved to 2 elements:
    1) <p class="text-[10px] text-slate-400">即时奖池</p> aka getByText('即时奖池', { exact: true })
    2) <div class="mt-2 p-2 bg-blue-50 rounded-lg text-[10px] text-blue-600">💡 当前即时奖池 S$0.00，可抽 S$5-S$200 券，中奖率随奖池增长</div> aka getByText('💡 当前即时奖池 S$0.00，可抽 S$5-S$200')

Call log:
  - Expect "toBeVisible" with timeout 3000ms
  - waiting for locator('text=即时奖池')

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - button "EN" [ref=e4]
    - generic [ref=e5]:
      - generic [ref=e6]:
        - paragraph [ref=e7]: 🎰
        - heading "Customer Draw" [level=1] [ref=e8]
        - paragraph [ref=e9]: Lucky Biz mqdwv4dn
        - generic [ref=e10]:
          - generic [ref=e11]: 50 = 1 张券
          - generic [ref=e12]: ·
          - generic [ref=e13]: "Draw: 7/19/2026"
      - generic [ref=e14]:
        - generic [ref=e17]:
          - generic [ref=e18]:
            - paragraph [ref=e19]: 距离开奖
            - generic [ref=e20]:
              - generic [ref=e21]:
                - text: "34"
                - paragraph [ref=e22]: 天
              - generic [ref=e23]: ":"
              - generic [ref=e24]:
                - text: "23"
                - paragraph [ref=e25]: 时
              - generic [ref=e26]: ":"
              - generic [ref=e27]:
                - text: "59"
                - paragraph [ref=e28]: 分
              - generic [ref=e29]: ":"
              - generic [ref=e30]:
                - text: "58"
                - paragraph [ref=e31]: 秒
          - generic [ref=e32]:
            - generic [ref=e33]:
              - generic [ref=e34]: 奖池 S$0
              - generic [ref=e35]: 目标 S$200,000
            - generic [ref=e37]:
              - generic [ref=e38]: 0%
              - generic [ref=e39]: 0 张券
          - generic [ref=e40]: 🔴 可能来不及！需要 S$5,882/天
        - generic [ref=e41]:
          - generic [ref=e42]:
            - paragraph [ref=e43]: S$0.00
            - paragraph [ref=e44]: 即时奖池
          - generic [ref=e45]:
            - paragraph [ref=e46]: ⏳ Locked
            - paragraph [ref=e47]: 比亚迪 S$200K
        - generic [ref=e48]:
          - generic [ref=e49]:
            - paragraph [ref=e50]: "0"
            - paragraph [ref=e51]: 已发票数
          - generic [ref=e52]:
            - paragraph [ref=e53]: "0"
            - paragraph [ref=e54]: 参与人次
          - generic [ref=e55]:
            - paragraph [ref=e56]: 0%
            - paragraph [ref=e57]: 奖池 %
        - generic [ref=e58]:
          - heading "🚗 延迟抽大奖品" [level=3] [ref=e59]
          - paragraph [ref=e60]: 攒到大奖池再抽，奖品更丰厚
          - generic [ref=e62]:
            - generic [ref=e63]:
              - generic [ref=e64]: 🚗
              - generic [ref=e65]: BYD Car
            - generic [ref=e66]: ×1
        - generic [ref=e68]:
          - heading "📸 上传消费记录" [level=3] [ref=e69]
          - paragraph [ref=e70]: 每满 S$50 获得 1 张抽奖券
          - generic [ref=e71]:
            - generic [ref=e72]: S$
            - spinbutton [ref=e73]
          - generic [ref=e74]:
            - generic [ref=e75]: Draw Mode
            - generic [ref=e76]:
              - button "🚗 延迟开奖 等大奖池积累，争取比亚迪" [ref=e77]:
                - generic [ref=e78]:
                  - generic [ref=e79]: 🚗
                  - generic [ref=e80]: 延迟开奖
                - paragraph [ref=e81]: 等大奖池积累，争取比亚迪
              - button "⚡ 即时开奖 当场抽，中 S$5-S$200 券" [active] [ref=e82]:
                - generic [ref=e83]:
                  - generic [ref=e84]: ⚡
                  - generic [ref=e85]: 即时开奖
                - paragraph [ref=e86]: 当场抽，中 S$5-S$200 券
            - generic [ref=e87]: 💡 当前即时奖池 S$0.00，可抽 S$5-S$200 券，中奖率随奖池增长
          - button "⚡ 即时抽奖" [ref=e88]
        - button "📋 查看我的券" [ref=e89]
        - generic [ref=e90]: Powered by WeMembers
  - button "Open Next.js Dev Tools" [ref=e96] [cursor=pointer]:
    - img [ref=e97]
  - alert [ref=e100]
```

# Test source

```ts
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
  311 |     await expect(page.locator("text=5张券")).toBeVisible({ timeout: 5000 });
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
> 325 |     await expect(page.locator("text=即时奖池")).toBeVisible({ timeout: 3000 });
      |                                             ^ Error: expect(locator).toBeVisible() failed
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
  412 |     await loginViaPage(page, bizPhone);
  413 |     await page.goto(`/business/campaigns/${multiId}`);
  414 |     await expect(page.locator(`text=${biz2Name}`).or(page.locator("text=申请"))).toBeVisible({ timeout: 5000 });
  415 |   });
  416 | 
  417 |   test("3.3 Biz1 approves → storeIds updated", async () => {
  418 |     const req = await prisma.campaignJoinRequest.findFirst({
  419 |       where: { campaignId: multiId, businessId: biz2UserId },
  420 |     });
  421 |     const r = await api(`/api/business/campaigns/${multiId}/requests/${req!.id}`, {
  422 |       method: "PUT",
  423 |       headers: { "Cookie": `gwm_token=${bizToken}` },
  424 |       json: { action: "approve" },
  425 |     });
```
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: lucky-draw.spec.ts >> 3. Multi-Business: Collaborate >> 3.4 Discover page shows joinable campaigns
- Location: tests/e2e/lucky-draw.spec.ts:433:7

# Error details

```
ReferenceError: bizName is not defined
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - button "EN" [ref=e4]
    - main [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e7]:
          - heading "business.discover.title" [level=1] [ref=e8]
          - paragraph [ref=e9]: business.discover.subtitle
        - generic [ref=e11]:
          - textbox "business.discover.search" [ref=e14]
          - button "common.search" [ref=e15]
        - generic [ref=e17]:
          - paragraph [ref=e18]: 🔍
          - paragraph [ref=e19]: business.discover.noResults
    - navigation [ref=e20]:
      - generic [ref=e21]:
        - link "📊 概览" [ref=e22] [cursor=pointer]:
          - /url: /business
          - generic [ref=e23]: 📊
          - generic [ref=e24]: 概览
        - link "👥 会员" [ref=e25] [cursor=pointer]:
          - /url: /business/members
          - generic [ref=e26]: 👥
          - generic [ref=e27]: 会员
        - link "🎫 券管理" [ref=e28] [cursor=pointer]:
          - /url: /business/coupons
          - generic [ref=e29]: 🎫
          - generic [ref=e30]: 券管理
        - link "🎰 抽奖" [ref=e31] [cursor=pointer]:
          - /url: /business/lucky-draw
          - generic [ref=e32]: 🎰
          - generic [ref=e33]: 抽奖
        - link "📅 活动" [ref=e34] [cursor=pointer]:
          - /url: /business/campaigns
          - generic [ref=e35]: 📅
          - generic [ref=e36]: 活动
        - link "🏪 门店" [ref=e37] [cursor=pointer]:
          - /url: /business/stores
          - generic [ref=e38]: 🏪
          - generic [ref=e39]: 门店
        - link "🤝 合作" [ref=e40] [cursor=pointer]:
          - /url: /business/partners
          - generic [ref=e41]: 🤝
          - generic [ref=e42]: 合作
  - button "Open Next.js Dev Tools" [ref=e48] [cursor=pointer]:
    - img [ref=e49]
```

# Test source

```ts
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
  426 |     expect(r.status).toBe(200);
  427 | 
  428 |     const campaign = await prisma.campaign.findUnique({ where: { id: multiId } });
  429 |     const storeIds = JSON.parse(campaign!.storeIds || "[]");
  430 |     expect(storeIds.length).toBeGreaterThan(0);
  431 |   });
  432 | 
  433 |   test("3.4 Discover page shows joinable campaigns", async ({ page }) => {
  434 |     await loginViaPage(page, biz2Phone);
  435 |     await page.goto("/business/partners/discover");
> 436 |     await expect(page.locator(`text=${bizName}`)).toBeVisible({ timeout: 5000 });
      |                                       ^ ReferenceError: bizName is not defined
  437 |   });
  438 | });
  439 | 
  440 | // ====================================================================
  441 | // SECTION 4: Edge Cases
  442 | // ====================================================================
  443 | test.describe("4. Edge Cases", () => {
  444 |   test("4.1 S$5000 → 100 tickets", async () => {
  445 |     const slug = `bulk-${Date.now()}`;
  446 |     const r = await createCampaign(bizToken, "Bulk", slug);
  447 |     const j = await r.json();
  448 |     await activateCampaign(j.data.id);
  449 | 
  450 |     const sr = await api(`/api/draw/${slug}/submit`, {
  451 |       method: "POST",
  452 |       headers: { "Cookie": `gwm_token=${custToken}` },
  453 |       json: { receiptAmount: 500000 },
  454 |     });
  455 |     const sj = await sr.json();
  456 |     expect(sr.status).toBe(200);
  457 |     expect(sj.data.ticketCount).toBe(100);
  458 |   });
  459 | 
  460 |   test("4.2 Non-draw campaign rejects draw", async () => {
  461 |     const r = await api("/api/business/campaigns", {
  462 |       method: "POST",
  463 |       headers: { "Cookie": `gwm_token=${bizToken}` },
  464 |       json: { name: "Promo", type: "promotion",
  465 |               startDate: new Date().toISOString(),
  466 |               endDate: new Date(Date.now() + 864e5 * 30).toISOString() },
  467 |     });
  468 |     const j = await r.json();
  469 | 
  470 |     const dr = await api(`/api/business/campaigns/${j.data.id}/draw`, {
  471 |       method: "POST",
  472 |       headers: { "Cookie": `gwm_token=${bizToken}` },
  473 |     });
  474 |     expect(dr.status).toBe(400);
  475 |   });
  476 | 
  477 |   test("4.3 Expired campaign page shows ended", async ({ page }) => {
  478 |     const slug = `exp-${Date.now()}`;
  479 |     const start = new Date(); start.setDate(start.getDate() - 60);
  480 |     const end = new Date(); end.setDate(end.getDate() - 1);
  481 | 
  482 |     const r = await api("/api/business/campaigns", {
  483 |       method: "POST",
  484 |       headers: { "Cookie": `gwm_token=${bizToken}` },
  485 |       json: { name: "Expired", type: "lucky_draw", entryMethod: "receipt",
  486 |               receiptMinSpend: 5000, slug,
  487 |               startDate: start.toISOString(), endDate: end.toISOString() },
  488 |     });
  489 |     const j = await r.json();
  490 |     await prisma.campaign.update({ where: { id: j.data.id }, data: { status: "active" } });
  491 | 
  492 |     await page.goto(`/draw/${slug}`);
  493 |     await expect(page.locator("text=活动已结束")).toBeVisible({ timeout: 6000 });
  494 |   });
  495 | 
  496 |   test("4.4 Zero stock prizes config allowed", async () => {
  497 |     const slug = `zero-${Date.now()}`;
  498 |     const r = await createCampaign(bizToken, "Zero Stock", slug);
  499 |     const j = await r.json();
  500 | 
  501 |     const pr = await api(`/api/business/campaigns/${j.data.id}/prizes`, {
  502 |       method: "PUT",
  503 |       headers: { "Cookie": `gwm_token=${bizToken}` },
  504 |       json: { prizes: [{ name: "Sold Out", icon: "🎁", weight: 10, totalStock: 0 }] },
  505 |     });
  506 |     expect(pr.status).toBe(200);
  507 |   });
  508 | });
  509 | 
  510 | // ====================================================================
  511 | // SECTION 5: Token, Settlement & Navigation
  512 | // ====================================================================
  513 | test.describe("5. Token, Settlement & Navigation", () => {
  514 |   test("5.1 Token page shows 3 balance cards", async ({ page }) => {
  515 |     await loginViaPage(page, bizPhone);
  516 |     await page.goto("/business/tokens");
  517 |     await expect(page.locator("text=可用余额")).toBeVisible({ timeout: 6000 });
  518 |     await expect(page.locator("text=冻结中")).toBeVisible();
  519 |     await expect(page.locator("text=累计收益")).toBeVisible();
  520 |   });
  521 | 
  522 |   test("5.2 Settlement page loads", async ({ page }) => {
  523 |     await loginViaPage(page, bizPhone);
  524 |     await page.goto("/business/settlements");
  525 |     await expect(page.locator("text=结算记录")).toBeVisible({ timeout: 5000 });
  526 |   });
  527 | 
  528 |   test("5.3 Business nav has 7 tabs", async ({ page }) => {
  529 |     await loginViaPage(page, bizPhone);
  530 |     await page.goto("/business");
  531 |     const count = await page.locator("nav a").count();
  532 |     expect(count).toBe(7);
  533 |   });
  534 | 
  535 |   test("5.4 Staff nav has 4 tabs", async ({ page }) => {
  536 |     await loginViaPage(page, staffPhone);
```
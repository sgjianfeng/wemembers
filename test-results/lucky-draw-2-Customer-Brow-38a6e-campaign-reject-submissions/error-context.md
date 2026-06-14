# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: lucky-draw.spec.ts >> 2. Customer: Browse & Submit >> 2.17 Inactive campaign reject submissions
- Location: tests/e2e/lucky-draw.spec.ts:370:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 400
Received: 200
```

# Test source

```ts
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
> 381 |     expect(sr.status).toBe(400);
      |                       ^ Error: expect(received).toBe(expected) // Object.is equality
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
  436 |     await expect(page.locator(`text=${bizName}`)).toBeVisible({ timeout: 5000 });
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
```
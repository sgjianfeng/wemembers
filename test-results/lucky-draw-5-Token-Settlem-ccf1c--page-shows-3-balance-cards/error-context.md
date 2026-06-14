# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: lucky-draw.spec.ts >> 5. Token, Settlement & Navigation >> 5.1 Token page shows 3 balance cards
- Location: tests/e2e/lucky-draw.spec.ts:514:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=可用余额')
Expected: visible
Timeout: 6000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 6000ms
  - waiting for locator('text=可用余额')

```

```yaml
- img
- heading "This page couldn’t load" [level=1]
- paragraph: A server error occurred. Reload to try again.
- button "Reload"
- paragraph: ERROR 1266619756
```

# Test source

```ts
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
> 517 |     await expect(page.locator("text=可用余额")).toBeVisible({ timeout: 6000 });
      |                                             ^ Error: expect(locator).toBeVisible() failed
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
  537 |     await page.goto("/business");
  538 |     const count = await page.locator("nav a").count();
  539 |     expect(count).toBe(4);
  540 |   });
  541 | 
  542 |   test("5.5 Landing page shows 3 pillar cards", async ({ page }) => {
  543 |     await page.goto("/");
  544 |     await expect(page.locator("h3")).toHaveCount(3);
  545 |     await expect(page.locator("text=代金券系统")).toBeVisible({ timeout: 6000 });
  546 |   });
  547 | 
  548 |   test("5.6 Language switcher toggles EN/中", async ({ page }) => {
  549 |     await page.goto("/");
  550 |     await page.click("button:has-text('EN')");
  551 |     await expect(page.locator("text=Vouchers").or(page.locator("text=Start Free"))).toBeVisible({ timeout: 5000 });
  552 |   });
  553 | 
  554 |   test("5.7 Shop page shows business vouchers", async ({ page }) => {
  555 |     const biz = await prisma.user.findUnique({ where: { id: bizUserId }, select: { businessSlug: true } });
  556 |     await page.goto(`/shop/${biz!.businessSlug}`);
  557 |     await expect(page.locator("text=可领取代金券")).toBeVisible({ timeout: 6000 });
  558 |   });
  559 | 
  560 |   test("5.8 Store page shows store info", async ({ page }) => {
  561 |     const store = await prisma.store.findFirst({ where: { businessId: bizUserId } });
  562 |     await page.goto(`/store/${store!.slug}`);
  563 |     await expect(page.locator("text=可领取代金券")).toBeVisible({ timeout: 6000 });
  564 |   });
  565 | });
  566 | 
```
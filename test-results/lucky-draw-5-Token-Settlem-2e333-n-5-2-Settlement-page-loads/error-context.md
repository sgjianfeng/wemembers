# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: lucky-draw.spec.ts >> 5. Token, Settlement & Navigation >> 5.2 Settlement page loads
- Location: tests/e2e/lucky-draw.spec.ts:522:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=结算记录')
Expected: visible
Error: strict mode violation: locator('text=结算记录') resolved to 2 elements:
    1) <h1 class="text-lg font-semibold">结算记录</h1> aka getByRole('heading', { name: '结算记录' })
    2) <p class="text-sm">暂无结算记录</p> aka getByText('暂无结算记录')

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=结算记录')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - button "EN" [ref=e4]
    - main [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e7]:
          - heading "结算记录" [level=1] [ref=e8]
          - paragraph [ref=e9]: 跨商家核销的结算明细
        - generic [ref=e11]:
          - generic [ref=e13]:
            - paragraph [ref=e14]: "5"
            - paragraph [ref=e15]: 可用余额
          - generic [ref=e17]:
            - paragraph [ref=e18]: "0"
            - paragraph [ref=e19]: 冻结中
          - generic [ref=e21]:
            - paragraph [ref=e22]: "5"
            - paragraph [ref=e23]: 累计收益
        - generic [ref=e25]:
          - generic [ref=e26]:
            - paragraph [ref=e27]: ¥0.00
            - paragraph [ref=e28]: 我的推广费
          - generic [ref=e29]:
            - paragraph [ref=e30]: ¥0.00
            - paragraph [ref=e31]: 我的核销收入
          - generic [ref=e32]:
            - paragraph [ref=e33]: ¥0.00
            - paragraph [ref=e34]: 平台手续费
        - generic [ref=e35]:
          - link "全部" [ref=e36] [cursor=pointer]:
            - /url: /business/settlements?role=all
          - link "我发券" [ref=e37] [cursor=pointer]:
            - /url: /business/settlements?role=issuer
          - link "我核销" [ref=e38] [cursor=pointer]:
            - /url: /business/settlements?role=redeemer
        - generic [ref=e40]:
          - paragraph [ref=e41]: 📊
          - paragraph [ref=e42]: 暂无结算记录
    - navigation [ref=e43]:
      - generic [ref=e44]:
        - link "📊 概览" [ref=e45] [cursor=pointer]:
          - /url: /business
          - generic [ref=e46]: 📊
          - generic [ref=e47]: 概览
        - link "👥 会员" [ref=e48] [cursor=pointer]:
          - /url: /business/members
          - generic [ref=e49]: 👥
          - generic [ref=e50]: 会员
        - link "🎫 券管理" [ref=e51] [cursor=pointer]:
          - /url: /business/coupons
          - generic [ref=e52]: 🎫
          - generic [ref=e53]: 券管理
        - link "🎰 抽奖" [ref=e54] [cursor=pointer]:
          - /url: /business/lucky-draw
          - generic [ref=e55]: 🎰
          - generic [ref=e56]: 抽奖
        - link "📅 活动" [ref=e57] [cursor=pointer]:
          - /url: /business/campaigns
          - generic [ref=e58]: 📅
          - generic [ref=e59]: 活动
        - link "🏪 门店" [ref=e60] [cursor=pointer]:
          - /url: /business/stores
          - generic [ref=e61]: 🏪
          - generic [ref=e62]: 门店
        - link "🤝 合作" [ref=e63] [cursor=pointer]:
          - /url: /business/partners
          - generic [ref=e64]: 🤝
          - generic [ref=e65]: 合作
  - button "Open Next.js Dev Tools" [ref=e71] [cursor=pointer]:
    - img [ref=e72]
  - alert [ref=e75]
```

# Test source

```ts
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
  517 |     await expect(page.locator("text=可用余额")).toBeVisible({ timeout: 6000 });
  518 |     await expect(page.locator("text=冻结中")).toBeVisible();
  519 |     await expect(page.locator("text=累计收益")).toBeVisible();
  520 |   });
  521 | 
  522 |   test("5.2 Settlement page loads", async ({ page }) => {
  523 |     await loginViaPage(page, bizPhone);
  524 |     await page.goto("/business/settlements");
> 525 |     await expect(page.locator("text=结算记录")).toBeVisible({ timeout: 5000 });
      |                                             ^ Error: expect(locator).toBeVisible() failed
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
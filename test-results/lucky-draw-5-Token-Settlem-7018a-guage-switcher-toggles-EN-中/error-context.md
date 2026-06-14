# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: lucky-draw.spec.ts >> 5. Token, Settlement & Navigation >> 5.6 Language switcher toggles EN/中
- Location: tests/e2e/lucky-draw.spec.ts:548:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=Vouchers').or(locator('text=Start Free'))
Expected: visible
Error: strict mode violation: locator('text=Vouchers').or(locator('text=Start Free')) resolved to 4 elements:
    1) <p class="text-sm text-white/50 mb-8">Vouchers · Membership · Lucky Draw — launch in mi…</p> aka getByText('Vouchers · Membership · Lucky')
    2) <p class="text-[11px] text-slate-400 mt-1">Vouchers·Members·Draw</p> aka getByText('Vouchers·Members·Draw')
    3) <h3 class="text-lg font-bold text-blue-700">Vouchers</h3> aka getByRole('heading', { name: 'Vouchers' })
    4) <p class="text-[11px] text-slate-400">Fixed, discount & free-item vouchers</p> aka getByText('Fixed, discount & free-item')

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=Vouchers').or(locator('text=Start Free'))

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - button "中" [active] [ref=e4]
    - generic [ref=e5]:
      - generic [ref=e9]:
        - generic [ref=e10]: 🎉 Just Launched
        - heading "WeMembers" [level=1] [ref=e11]
        - paragraph [ref=e12]: All-in-One Merchant Platform
        - paragraph [ref=e13]: Vouchers · Membership · Lucky Draw — launch in minutes
        - generic [ref=e14]:
          - link "Get Started Free" [ref=e15] [cursor=pointer]:
            - /url: /auth/register
          - link "Login" [ref=e16] [cursor=pointer]:
            - /url: /auth/login
      - generic [ref=e19]:
        - generic [ref=e20]:
          - paragraph [ref=e21]: 3Modules
          - paragraph [ref=e22]: Vouchers·Members·Draw
        - generic [ref=e23]:
          - paragraph [ref=e24]: 5min
          - paragraph [ref=e25]: Setup Time
        - generic [ref=e26]:
          - paragraph [ref=e27]: S$0/mo
          - paragraph [ref=e28]: Free to Use
      - generic [ref=e29]:
        - generic [ref=e30]:
          - heading "Three Core Products" [level=2] [ref=e31]
          - paragraph [ref=e32]: End-to-end merchant marketing
        - generic [ref=e33]:
          - generic [ref=e36]:
            - generic [ref=e37]:
              - generic [ref=e38]: 🎫
              - generic [ref=e39]:
                - heading "Vouchers" [level=3] [ref=e40]
                - paragraph [ref=e41]: Issue · Claim · Redeem · Settle
            - paragraph [ref=e42]: Three voucher types with flexible rules. Customers scan & claim. Cross-store auto settlement with three-way split. Issuers earn promo fees.
            - generic [ref=e43]:
              - generic [ref=e44]:
                - img [ref=e46]
                - generic [ref=e48]:
                  - paragraph [ref=e49]: 3 Types
                  - paragraph [ref=e50]: Fixed, discount & free-item vouchers
              - generic [ref=e51]:
                - img [ref=e53]
                - generic [ref=e55]:
                  - paragraph [ref=e56]: Point Claim
                  - paragraph [ref=e57]: Quantity control, per-customer limit
              - generic [ref=e58]:
                - img [ref=e60]
                - generic [ref=e62]:
                  - paragraph [ref=e63]: Settlement
                  - paragraph [ref=e64]: "Auto 3-way split: issuer, redeemer, platform"
          - generic [ref=e67]:
            - generic [ref=e68]:
              - generic [ref=e69]: 👥
              - generic [ref=e70]:
                - heading "Membership" [level=3] [ref=e71]
                - paragraph [ref=e72]: Points · Tiers · Benefits · Retention
            - paragraph [ref=e73]: Four-tier system with custom thresholds. Auto points on purchase, check-in streaks. Full audit trail with per-business data isolation.
            - generic [ref=e74]:
              - generic [ref=e75]:
                - img [ref=e77]
                - generic [ref=e79]:
                  - paragraph [ref=e80]: 4 Tiers
                  - paragraph [ref=e81]: Regular/Silver/Gold/Platinum, custom thresholds
              - generic [ref=e82]:
                - img [ref=e84]
                - generic [ref=e86]:
                  - paragraph [ref=e87]: Auto Points
                  - paragraph [ref=e88]: Redeem-based earning + check-in bonus
              - generic [ref=e89]:
                - img [ref=e91]
                - generic [ref=e93]:
                  - paragraph [ref=e94]: Analytics
                  - paragraph [ref=e95]: Points log, tier progress visualization
          - generic [ref=e98]:
            - generic [ref=e99]:
              - generic [ref=e100]: 🎰
              - generic [ref=e101]:
                - heading "Lucky Draw" [level=3] [ref=e102]
                - paragraph [ref=e103]: Receipts · Pool · Countdown · Prizes
            - paragraph [ref=e104]: Receipt-based instant draw with transparent pool. Deferred mode for grand prizes. Dual mode + multi-business joint campaigns.
            - generic [ref=e105]:
              - generic [ref=e106]:
                - img [ref=e108]
                - generic [ref=e110]:
                  - paragraph [ref=e111]: Dual Mode
                  - paragraph [ref=e112]: Instant win now, or wait for grand prizes
              - generic [ref=e113]:
                - img [ref=e115]
                - generic [ref=e117]:
                  - paragraph [ref=e118]: Live Pool
                  - paragraph [ref=e119]: Dual-track pool, real-time progress
              - generic [ref=e120]:
                - img [ref=e122]
                - generic [ref=e124]:
                  - paragraph [ref=e125]: Multi-Biz
                  - paragraph [ref=e126]: Joint campaigns across multiple businesses
      - generic [ref=e128]:
        - heading "How It Works" [level=2] [ref=e129]
        - paragraph [ref=e130]: From signup to live in three steps
        - generic [ref=e131]:
          - generic [ref=e132]:
            - generic [ref=e134]: "1"
            - generic [ref=e136]:
              - generic [ref=e137]:
                - generic [ref=e138]: 🏢
                - heading "Register" [level=3] [ref=e139]
              - paragraph [ref=e140]: Sign up in 30s. Auto-creates store + Stripe account
          - generic [ref=e141]:
            - generic [ref=e143]: "2"
            - generic [ref=e145]:
              - generic [ref=e146]:
                - generic [ref=e147]: 🎫
                - heading "Create Voucher" [level=3] [ref=e148]
              - paragraph [ref=e149]: Pick type, set value, define points. One-click publish
          - generic [ref=e150]:
            - generic [ref=e152]: "3"
            - generic [ref=e153]:
              - generic [ref=e154]:
                - generic [ref=e155]: 📱
                - heading "Go Live" [level=3] [ref=e156]
              - paragraph [ref=e157]: Print QR for counter. Customers scan, claim & auto-redeem
      - generic [ref=e160]:
        - paragraph [ref=e161]: 🚀
        - heading "Ready to Start?" [level=2] [ref=e162]
        - paragraph [ref=e163]: Free token bonus on signup. Zero cost to begin.
        - link "🎉 Sign Up Free & Start Now" [ref=e164] [cursor=pointer]:
          - /url: /auth/register
      - contentinfo [ref=e165]:
        - paragraph [ref=e166]: Powered by WeMembers · Simple merchant marketing tools
  - button "Open Next.js Dev Tools" [ref=e172] [cursor=pointer]:
    - img [ref=e173]
  - alert [ref=e176]
```

# Test source

```ts
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
> 551 |     await expect(page.locator("text=Vouchers").or(page.locator("text=Start Free"))).toBeVisible({ timeout: 5000 });
      |                                                                                     ^ Error: expect(locator).toBeVisible() failed
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
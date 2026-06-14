# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: lucky-draw.spec.ts >> 5. Token, Settlement & Navigation >> 5.5 Landing page shows 3 pillar cards
- Location: tests/e2e/lucky-draw.spec.ts:542:7

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('h3')
Expected: 3
Received: 6
Timeout:  10000ms

Call log:
  - Expect "toHaveCount" with timeout 10000ms
  - waiting for locator('h3')
    24 × locator resolved to 6 elements
       - unexpected value "6"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - button "EN" [ref=e4]
    - generic [ref=e5]:
      - generic [ref=e9]:
        - generic [ref=e10]: 🎉 全新上线
        - heading "WeMembers" [level=1] [ref=e11]
        - paragraph [ref=e12]: 一站式商户营销平台
        - paragraph [ref=e13]: 代金券发券核销 · 会员积分等级 · 幸运抽奖活动
        - generic [ref=e14]:
          - link "免费开始使用" [ref=e15] [cursor=pointer]:
            - /url: /auth/register
          - link "登录" [ref=e16] [cursor=pointer]:
            - /url: /auth/login
      - generic [ref=e19]:
        - generic [ref=e20]:
          - paragraph [ref=e21]: 3大模块
          - paragraph [ref=e22]: 券·会员·抽奖
        - generic [ref=e23]:
          - paragraph [ref=e24]: 5分钟
          - paragraph [ref=e25]: 商家上线时间
        - generic [ref=e26]:
          - paragraph [ref=e27]: S$0月费
          - paragraph [ref=e28]: 免费使用
      - generic [ref=e29]:
        - generic [ref=e30]:
          - heading "三大核心功能" [level=2] [ref=e31]
          - paragraph [ref=e32]: 覆盖商户营销全流程
        - generic [ref=e33]:
          - generic [ref=e36]:
            - generic [ref=e37]:
              - generic [ref=e38]: 🎫
              - generic [ref=e39]:
                - heading "代金券系统" [level=3] [ref=e40]
                - paragraph [ref=e41]: 发券 · 领券 · 核销 · 结算
            - paragraph [ref=e42]: 三种券类型灵活组合。客户扫码领券，门店扫码核销。跨店自动分账结算，发券方赚推广费，核销方低成本获客。
            - generic [ref=e43]:
              - generic [ref=e44]:
                - img [ref=e46]
                - generic [ref=e48]:
                  - paragraph [ref=e49]: 三种券型
                  - paragraph [ref=e50]: 定额减免、折扣券、免单券
              - generic [ref=e51]:
                - img [ref=e53]
                - generic [ref=e55]:
                  - paragraph [ref=e56]: 积分领取
                  - paragraph [ref=e57]: 限量控制，每人限领，限时有效
              - generic [ref=e58]:
                - img [ref=e60]
                - generic [ref=e62]:
                  - paragraph [ref=e63]: 跨店结算
                  - paragraph [ref=e64]: 三方自动分账，推广费+平台费
          - generic [ref=e67]:
            - generic [ref=e68]:
              - generic [ref=e69]: 👥
              - generic [ref=e70]:
                - heading "会员系统" [level=3] [ref=e71]
                - paragraph [ref=e72]: 积分 · 等级 · 权益 · 留存
            - paragraph [ref=e73]: 四等级会员体系，商家自定义门槛与权益。消费自动积分，签到奖励叠加。积分流水全程可追溯，数据完全隔离。
            - generic [ref=e74]:
              - generic [ref=e75]:
                - img [ref=e77]
                - generic [ref=e79]:
                  - paragraph [ref=e80]: 四级等级
                  - paragraph [ref=e81]: 普通/银卡/金卡/铂金，自定义门槛
              - generic [ref=e82]:
                - img [ref=e84]
                - generic [ref=e86]:
                  - paragraph [ref=e87]: 自动积分
                  - paragraph [ref=e88]: 核销自动积分，签到叠加奖励
              - generic [ref=e89]:
                - img [ref=e91]
                - generic [ref=e93]:
                  - paragraph [ref=e94]: 数据追踪
                  - paragraph [ref=e95]: 积分流水、等级进度可视化
          - generic [ref=e98]:
            - generic [ref=e99]:
              - generic [ref=e100]: 🎰
              - generic [ref=e101]:
                - heading "幸运抽奖" [level=3] [ref=e102]
                - paragraph [ref=e103]: 收据上传 · 奖池透明 · 开奖倒计时
            - paragraph [ref=e104]: 收据上传即时抽奖，奖池实时可见。延迟开奖等大奖。即时抽+延迟抽双模式，商家联合活动。中奖率高达 26%。
            - generic [ref=e105]:
              - generic [ref=e106]:
                - img [ref=e108]
                - generic [ref=e110]:
                  - paragraph [ref=e111]: 双模抽奖
                  - paragraph [ref=e112]: 即时抽当场开，延迟抽攒大奖
              - generic [ref=e113]:
                - img [ref=e115]
                - generic [ref=e117]:
                  - paragraph [ref=e118]: 奖池透明
                  - paragraph [ref=e119]: 双轨奖池实时可见，进度追踪
              - generic [ref=e120]:
                - img [ref=e122]
                - generic [ref=e124]:
                  - paragraph [ref=e125]: 商家联合
                  - paragraph [ref=e126]: 多商家参与，共用奖池做大活动
      - generic [ref=e128]:
        - heading "三步开始" [level=2] [ref=e129]
        - paragraph [ref=e130]: 从注册到营业，只需三步
        - generic [ref=e131]:
          - generic [ref=e132]:
            - generic [ref=e134]: "1"
            - generic [ref=e136]:
              - generic [ref=e137]:
                - generic [ref=e138]: 🏢
                - heading "注册企业" [level=3] [ref=e139]
              - paragraph [ref=e140]: 30秒完成注册，自动创建门店与 Stripe 收款账户
          - generic [ref=e141]:
            - generic [ref=e143]: "2"
            - generic [ref=e145]:
              - generic [ref=e146]:
                - generic [ref=e147]: 🎫
                - heading "创建代金券" [level=3] [ref=e148]
              - paragraph [ref=e149]: 选类型、设面值、定积分，一键发布到店铺页
          - generic [ref=e150]:
            - generic [ref=e152]: "3"
            - generic [ref=e153]:
              - generic [ref=e154]:
                - generic [ref=e155]: 📱
                - heading "贴码营业" [level=3] [ref=e156]
              - paragraph [ref=e157]: 打印店铺二维码贴在收银台。客户扫码领券，核销自动积分
      - generic [ref=e160]:
        - paragraph [ref=e161]: 🚀
        - heading "准备好了吗？" [level=2] [ref=e162]
        - paragraph [ref=e163]: 注册即赠 Token，零成本开始。
        - link "🎉 免费注册，立即开始" [ref=e164] [cursor=pointer]:
          - /url: /auth/register
      - contentinfo [ref=e165]:
        - paragraph [ref=e166]: Powered by WeMembers · 简单好用的商户营销工具
  - button "Open Next.js Dev Tools" [ref=e172] [cursor=pointer]:
    - img [ref=e173]
  - alert [ref=e176]
```

# Test source

```ts
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
  537 |     await page.goto("/business");
  538 |     const count = await page.locator("nav a").count();
  539 |     expect(count).toBe(4);
  540 |   });
  541 | 
  542 |   test("5.5 Landing page shows 3 pillar cards", async ({ page }) => {
  543 |     await page.goto("/");
> 544 |     await expect(page.locator("h3")).toHaveCount(3);
      |                                      ^ Error: expect(locator).toHaveCount(expected) failed
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
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: lucky-draw.spec.ts >> 2. Customer: Browse & Submit >> 2.2 Guest sees login prompt
- Location: tests/e2e/lucky-draw.spec.ts:248:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=立即登录').or(locator('text=Login'))
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=立即登录').or(locator('text=Login'))

```

```yaml
- button "EN"
- paragraph: 🎰
- heading "Customer Draw" [level=1]
- paragraph: Lucky Biz mqdwtfhi
- text: "50 = 1 张券 · Draw: 7/19/2026"
- paragraph: 距离开奖
- text: "34"
- paragraph: 天
- text: ": 23"
- paragraph: 时
- text: ": 59"
- paragraph: 分
- text: ": 54"
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
- button "📋 查看我的券"
- text: Powered by WeMembers
- alert
```

# Test source

```ts
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
> 250 |     await expect(page.locator("text=立即登录").or(page.locator("text=Login"))).toBeVisible({ timeout: 5000 });
      |                                                                            ^ Error: expect(locator).toBeVisible() failed
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
```
/**
 * Meow BBQ 试点商家 —— 主要功能截图验证
 *
 * 前置：npm run db:full-reset-meowbbq  且 dev server 在 :3000
 * 运行：npx playwright test --config playwright.meowbbq.config.ts
 */
import { test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";
import { SignJWT } from "jose";

const prisma = new PrismaClient({
  datasources: { db: { url: "file:" + path.resolve(__dirname, "../../../prisma/dev.db") } },
});

const BASE = "http://localhost:3000";
const OUT = path.resolve(__dirname, "../output/meowbbq");
fs.mkdirSync(OUT, { recursive: true });

type Shot = { id: string; group: string; url: string; title: string; note: string };
const shots: Shot[] = [];

async function signToken(payload: Record<string, unknown>) {
  const secret = new TextEncoder().encode(
    process.env.JWT_SECRET ||
      "dev-secret-change-in-production-min-32-chars!!"
  );
  return new SignJWT(payload as never)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret);
}

async function setCookie(page: Page, token: string) {
  await page.context().addCookies([
    { name: "gwm_token", value: token, domain: "localhost", path: "/" },
  ]);
}

async function shot(page: Page, s: Shot) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, `${s.id}.png`), fullPage: true });
  shots.push(s);
}

let bizToken = "";
let storeId = "";
let storeSlug = "";
let claimToken = "";

test.describe.configure({ mode: "serial" });

test("00 setup", async () => {
  const biz = await prisma.user.findFirstOrThrow({ where: { businessSlug: "meow-bbq" } });
  bizToken = await signToken({ userId: biz.id, role: "business" });
  const store = await prisma.store.findFirstOrThrow({
    where: { businessId: biz.id }, orderBy: { name: "asc" },
  });
  storeId = store.id;
  storeSlug = store.slug;

  // 造一个待领取的二维码，用于截顾客领取页
  const res = await fetch(`${BASE}/api/business/cashback/issue-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `gwm_token=${bizToken}` },
    body: JSON.stringify({ storeId, amountCents: 8000, receiptNote: "0417" }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error("issue-token failed: " + JSON.stringify(j));
  claimToken = j.data.token;
});

test.describe("平台 / 公开页", () => {
  test("平台首页", async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot(page, { id: "a1", group: "平台", url: "/", title: "平台首页", note: "顾客默认落地页" });
  });
  test("商家品牌页", async ({ page }) => {
    await page.goto(`${BASE}/shop/meow-bbq`);
    await shot(page, { id: "a2", group: "平台", url: "/shop/meow-bbq", title: "商家品牌页", note: "顾客看到的品牌主页：券产品货架" });
  });
  test("门店页", async ({ page }) => {
    await page.goto(`${BASE}/store/${storeSlug}`);
    await shot(page, { id: "a3", group: "平台", url: `/store/${storeSlug}`, title: "门店页", note: "单店视角" });
  });
  test("商戶合作页", async ({ page }) => {
    await page.goto(`${BASE}/for-business`);
    await shot(page, { id: "a4", group: "平台", url: "/for-business", title: "商戶合作页", note: "招商落地页" });
  });
});

test.describe("商家管理", () => {
  test("商家工作台", async ({ page }) => {
    await setCookie(page, bizToken);
    await page.goto(`${BASE}/business`);
    await shot(page, { id: "b1", group: "商家", url: "/business", title: "商家工作台", note: "商家登录后首页" });
  });
  test("消费返活动配置", async ({ page }) => {
    await setCookie(page, bizToken);
    await page.goto(`${BASE}/business/cashback`);
    await page.waitForSelector("text=消费返利", { timeout: 10000 }).catch(() => {});
    await shot(page, { id: "b2", group: "商家", url: "/business/cashback", title: "消费返 + 抽奖 · 活动配置", note: "费率滑块 · 月成本预览（含平台阶梯费与保底）· 门店 opt-in · 额度负债" });
  });
  test("收银台出码", async ({ page }) => {
    await setCookie(page, bizToken);
    await page.goto(`${BASE}/business/cashback-desk`);
    await page.waitForSelector("text=消费金额", { timeout: 10000 }).catch(() => {});
    await shot(page, { id: "b3", group: "商家", url: "/business/cashback-desk", title: "收银台（店员出码）", note: "店员只输一个数字，顾客扫码自助领取" });
  });
  test("收银台已出码", async ({ page }) => {
    await setCookie(page, bizToken);
    await page.goto(`${BASE}/business/cashback-desk`);
    await page.waitForSelector('input[type="number"]', { timeout: 10000 }).catch(() => {});
    await page.fill('input[type="number"]', "80");
    await page.click("text=生成二维码");
    await page.waitForSelector("text=请顾客扫码领取", { timeout: 10000 }).catch(() => {});
    await shot(page, { id: "b4", group: "商家", url: "/business/cashback-desk", title: "出码结果", note: "二维码 + 短码 + 倒计时；金额由店员录入，顾客不可改" });
  });
  test("新建券（券模版目录）", async ({ page }) => {
    await setCookie(page, bizToken);
    await page.goto(`${BASE}/business/voucher-templates`);
    await shot(page, { id: "b5", group: "商家", url: "/business/voucher-templates", title: "新建券 · 券模版目录", note: "储值券 3 + 权益券 3；抵扣额度与奖励券由系统发放，刻意不出现" });
  });
  test("折扣券配置", async ({ page }) => {
    await setCookie(page, bizToken);
    await page.goto(`${BASE}/business/voucher-templates`);
    await page.click("text=折扣券");
    await page.waitForSelector("text=折扣率", { timeout: 10000 }).catch(() => {});
    await shot(page, { id: "b6", group: "商家", url: "/business/voucher-templates", title: "折扣券 · 折扣率可调", note: "0% = 原价代金，10% = 9折卡，20% = 8折卡" });
  });
  test("券产品列表", async ({ page }) => {
    await setCookie(page, bizToken);
    await page.goto(`${BASE}/business/products`);
    await shot(page, { id: "b7", group: "商家", url: "/business/products", title: "券产品列表", note: "由券模版创建的 SKU" });
  });
  test("活动列表", async ({ page }) => {
    await setCookie(page, bizToken);
    await page.goto(`${BASE}/business/campaigns`);
    await shot(page, { id: "b8", group: "商家", url: "/business/campaigns", title: "活动列表", note: "已升到主栏；只显示真活动" });
  });
  test("活动详情 · 挂券产品", async ({ page }) => {
    await setCookie(page, bizToken);
    const camp = await prisma.campaign.findFirstOrThrow({
      where: { businessId: (await prisma.user.findFirstOrThrow({ where: { businessSlug: "meow-bbq" } })).id,
               role: "activity", type: "voucher_sale" },
    });
    await page.goto(`${BASE}/business/campaigns/${camp.id}`);
    await shot(page, { id: "b9", group: "商家", url: "/business/campaigns/[id]", title: "活动详情 · 券产品与门店", note: "券产品与门店范围都在活动内部管理" });
  });
  test("更多菜单", async ({ page }) => {
    await setCookie(page, bizToken);
    await page.goto(`${BASE}/business`);
    await page.click("text=更多").catch(() => {});
    await page.waitForTimeout(600);
    await shot(page, { id: "b10", group: "商家", url: "/business", title: "更多菜单", note: "券产品与现场发券降到二级，名字不再互撞" });
  });
});

test.describe("顾客", () => {
  test("扫码领取页", async ({ page }) => {
    await page.goto(`${BASE}/c/cashback/${claimToken}`);
    await shot(page, { id: "c1", group: "顾客", url: "/c/cashback/[token]", title: "扫码领取（公开页）", note: "金额来自令牌，顾客只填手机号" });
  });
  test("领取成功", async ({ page }) => {
    await page.goto(`${BASE}/c/cashback/${claimToken}`);
    await page.fill('input[type="tel"]', "98761234");
    await page.click("text=立即领取");
    await page.waitForSelector("text=已到账", { timeout: 15000 }).catch(() => {});
    await shot(page, { id: "c2", group: "顾客", url: "/c/cashback/[token]", title: "领取成功", note: "抵扣额度 + 当场即时奖 + 大奖进度条 + 积分" });
  });
  test("我的卡 · 品牌列表", async ({ page }) => {
    const cust = await prisma.user.findFirst({
      where: { role: "customer", phone: { contains: "98761234" } },
      orderBy: { createdAt: "desc" },
    });
    if (!cust) test.skip();
    await setCookie(page, await signToken({ userId: cust!.id, role: "customer" }));
    await page.goto(`${BASE}/card`);
    await shot(page, { id: "c5", group: "顾客", url: "/card", title: "我的卡 · 品牌列表", note: "券包与余额合并，按品牌聚合" });
  });
  test("品牌卡详情", async ({ page }) => {
    const cust = await prisma.user.findFirst({
      where: { role: "customer", phone: { contains: "98761234" } },
      orderBy: { createdAt: "desc" },
    });
    if (!cust) test.skip();
    const biz = await prisma.user.findFirstOrThrow({ where: { businessSlug: "meow-bbq" } });
    await setCookie(page, await signToken({ userId: cust!.id, role: "customer" }));
    await page.goto(`${BASE}/card/${biz.id}`);
    await shot(page, { id: "c6", group: "顾客", url: "/card/[businessId]", title: "品牌卡详情", note: "会员等级 + 我在这家店的余额 + 权益" });
  });
  test("钱包三分区", async ({ page }) => {
    const cust = await prisma.user.findFirst({
      where: { role: "customer", phone: { contains: "98761234" } },
      orderBy: { createdAt: "desc" },
    });
    if (!cust) test.skip();
    await setCookie(page, await signToken({ userId: cust!.id, role: "customer" }));
    await page.goto(`${BASE}/balance`);
    await shot(page, { id: "c3", group: "顾客", url: "/balance", title: "钱包 · 三分区", note: "购券余额(可提现) / 消费抵扣额度(不可提现) / 中奖奖励券" });
  });
  test("顾客首页", async ({ page }) => {
    const cust = await prisma.user.findFirst({
      where: { role: "customer", phone: { contains: "98761234" } },
      orderBy: { createdAt: "desc" },
    });
    if (!cust) test.skip();
    await setCookie(page, await signToken({ userId: cust!.id, role: "customer" }));
    await page.goto(`${BASE}/home`);
    await shot(page, { id: "c4", group: "顾客", url: "/home", title: "顾客首页", note: "" });
  });
});

test.afterAll(async () => {
  fs.writeFileSync(path.join(OUT, "shots.json"), JSON.stringify(shots, null, 2));
  await prisma.$disconnect();
});

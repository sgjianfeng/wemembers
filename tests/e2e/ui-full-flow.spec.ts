/**
 * 真实页面全流程（本地）
 * A 企业发折扣券 → 顾客购券 → 余额拆券 → B 店核销
 *
 * 准备: npx tsx scripts/seed-and-verify-flow.ts
 * 运行: npx playwright test tests/e2e/ui-full-flow.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "./db";

const PW = "flow1234";
const BIZ_A = "flow:biz-a@wm.local";
const BIZ_B = "flow:biz-b@wm.local";
const CUSTOMER_PHONE = "+6590001001";

async function loginPassword(page: Page, contact: string, tab: "customer" | "business") {
  await page.goto(`/auth/login?tab=${tab}`);
  await page.getByRole("tab", { name: tab === "business" ? "企业" : "客户" }).click();
  await page.getByPlaceholder(/9123|email|邮箱|手机/i).fill(contact);
  await page.getByPlaceholder(/密码|password/i).fill(PW);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  if (tab === "business") {
    await page.waitForURL(/\/business/, { timeout: 20000 });
  } else {
    await page.waitForURL(/\/home/, { timeout: 20000 });
  }
}

test.describe.configure({ mode: "serial" });

test("UI full flow: create → buy → split → cross-store redeem", async ({
  page,
}) => {
  test.setTimeout(240000);

  // 本地有 Stripe key 时强制走直购（页面仍点「支付」按钮）
  await page.route("**/api/voucher/checkout**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "E2E force direct", code: "USE_CHECKOUT" }),
    });
  });

  const bizA = await prisma.user.findFirst({ where: { email: BIZ_A } });
  const bizB = await prisma.user.findFirst({ where: { email: BIZ_B } });
  const customer = await prisma.user.findFirst({ where: { phone: CUSTOMER_PHONE } });
  expect(bizA, "先运行: npx tsx scripts/seed-and-verify-flow.ts").toBeTruthy();
  expect(bizB).toBeTruthy();
  expect(customer).toBeTruthy();

  const storeB = await prisma.store.findFirst({ where: { businessId: bizB!.id } });
  expect(storeB).toBeTruthy();

  // ── 1. 企业 A：创建折扣代金券 ─────────────────────
  await loginPassword(page, BIZ_A, "business");
  await page.goto("/business/campaigns/new");
  await expect(page.getByText("折扣代金券").first()).toBeVisible({ timeout: 15000 });
  await page.getByText("折扣代金券").first().click();

  const campaignName = `UI流程-${Date.now().toString(36)}`;
  // Input 无 htmlFor，用 placeholder / 第一个可见 text
  const nameBox = page
    .locator("input:visible")
    .filter({ hasNot: page.locator('[type=date],[type=number],[type=range],[type=checkbox]') })
    .first();
  await nameBox.fill(campaignName);

  // 折扣滑到 10%
  const range = page.locator('input[type="range"]');
  if (await range.count()) {
    await range.fill("10");
  }

  // 开启可售档位（默认只有 10；购买页 UI 只有 50/100/200）
  for (const label of ["S$10", "S$50", "S$100"]) {
    const btn = page.getByRole("button", { name: label, exact: true });
    if (await btn.count()) {
      const cls = (await btn.getAttribute("class")) || "";
      if (!cls.includes("bg-[#1A6EFF]") && !cls.includes("text-white")) {
        await btn.click();
      }
    }
  }

  await page.getByRole("button", { name: /创建活动|创建|发布/ }).last().click();
  await page.waitForURL(/\/business\/campaigns\/.+/, { timeout: 20000 });

  let campaign = await prisma.campaign.findFirst({
    where: { businessId: bizA!.id, name: campaignName },
  });
  if (!campaign) {
    campaign = await prisma.campaign.findFirst({
      where: { businessId: bizA!.id, type: "voucher_sale" },
      orderBy: { createdAt: "desc" },
    });
  }
  expect(campaign).toBeTruthy();
  if (campaign!.status !== "active") {
    await prisma.campaign.update({
      where: { id: campaign!.id },
      data: { status: "active" },
    });
  }
  const slug = campaign!.slug;
  expect(slug).toBeTruthy();

  // ── 2. 顾客：公开页购 S$100 ───────────────────────
  await page.context().clearCookies();
  await loginPassword(page, CUSTOMER_PHONE, "customer");

  await page.goto(`/voucher/${slug}?seller=${bizA!.id}`);
  await expect(page.getByText(/选择券面/)).toBeVisible({ timeout: 20000 });

  // 选 S$100 档
  await page.getByRole("button", { name: /S\$100/ }).click();

  // 本次消费 0（空值会校验失败）
  const spend = page.locator('input[type="number"]').first();
  await spend.fill("0");

  await page.getByRole("button", { name: /PayNow 支付|支付 S\$|购买/ }).first().click();
  await expect(page.getByText("购买成功！")).toBeVisible({ timeout: 20000 });

  // ── 3. 余额页拆券 ─────────────────────────────────
  await page.goto("/balance");
  await expect(
    page.getByRole("heading", { name: "我的余额", exact: true })
  ).toBeVisible({ timeout: 15000 });

  const splitBtn = page.getByRole("button", { name: "拆成多张券" });
  await expect(splitBtn.first()).toBeVisible({ timeout: 10000 });
  await splitBtn.first().click();

  const halfTwo = page.getByRole("button", { name: /一半 \+ 两小张/ });
  if (await halfTwo.isVisible().catch(() => false)) {
    await halfTwo.click();
  }
  await page.getByRole("button", { name: "确认拆券" }).click();
  await page.waitForTimeout(2000);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "我的余额", exact: true })
  ).toBeVisible();

  const activeCount = await prisma.voucher.count({
    where: { customerId: customer!.id, status: "active" },
  });
  expect(activeCount).toBeGreaterThanOrEqual(2);

  const toRedeem = await prisma.voucher.findFirst({
    where: {
      customerId: customer!.id,
      status: "active",
      balanceCents: { gte: 500 },
    },
    orderBy: { balanceCents: "desc" },
  });
  expect(toRedeem).toBeTruthy();

  // ── 4. 企业 B：扫码页核销 ─────────────────────────
  await page.context().clearCookies();
  await loginPassword(page, BIZ_B, "business");
  await page.goto(`/business/scan?storeId=${storeB!.id}`);

  await page.getByRole("button", { name: "抽奖券余额" }).click();
  await page
    .getByPlaceholder(/扫顾客核销码|wmv|券 ID/i)
    .fill(toRedeem!.id);
  await page.getByRole("button", { name: "查询余额" }).click();
  await expect(page.getByRole("button", { name: /部分核销/ })).toBeVisible({
    timeout: 15000,
  });

  // Input 组件无 htmlFor，用 spinbutton / number
  const amountInput = page.getByRole("spinbutton").or(page.locator('input[type="number"]:visible')).first();
  const maxSgd = Math.min(10, toRedeem!.balanceCents / 100);
  await amountInput.fill(String(maxSgd));

  await page.getByRole("button", { name: /部分核销/ }).click();
  await expect(page.getByText("核销成功", { exact: false })).toBeVisible({
    timeout: 20000,
  });

  // ── 5. 数据校验 ───────────────────────────────────
  const usage = await prisma.voucherUsage.findFirst({
    where: { voucherId: toRedeem!.id, storeId: storeB!.id },
    orderBy: { createdAt: "desc" },
  });
  expect(usage, "应有 B 店核销记录").toBeTruthy();

  const commission = await prisma.tokenTransaction.findFirst({
    where: { type: "seller_commission", account: { userId: bizA!.id } },
    orderBy: { createdAt: "desc" },
  });
  expect(commission, "A 应有卖券佣金流水").toBeTruthy();

  const income = await prisma.tokenTransaction.findFirst({
    where: { type: "voucher_redeem_income", account: { userId: bizB!.id } },
    orderBy: { createdAt: "desc" },
  });
  expect(income, "B 应有核销实收流水").toBeTruthy();
});

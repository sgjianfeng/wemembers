/**
 * Physical tickets (实体券) — full rule suite
 *
 * Rules verified:
 * 1. Create voucher batch → codes printed
 * 2. Unbound voucher: same-store redeem once
 * 3. Redeemed unbound cannot claim
 * 4. Claim binds customer → CustomerCoupon (online)
 * 5. Claimed voucher: physical redeem syncs online used
 * 6. Claimed voucher: online redeem syncs physical redeemed
 * 7. Cross-store redeem rejected
 * 8. Second customer cannot claim already-claimed code
 * 9. Draw batch requires campaign; claim → DrawTicket deferred
 * 10. Draw cannot direct-redeem (staff must guide claim)
 * 11. Claim page /c/{code} UI loads
 *
 * Run: npx playwright test tests/e2e/physical-tickets.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "./db";
import { signToken } from "@/lib/auth";

const BASE = "http://localhost:3000";

async function api(
  path: string,
  o: RequestInit & { json?: unknown } = {}
): Promise<Response> {
  const { json, ...fetchOpts } = o;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (fetchOpts.headers) Object.assign(headers, fetchOpts.headers as Record<string, string>);
  return fetch(`${BASE}${path}`, {
    ...fetchOpts,
    headers,
    body: json !== undefined ? JSON.stringify(json) : fetchOpts.body,
  });
}

/** Valid-looking UEN for tests (8–9 digits + letter) */
function testUen(seed: string) {
  const digits = (seed.replace(/\D/g, "") + "201912345").slice(0, 9);
  return `${digits}A`;
}

async function registerUser(
  contact: string,
  role: "business" | "customer",
  name: string
) {
  await api("/api/auth/send-code", {
    method: "POST",
    json: { contact, purpose: "register" },
  });
  const vc = await prisma.verificationCode.findFirst({
    where: { contact: contact.includes("@") ? contact.toLowerCase() : contact, purpose: "register" },
    orderBy: { createdAt: "desc" },
  });
  if (!vc) throw new Error(`no verification code for ${contact}`);
  return api("/api/auth/register", {
    method: "POST",
    json: {
      contact,
      code: vc.code,
      role,
      displayName: name,
      password: "TestPass123!",
      ...(role === "business"
        ? {
            businessName: name,
            businessCategory: "food",
            businessUen: testUen(contact + Date.now().toString()),
          }
        : {}),
    },
  });
}

async function authApi(
  token: string,
  path: string,
  method = "GET",
  json?: unknown
) {
  return api(path, {
    method,
    headers: { Cookie: `gwm_token=${token}` },
    ...(json !== undefined ? { json } : {}),
  });
}

async function loginViaPage(page: Page, token: string) {
  await page.context().addCookies([
    {
      name: "gwm_token",
      value: token,
      domain: "localhost",
      path: "/",
    },
  ]);
}

const r = Date.now().toString(36);
let bizToken = "";
let bizUserId = "";
let storeAId = "";
let storeBId = "";
let custToken = "";
let custUserId = "";
let cust2Token = "";
let campaignId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const bizEmail = `phys-biz-${r}@test.local`;
  const custPhone = `+65922${r.slice(-6)}`;
  const cust2Phone = `+65923${r.slice(-6)}`;

  const b = await registerUser(bizEmail, "business", `PhysBiz ${r}`);
  const bj = await b.json();
  if (!b.ok) {
    throw new Error(`biz register failed: ${JSON.stringify(bj)}`);
  }
  bizUserId = bj.data.user.id;
  // Auth APIs set httpOnly cookie only; mint JWT for API Cookie header
  bizToken = await signToken({ userId: bizUserId, role: "business" });

  const s1 = await authApi(bizToken, "/api/business/stores", "POST", {
    name: `Store A ${r}`,
    address: "VivoCity",
  });
  const s1j = await s1.json();
  if (!s1.ok) throw new Error(`store A: ${JSON.stringify(s1j)}`);
  storeAId = s1j.data.id;

  const s2 = await authApi(bizToken, "/api/business/stores", "POST", {
    name: `Store B ${r}`,
    address: "Orchard",
  });
  const s2j = await s2.json();
  if (!s2.ok) throw new Error(`store B: ${JSON.stringify(s2j)}`);
  storeBId = s2j.data.id;

  const c = await registerUser(custPhone, "customer", `PhysCust ${r}`);
  const cj = await c.json();
  if (!c.ok) throw new Error(`cust: ${JSON.stringify(cj)}`);
  custUserId = cj.data.user.id;
  custToken = await signToken({ userId: custUserId, role: "customer" });

  const c2 = await registerUser(cust2Phone, "customer", `PhysCust2 ${r}`);
  const c2j = await c2.json();
  if (!c2.ok) throw new Error(`cust2: ${JSON.stringify(c2j)}`);
  cust2Token = await signToken({
    userId: c2j.data.user.id,
    role: "customer",
  });

  // Campaign for draw tickets
  campaignId = (
    await prisma.campaign.create({
      data: {
        businessId: bizUserId,
        name: `Phys Draw ${r}`,
        type: "lucky_draw",
        status: "active",
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(Date.now() + 30 * 86400000),
        slug: `phys-draw-${r}`,
      },
    })
  ).id;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("1. create voucher batch generates printed codes", async () => {
  const res = await authApi(bizToken, "/api/business/physical/batches", "POST", {
    storeId: storeAId,
    type: "voucher",
    title: `S$10 实体代金 ${r}`,
    valueCents: 1000,
    quantity: 5,
  });
  const j = await res.json();
  expect(res.status, JSON.stringify(j)).toBe(200);
  expect(j.data.id).toBeTruthy();
  expect(j.data.quantity).toBe(5);

  const tickets = await prisma.physicalTicket.findMany({
    where: { batchId: j.data.id },
  });
  expect(tickets).toHaveLength(5);
  expect(tickets.every((t) => t.status === "printed")).toBe(true);
  expect(tickets.every((t) => t.storeId === storeAId)).toBe(true);
  expect(tickets[0].code.startsWith("PT-")).toBe(true);

  // stash batch id via env-like global
  (globalThis as { __physBatchVoucher?: string }).__physBatchVoucher = j.data.id;
});

test("2. unbound voucher: same-store redeem once", async () => {
  const batchId = (globalThis as { __physBatchVoucher?: string }).__physBatchVoucher!;
  const ticket = await prisma.physicalTicket.findFirst({
    where: { batchId, status: "printed" },
  });
  expect(ticket).toBeTruthy();

  const res = await authApi(
    bizToken,
    "/api/business/physical/redeem",
    "POST",
    { code: ticket!.code, storeId: storeAId }
  );
  const j = await res.json();
  expect(res.status, JSON.stringify(j)).toBe(200);
  expect(j.data.success).toBe(true);
  expect(j.data.wasClaimed).toBe(false);

  const after = await prisma.physicalTicket.findUnique({
    where: { code: ticket!.code },
  });
  expect(after!.status).toBe("redeemed");

  // double redeem fails
  const res2 = await authApi(
    bizToken,
    "/api/business/physical/redeem",
    "POST",
    { code: ticket!.code, storeId: storeAId }
  );
  expect(res2.status).toBe(400);

  (globalThis as { __physRedeemedUnbound?: string }).__physRedeemedUnbound =
    ticket!.code;
});

test("3. redeemed unbound cannot claim", async () => {
  const code = (globalThis as { __physRedeemedUnbound?: string })
    .__physRedeemedUnbound!;
  const res = await authApi(
    custToken,
    `/api/physical/${encodeURIComponent(code)}`,
    "POST"
  );
  const j = await res.json();
  expect(res.status).toBe(400);
  expect(j.error).toMatch(/核销|绑定/);
});

test("4. claim binds → CustomerCoupon (online)", async () => {
  const batchId = (globalThis as { __physBatchVoucher?: string }).__physBatchVoucher!;
  const ticket = await prisma.physicalTicket.findFirst({
    where: { batchId, status: "printed" },
  });
  expect(ticket).toBeTruthy();

  const res = await authApi(
    custToken,
    `/api/physical/${encodeURIComponent(ticket!.code)}`,
    "POST"
  );
  const j = await res.json();
  expect(res.status, JSON.stringify(j)).toBe(200);
  expect(j.data.status).toBe("claimed");

  const after = await prisma.physicalTicket.findUnique({
    where: { code: ticket!.code },
  });
  expect(after!.status).toBe("claimed");
  expect(after!.customerId).toBe(custUserId);
  expect(after!.customerCouponId).toBeTruthy();

  const cc = await prisma.customerCoupon.findUnique({
    where: { id: after!.customerCouponId! },
  });
  expect(cc!.status).toBe("available");
  expect(cc!.customerId).toBe(custUserId);
  expect(cc!.qrCode).toBe(ticket!.code);

  (globalThis as { __physClaimedCode?: string }).__physClaimedCode = ticket!.code;
  (globalThis as { __physClaimedCcId?: string }).__physClaimedCcId = cc!.id;
});

test("5. second customer cannot claim already-claimed", async () => {
  const code = (globalThis as { __physClaimedCode?: string }).__physClaimedCode!;
  const res = await authApi(
    cust2Token,
    `/api/physical/${encodeURIComponent(code)}`,
    "POST"
  );
  expect(res.status).toBe(409);
});

test("6. cross-store redeem rejected", async () => {
  const code = (globalThis as { __physClaimedCode?: string }).__physClaimedCode!;
  const res = await authApi(
    bizToken,
    "/api/business/physical/redeem",
    "POST",
    { code, storeId: storeBId }
  );
  const j = await res.json();
  expect(res.status).toBe(403);
  expect(j.error).toMatch(/仅限/);
});

test("7. claimed: physical redeem syncs online used", async () => {
  const code = (globalThis as { __physClaimedCode?: string }).__physClaimedCode!;
  const ccId = (globalThis as { __physClaimedCcId?: string }).__physClaimedCcId!;

  const res = await authApi(
    bizToken,
    "/api/business/physical/redeem",
    "POST",
    { code, storeId: storeAId }
  );
  const j = await res.json();
  expect(res.status, JSON.stringify(j)).toBe(200);
  expect(j.data.wasClaimed).toBe(true);

  const ticket = await prisma.physicalTicket.findUnique({ where: { code } });
  const cc = await prisma.customerCoupon.findUnique({ where: { id: ccId } });
  expect(ticket!.status).toBe("redeemed");
  expect(cc!.status).toBe("used");
});

test("8. claimed: online redeem syncs physical redeemed", async () => {
  const batchId = (globalThis as { __physBatchVoucher?: string }).__physBatchVoucher!;
  const ticket = await prisma.physicalTicket.findFirst({
    where: { batchId, status: "printed" },
  });
  expect(ticket).toBeTruthy();

  // claim
  const claimRes = await authApi(
    custToken,
    `/api/physical/${encodeURIComponent(ticket!.code)}`,
    "POST"
  );
  expect(claimRes.status).toBe(200);

  // online coupon redeem path (qrCode = physical code)
  const redeemRes = await authApi(bizToken, "/api/business/redeem", "POST", {
    qrCode: ticket!.code,
    storeId: storeAId,
  });
  const rj = await redeemRes.json();
  expect(redeemRes.status, JSON.stringify(rj)).toBe(200);
  expect(rj.data.success).toBe(true);

  const after = await prisma.physicalTicket.findUnique({
    where: { code: ticket!.code },
  });
  expect(after!.status).toBe("redeemed");

  const cc = await prisma.customerCoupon.findUnique({
    where: { id: after!.customerCouponId! },
  });
  expect(cc!.status).toBe("used");

  // wrong store via online path
  const ticket2 = await prisma.physicalTicket.findFirst({
    where: { batchId, status: "printed" },
  });
  if (ticket2) {
    await authApi(
      custToken,
      `/api/physical/${encodeURIComponent(ticket2.code)}`,
      "POST"
    );
    const bad = await authApi(bizToken, "/api/business/redeem", "POST", {
      qrCode: ticket2.code,
      storeId: storeBId,
    });
    expect(bad.status).toBe(403);
  }
});

test("9. draw batch requires campaign; claim → DrawTicket", async () => {
  const noCamp = await authApi(
    bizToken,
    "/api/business/physical/batches",
    "POST",
    {
      storeId: storeAId,
      type: "draw",
      title: `抽奖无活动 ${r}`,
      quantity: 2,
    }
  );
  expect(noCamp.status).toBe(400);

  const res = await authApi(bizToken, "/api/business/physical/batches", "POST", {
    storeId: storeAId,
    type: "draw",
    title: `实体抽奖 ${r}`,
    quantity: 3,
    campaignId,
  });
  const j = await res.json();
  expect(res.status, JSON.stringify(j)).toBe(200);

  const ticket = await prisma.physicalTicket.findFirst({
    where: { batchId: j.data.id, status: "printed" },
  });
  expect(ticket).toBeTruthy();

  // cannot direct redeem draw
  const redeem = await authApi(
    bizToken,
    "/api/business/physical/redeem",
    "POST",
    { code: ticket!.code, storeId: storeAId }
  );
  expect(redeem.status).toBe(400);

  // claim → online draw ticket
  const claim = await authApi(
    custToken,
    `/api/physical/${encodeURIComponent(ticket!.code)}`,
    "POST"
  );
  const cj = await claim.json();
  expect(claim.status, JSON.stringify(cj)).toBe(200);

  const after = await prisma.physicalTicket.findUnique({
    where: { code: ticket!.code },
  });
  expect(after!.status).toBe("claimed");
  expect(after!.customerId).toBe(custUserId);

  const draw = await prisma.drawTicket.findFirst({
    where: {
      campaignId,
      customerId: custUserId,
      ticketNo: { contains: ticket!.code.replace(/^PT-/, "") },
    },
  });
  expect(draw).toBeTruthy();
  expect(draw!.drawMode).toBe("deferred");

  (globalThis as { __physDrawCode?: string }).__physDrawCode = ticket!.code;
});

test("10. claim page UI for printed code", async ({ page }) => {
  const batchId = (globalThis as { __physBatchVoucher?: string }).__physBatchVoucher!;
  const ticket = await prisma.physicalTicket.findFirst({
    where: { batchId, status: "printed" },
  });
  if (!ticket) {
    test.skip();
    return;
  }

  await page.goto(`/c/${encodeURIComponent(ticket.code)}`);
  await expect(page.getByText(/仅限本店|一次用完/)).toBeVisible();
  await expect(page.getByRole("button", { name: /绑定到我的账号/ })).toBeVisible();

  await loginViaPage(page, custToken);
  await page.goto(`/c/${encodeURIComponent(ticket.code)}`);
  await page.getByRole("button", { name: /绑定到我的账号/ }).click();
  await expect(
    page.getByText("已绑定到你的账号 · 按线上券处理")
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: "打开我的钱包" })).toBeVisible();
});

test("11. staff scan UI shows physical tab", async ({ page }) => {
  await loginViaPage(page, bizToken);
  await page.goto(`/business/scan?storeId=${storeAId}`);
  await expect(page.getByRole("button", { name: /实体券|Paper/ })).toBeVisible();
  await page.getByRole("button", { name: /实体券|Paper/ }).click();
  await expect(page.getByPlaceholder(/PT-/)).toBeVisible();
});

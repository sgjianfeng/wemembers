/**
 * Seller eligibility + attribution
 */
import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import { PrismaClient } from "@prisma/client";
import { getEligibleSeller, resolvePurchaseSellerId } from "@/lib/seller";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || "file:./prisma/test.db" } },
});

describe("seller eligibility", () => {
  let businessId: string;
  let customerId: string;
  let promoterId: string;
  let plainCustomerId: string;

  beforeAll(async () => {
    const biz = await prisma.user.create({
      data: {
        role: "business",
        email: `seller-biz-${Date.now()}@t.local`,
        businessName: "Seller Biz",
        status: "active",
      },
    });
    businessId = biz.id;

    const cust = await prisma.user.create({
      data: {
        role: "customer",
        phone: `+6599${Date.now().toString().slice(-8)}`,
        displayName: "Buyer",
        status: "active",
      },
    });
    customerId = cust.id;

    const prom = await prisma.user.create({
      data: {
        role: "customer",
        phone: `+6588${Date.now().toString().slice(-8)}`,
        displayName: "Promoter",
        status: "active",
        promoterAccount: { create: { isActive: true } },
      },
    });
    promoterId = prom.id;

    const plain = await prisma.user.create({
      data: {
        role: "customer",
        phone: `+6577${Date.now().toString().slice(-8)}`,
        displayName: "Plain",
        status: "active",
      },
    });
    plainCustomerId = plain.id;
  });

  afterAll(async () => {
    await prisma.promoterAccount.deleteMany({
      where: { userId: { in: [promoterId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [businessId, customerId, promoterId, plainCustomerId] } },
    });
    await prisma.$disconnect();
  });

  test("business is eligible seller", async () => {
    const e = await getEligibleSeller(businessId);
    expect(e?.kind).toBe("business");
  });

  test("active promoter is eligible", async () => {
    const e = await getEligibleSeller(promoterId);
    expect(e?.kind).toBe("promoter");
  });

  test("plain customer not eligible", async () => {
    expect(await getEligibleSeller(plainCustomerId)).toBeNull();
  });

  test("resolve: self-buy blocked", async () => {
    const id = await resolvePurchaseSellerId({
      shareSellingEnabled: true,
      customerId: promoterId,
      sellerId: promoterId,
    });
    expect(id).toBeNull();
  });

  test("resolve: business seller ok", async () => {
    const id = await resolvePurchaseSellerId({
      shareSellingEnabled: true,
      customerId,
      sellerId: businessId,
    });
    expect(id).toBe(businessId);
  });

  test("resolve: plain customer as seller ignored", async () => {
    const id = await resolvePurchaseSellerId({
      shareSellingEnabled: true,
      customerId,
      sellerId: plainCustomerId,
    });
    expect(id).toBeNull();
  });

  test("resolve: share selling off", async () => {
    const id = await resolvePurchaseSellerId({
      shareSellingEnabled: false,
      customerId,
      sellerId: businessId,
    });
    expect(id).toBeNull();
  });
});

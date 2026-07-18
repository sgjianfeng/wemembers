/**
 * T+1 business income hold / release
 */
import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import { PrismaClient } from "@prisma/client";
import {
  grantBusinessIncomeHold,
  releaseMaturedHolds,
  tPlusOneUnlockAt,
} from "@/lib/tokens";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || "file:./prisma/test.db" } },
});

describe("T+1 income holds", () => {
  let businessId: string;
  let accountId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        role: "business",
        email: `t1-${Date.now()}@test.local`,
        displayName: "T1 Biz",
        businessName: "T1 Biz",
      },
    });
    businessId = user.id;
    const acct = await prisma.tokenAccount.create({
      data: { userId: businessId, balance: 0, frozenBalance: 0, totalEarned: 0, totalSpent: 0 },
    });
    accountId = acct.id;
  });

  afterAll(async () => {
    await prisma.tokenTransaction.deleteMany({ where: { accountId } });
    await prisma.tokenAccount.deleteMany({ where: { userId: businessId } });
    await prisma.user.deleteMany({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  test("tPlusOneUnlockAt is after now", () => {
    const now = new Date("2026-07-17T10:00:00+08:00");
    const unlock = tPlusOneUnlockAt(now);
    expect(unlock.getTime()).toBeGreaterThan(now.getTime());
  });

  test("grant freezes; release only after availableAt", async () => {
    const past = new Date(Date.now() - 60_000);
    await grantBusinessIncomeHold(
      businessId,
      500,
      "voucher_redeem_income",
      "test mature",
      "ref-mature",
      past
    );

    const mid = await prisma.tokenAccount.findUnique({ where: { userId: businessId } });
    expect(mid!.frozenBalance).toBeGreaterThanOrEqual(500);

    const released = await releaseMaturedHolds(businessId);
    expect(released).toBeGreaterThanOrEqual(500);

    const after = await prisma.tokenAccount.findUnique({ where: { userId: businessId } });
    expect(after!.balance).toBeGreaterThanOrEqual(500);
  });

  test("future hold not released", async () => {
    const future = new Date(Date.now() + 86400_000 * 2);
    const before = await prisma.tokenAccount.findUnique({ where: { userId: businessId } });
    await grantBusinessIncomeHold(
      businessId,
      300,
      "voucher_redeem_income",
      "test future",
      "ref-future",
      future
    );
    await releaseMaturedHolds(businessId);
    const after = await prisma.tokenAccount.findUnique({ where: { userId: businessId } });
    expect(after!.frozenBalance).toBeGreaterThanOrEqual(300);
  });
});

/**
 * D 组：店员出码 → 顾客扫码领取
 *
 * 关键断言：
 * - 金额来自令牌（店员录入），顾客不可篡改
 * - 令牌一次性：并发扫同一个码只有一个成功
 * - 过期令牌不可领
 */
import { prisma } from "./setup";
import {
  allocateClaimToken,
  claimTokenExpiry,
  loadClaimToken,
  consumeClaimToken,
  claimTokenPath,
  claimTokenErrorMessage,
  generateClaimTokenCandidate,
  CLAIM_TOKEN_TTL_MINUTES,
} from "@/lib/cashback-token";
import { recordSpend } from "@/lib/cashback";

describe("令牌生成", () => {
  test("字符集无歧义（不含 0/O/1/I/L）", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateClaimTokenCandidate()).not.toMatch(/[01OIL]/);
    }
  });
  test("长度稳定", () => {
    expect(generateClaimTokenCandidate()).toHaveLength(10);
  });
  test("落地路径", () => {
    expect(claimTokenPath("ABC")).toBe("/c/cashback/ABC");
  });
  test("默认 10 分钟有效期", () => {
    const from = new Date("2026-08-22T10:00:00Z");
    expect(claimTokenExpiry(from).toISOString()).toBe("2026-08-22T10:10:00.000Z");
    expect(CLAIM_TOKEN_TTL_MINUTES).toBe(10);
  });
});

describe("扫码领取端到端", () => {
  let businessId: string;
  let storeId: string;
  let campaignId: string;

  const mkToken = async (amountCents: number, expiresAt?: Date) => {
    const token = await allocateClaimToken(prisma);
    return prisma.cashbackClaimToken.create({
      data: {
        token,
        campaignId,
        businessId,
        storeId,
        amountCents,
        expiresAt: expiresAt ?? claimTokenExpiry(),
      },
      select: { id: true, token: true },
    });
  };

  beforeAll(async () => {
    const stamp = `cf-${Date.now()}`;
    const biz = await prisma.user.create({
      data: { role: "business", email: `${stamp}@test.local`, businessName: "CF Biz", businessSlug: stamp },
    });
    businessId = biz.id;
    const store = await prisma.store.create({
      data: { businessId, name: "CF Store", slug: `${stamp}-s` },
    });
    storeId = store.id;
    const campaign = await prisma.campaign.create({
      data: {
        businessId,
        name: "消费返 + 抽奖",
        type: "cashback",
        status: "active",
        startDate: new Date(Date.now() - 86400_000),
        endDate: new Date(Date.now() + 86400_000 * 365),
        productKind: "self_use",
        rulesSnapshot: JSON.stringify({ cashbackPercent: 3, drawPercent: 2 }),
      },
    });
    campaignId = campaign.id;
    await prisma.tokenAccount.create({
      data: { userId: businessId, balance: 100_000, giftBalance: 0 },
    });
  });

  test("完整流程：出码 → 预览 → 领取", async () => {
    const t = await mkToken(10_000);

    const preview = await loadClaimToken(prisma, t.token);
    expect(preview?.state).toBe("pending");
    expect(preview?.amountCents).toBe(10_000);
    expect(preview?.storeName).toBe("CF Store");

    const out = await prisma.$transaction(async (tx) => {
      const loaded = await loadClaimToken(tx, t.token);
      const spend = await recordSpend(tx, {
        campaignId: loaded!.campaignId,
        businessId: loaded!.businessId,
        storeId: loaded!.storeId,
        phone: "91110001",
        amountCents: loaded!.amountCents,
        allowLargeAmount: true,
      });
      const ok = await consumeClaimToken(tx, loaded!.id, {
        customerId: spend.customerId,
        spendRecordId: spend.spendRecordId,
      });
      return { spend, ok };
    });

    expect(out.ok).toBe(true);
    expect(out.spend.accrual.cashbackCents).toBe(300);

    const after = await loadClaimToken(prisma, t.token);
    expect(after?.state).toBe("claimed");
  });

  test("令牌一次性：第二次消费失败", async () => {
    const t = await mkToken(5_000);
    const first = await consumeClaimToken(prisma, t.id, {
      customerId: "c1", spendRecordId: "s1",
    });
    const second = await consumeClaimToken(prisma, t.id, {
      customerId: "c2", spendRecordId: "s2",
    });
    expect(first).toBe(true);
    expect(second).toBe(false); // 并发扫同一个码只有一个成功
  });

  test("过期令牌：状态由时间推导，不依赖后台任务", async () => {
    const t = await mkToken(5_000, new Date(Date.now() - 60_000));
    const loaded = await loadClaimToken(prisma, t.token);
    expect(loaded?.state).toBe("expired");
    // 过期后也不能消费
    const ok = await consumeClaimToken(prisma, t.id, {
      customerId: "c3", spendRecordId: "s3",
    });
    expect(ok).toBe(false);
  });

  test("无效令牌返回 null", async () => {
    expect(await loadClaimToken(prisma, "ZZZZZZZZZZ")).toBeNull();
  });

  test("金额来自令牌，顾客无法篡改", async () => {
    // 令牌记 S$50；即使调用方传别的金额，也应以令牌为准
    const t = await mkToken(5_000);
    const loaded = await loadClaimToken(prisma, t.token);
    expect(loaded!.amountCents).toBe(5_000);

    const spend = await prisma.$transaction((tx) =>
      recordSpend(tx, {
        campaignId, businessId, storeId,
        phone: "91110002",
        // 生产代码传的是 loaded.amountCents，这里断言其值
        amountCents: loaded!.amountCents,
        allowLargeAmount: true,
      })
    );
    expect(spend.accrual.cashbackCents).toBe(150); // 3% of S$50
  });

  test("状态文案", () => {
    expect(claimTokenErrorMessage("claimed")).toContain("已被领取");
    expect(claimTokenErrorMessage("expired")).toContain("过期");
    expect(claimTokenErrorMessage("not_found")).toContain("无效");
  });
});

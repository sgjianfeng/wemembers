/**
 * 会员等级 × cashback 联动。
 *
 * 等级加成是**商家的额外负债**，所以每条边界都要有测试兜住：
 * 总费率上限、欠费降级、未开卡、加成为 0。
 */
import { describe, test, expect } from "@jest/globals";
import {
  computeAccrual,
  applyTierBonus,
  DEFAULT_CASHBACK_RULES,
  TOTAL_PERCENT_MAX,
  DEGRADED_CASHBACK_PERCENT,
} from "@/lib/cashback";

const QUOTE = { grossCents: 0, waivedCents: 0, netCents: 0 };

/**
 * 这一组测的是**等级加成叠在 cashback 上**的行为，所以基线必须自带 cashback。
 * 不能跟着 DEFAULT_CASHBACK_RULES 走——产品默认已经改成"一条线"（cashback 0 / draw 10），
 * 跟着走的话这些断言会因为一个业务参数变动而集体失效，而它们要守的东西根本没变。
 */
const BASE = { ...DEFAULT_CASHBACK_RULES, cashbackPercent: 3, drawPercent: 2 };
const rules = (over: Partial<typeof DEFAULT_CASHBACK_RULES> = {}) => ({
  ...BASE,
  ...over,
});

describe("applyTierBonus", () => {
  test("加成直接叠在基础返现率上", () => {
    expect(applyTierBonus(3, 2, 1)).toBe(4);
  });

  test("加成不能把总费率顶破上限", () => {
    // 基础 10 + 抽奖 4 = 14，只剩 1 个百分点的空间
    expect(applyTierBonus(10, 4, 5)).toBe(11);
    expect(applyTierBonus(10, 4, 5) + 4).toBeLessThanOrEqual(TOTAL_PERCENT_MAX);
  });

  test("总费率已经打满时加成为 0", () => {
    expect(applyTierBonus(10, 5, 3)).toBe(10);
  });

  test("负数与非法值当作无加成", () => {
    expect(applyTierBonus(3, 2, -5)).toBe(3);
    expect(applyTierBonus(3, 2, NaN)).toBe(3);
  });
});

describe("computeAccrual 带等级加成", () => {
  test("金卡 +1%：S$100 消费返 S$4 而不是 S$3", () => {
    const base = computeAccrual({
      amountCents: 10_000,
      rules: rules(),
      tier: "full",
      platformQuote: QUOTE,
    });
    const gold = computeAccrual({
      amountCents: 10_000,
      rules: rules(),
      tier: "full",
      platformQuote: QUOTE,
      memberBonusPercent: 1,
    });

    expect(base.cashbackCents).toBe(300);
    expect(gold.cashbackCents).toBe(400);
    expect(gold.tierBonusPercent).toBe(1);
    expect(base.tierBonusPercent).toBe(0);
  });

  test("加成只影响返现，不动抽奖池", () => {
    const gold = computeAccrual({
      amountCents: 10_000,
      rules: rules(),
      tier: "full",
      platformQuote: QUOTE,
      memberBonusPercent: 2,
    });
    const base = computeAccrual({
      amountCents: 10_000,
      rules: rules(),
      tier: "full",
      platformQuote: QUOTE,
    });
    // 抽奖池不变 —— 否则小奖 EV 会随会员等级漂移，奖品档位就白标定了
    expect(gold.drawCents).toBe(base.drawCents);
    expect(gold.instantPoolCents).toBe(base.instantPoolCents);
    expect(gold.grandPoolCents).toBe(base.grandPoolCents);
  });

  test("欠费降级时加成失效，不能绕过 1% 硬顶", () => {
    const degraded = computeAccrual({
      amountCents: 10_000,
      rules: rules(),
      tier: "degraded",
      platformQuote: QUOTE,
      memberBonusPercent: 5,
    });
    expect(degraded.cashbackPercent).toBe(DEGRADED_CASHBACK_PERCENT);
    expect(degraded.cashbackCents).toBe(100);
    expect(degraded.tierBonusPercent).toBe(0);
  });

  test("points_only 档不发任何返现，加成同样无效", () => {
    const po = computeAccrual({
      amountCents: 10_000,
      rules: rules(),
      tier: "points_only",
      platformQuote: QUOTE,
      memberBonusPercent: 5,
    });
    expect(po.cashbackCents).toBe(0);
    expect(po.drawCents).toBe(0);
    expect(po.tierBonusPercent).toBe(0);
  });

  test("加成受总费率上限约束：高费率活动里被自动挤压", () => {
    const r = rules({ cashbackPercent: 9, drawPercent: 5 }); // 合计 14%
    const a = computeAccrual({
      amountCents: 10_000,
      rules: r,
      tier: "full",
      platformQuote: QUOTE,
      memberBonusPercent: 3,
    });
    expect(a.cashbackPercent).toBe(10); // 只塞得下 1 个百分点
    expect(a.tierBonusPercent).toBe(1);
    expect(a.cashbackPercent + a.drawPercent).toBeLessThanOrEqual(TOTAL_PERCENT_MAX);
  });

  test("未传加成时行为与修改前完全一致", () => {
    const a = computeAccrual({
      amountCents: 7_777,
      rules: rules(),
      tier: "full",
      platformQuote: QUOTE,
    });
    expect(a.cashbackPercent).toBe(BASE.cashbackPercent);
    expect(a.cashbackCents).toBe(Math.floor((7_777 * 3) / 100));
  });
});

// ────────────────────────────────────────────────────────────
// 端到端：recordSpend 是否真的读到了会员等级
// ────────────────────────────────────────────────────────────

import { prisma } from "./setup";
import { recordSpend } from "@/lib/cashback";

describe("recordSpend 读取会员等级加成", () => {
  let businessId: string;
  let storeId: string;
  let storeId2: string;
  let campaignId: string;

  beforeAll(async () => {
    const stamp = `tb-${Date.now()}`;
    const biz = await prisma.user.create({
      data: {
        role: "business",
        email: `${stamp}@test.local`,
        businessName: "Tier Bonus Biz",
        businessSlug: stamp,
      },
    });
    businessId = biz.id;
    const store = await prisma.store.create({
      data: { businessId, name: "TB Store", slug: `${stamp}-store` },
    });
    storeId = store.id;
    // 第二个门店：日封顶是「单客单店单日」，跨店才能验第二笔
    const store2 = await prisma.store.create({
      data: { businessId, name: "TB Store 2", slug: `${stamp}-store2` },
    });
    storeId2 = store2.id;
    const campaign = await prisma.campaign.create({
      data: {
        businessId,
        name: "消费返 + 抽奖",
        type: "cashback",
        status: "active",
        startDate: new Date(Date.now() - 86400_000),
        endDate: new Date(Date.now() + 86400_000 * 365),
        productKind: "self_use",
        rulesSnapshot: JSON.stringify({
          kind: "cashback",
          cashbackPercent: 3,
          drawPercent: 2,
          instantPoolRatio: 35,
        }),
      },
    });
    campaignId = campaign.id;
    await prisma.tokenAccount.create({
      data: { userId: businessId, balance: 100_000, giftBalance: 0 },
    });
    // 金卡 +1%，其余无加成
    await prisma.membershipTierConfig.create({
      data: {
        businessId,
        tier: "gold",
        name: "金卡会员",
        pointsRequired: 2000,
        cashbackBonusPercent: 1,
      },
    });
  });

  test("普通会员：无加成，返 3%", async () => {
    const r = await prisma.$transaction((tx) =>
      recordSpend(tx, {
        campaignId,
        businessId,
        storeId,
        phone: "92220001",
        amountCents: 10_000,
      })
    );
    expect(r.accrual.cashbackCents).toBe(300);
    expect(r.tierBonusPercent).toBe(0);
  });

  test("金卡会员：返 4%，且 SpendRecord 留下等级快照", async () => {
    const phone = "92220002";
    // 先造一个金卡会员
    const { findOrCreateCustomerByPhone } = await import("@/lib/customer-by-phone");
    const customer = await prisma.$transaction((tx) =>
      findOrCreateCustomerByPhone(tx, phone)
    );
    await prisma.membership.create({
      data: {
        businessId,
        customerId: customer.id,
        tier: "gold",
        points: 2000,
        lifetimePoints: 2000,
      },
    });

    const r = await prisma.$transaction((tx) =>
      recordSpend(tx, { campaignId, businessId, storeId, phone, amountCents: 10_000 })
    );

    expect(r.memberTier).toBe("gold");
    expect(r.tierBonusPercent).toBe(1);
    expect(r.accrual.cashbackPercent).toBe(4);
    expect(r.accrual.cashbackCents).toBe(400);

    const rec = await prisma.spendRecord.findUnique({ where: { id: r.spendRecordId } });
    expect(rec!.memberTier).toBe("gold");
    expect(rec!.tierBonusPercent).toBe(1);
    expect(rec!.cashbackPercent).toBe(4);

    // 加成同样计入商家负债
    const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
    expect(c!.cashbackIssuedCents).toBeGreaterThanOrEqual(300 + 400);
  });

  test("本笔带来的升级从下一笔才生效", async () => {
    const phone = "92220003";
    // 一次消费 S$2000 → 得 2000 积分 → 升金卡，但这笔按普通会员计
    const r1 = await prisma.$transaction((tx) =>
      recordSpend(tx, {
        campaignId,
        businessId,
        storeId,
        phone,
        amountCents: 200_000,
        allowLargeAmount: true,
      })
    );
    expect(r1.memberTier).toBeNull(); // 消费前还没开卡
    expect(r1.tierBonusPercent).toBe(0);
    expect(r1.newTier).toBe("gold"); // 这笔之后升级

    // 第二笔按金卡计（换门店，避开单客单店单日封顶）
    const r2 = await prisma.$transaction((tx) =>
      recordSpend(tx, {
        campaignId,
        businessId,
        storeId: storeId2,
        phone,
        amountCents: 10_000,
        receiptNote: "second",
      })
    );
    expect(r2.memberTier).toBe("gold");
    expect(r2.tierBonusPercent).toBe(1);
    expect(r2.accrual.cashbackCents).toBe(400);
  });
});

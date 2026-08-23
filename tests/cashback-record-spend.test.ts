/**
 * 活动 2 计提引擎：记账负债模型
 *
 * 核心断言：专享阶段发放 cashback **不扣商家真金**，只记负债；
 * 平台费才扣真金，扣不动记欠，欠费驱动降级。
 */
import { prisma } from "./setup";
import {
  recordSpend,
  computeAccrual,
  resolveFundingTier,
  validateCashbackRates,
  parseCashbackRules,
  spendFingerprint,
  computeInactivityExpiry,
  assertBalanceUsableForPurchase,
  isBalancePurchasable,
  CashbackError,
  DEFAULT_DAILY_CAP_CENTS,
  OWED_DEGRADE_CENTS,
  OWED_POINTS_ONLY_CENTS,
  DEGRADED_CASHBACK_PERCENT,
  DEFAULT_CASHBACK_RULES,
} from "@/lib/cashback";

describe("费率校验", () => {
  test("总率必须落在 [3%, 15%]", () => {
    expect(validateCashbackRates(3, 2).ok).toBe(true);
    expect(validateCashbackRates(0, 5).ok).toBe(true); // 全给抽奖
    expect(validateCashbackRates(15, 0).ok).toBe(true);
    expect(validateCashbackRates(1, 1).ok).toBe(false); // 2% 太低
    expect(validateCashbackRates(10, 10).ok).toBe(false); // 20% 太高
    expect(validateCashbackRates(-1, 5).ok).toBe(false);
  });
});

describe("parseCashbackRules", () => {
  test("缺失走默认 3+2 / 35:65", () => {
    const r = parseCashbackRules(null);
    expect(r.cashbackPercent).toBe(3);
    expect(r.drawPercent).toBe(2);
    expect(r.instantPoolRatio).toBe(35);
    expect(r.grandPoolRatio).toBe(65);
  });
  test("grandPoolRatio 恒等于 100 - instant", () => {
    const r = parseCashbackRules(JSON.stringify({ instantPoolRatio: 40 }));
    expect(r.grandPoolRatio).toBe(60);
  });
  test("坏 JSON 不崩", () => {
    expect(parseCashbackRules("{oops").cashbackPercent).toBe(3);
  });
});

describe("computeAccrual · 降级档", () => {
  const quote = { grossCents: 100, waivedCents: 0, netCents: 100 };
  const rules = DEFAULT_CASHBACK_RULES;

  test("full：3% + 2%，奖池 35/65 切分", () => {
    const a = computeAccrual({ amountCents: 10_000, rules, tier: "full", platformQuote: quote });
    expect(a.cashbackCents).toBe(300);
    expect(a.drawCents).toBe(200);
    expect(a.instantPoolCents).toBe(70);
    expect(a.grandPoolCents).toBe(130);
  });

  test("degraded：cashback 降到 1%，抽奖不变", () => {
    const a = computeAccrual({ amountCents: 10_000, rules, tier: "degraded", platformQuote: quote });
    expect(a.cashbackPercent).toBe(DEGRADED_CASHBACK_PERCENT);
    expect(a.cashbackCents).toBe(100);
    expect(a.drawCents).toBe(200);
  });

  test("points_only：两者都为 0", () => {
    const a = computeAccrual({ amountCents: 10_000, rules, tier: "points_only", platformQuote: quote });
    expect(a.cashbackCents).toBe(0);
    expect(a.drawCents).toBe(0);
  });

  test("平台费三个数都留痕（红线：减免不记 0）", () => {
    const a = computeAccrual({
      amountCents: 10_000, rules, tier: "full",
      platformQuote: { grossCents: 100, waivedCents: 100, netCents: 0 },
    });
    expect(a.platformGrossCents).toBe(100);
    expect(a.platformWaivedCents).toBe(100);
    expect(a.platformNetCents).toBe(0);
  });
});

describe("resolveFundingTier · 由欠费驱动，不看钱包余额", () => {
  const noCap = { outstandingLiabilityCents: 0, maxOutstandingCents: null };
  test("无欠费 → full", () => {
    expect(resolveFundingTier({ owedCents: 0, ...noCap })).toBe("full");
    expect(resolveFundingTier({ owedCents: OWED_DEGRADE_CENTS - 1, ...noCap })).toBe("full");
  });
  test("欠费 ≥ S$200 → degraded", () => {
    expect(resolveFundingTier({ owedCents: OWED_DEGRADE_CENTS, ...noCap })).toBe("degraded");
  });
  test("欠费 ≥ S$500 → points_only", () => {
    expect(resolveFundingTier({ owedCents: OWED_POINTS_ONLY_CENTS, ...noCap })).toBe("points_only");
  });
  test("未核销负债超上限 → points_only", () => {
    expect(
      resolveFundingTier({
        owedCents: 0,
        outstandingLiabilityCents: 100_000,
        maxOutstandingCents: 100_000,
      })
    ).toBe("points_only");
  });
});

describe("辅助函数", () => {
  test("指纹随金额/门店/日期变化", () => {
    const base = { storeId: "s1", phone: "91234567", amountCents: 10_000, at: new Date("2026-08-22T03:00:00Z") };
    const f = spendFingerprint(base);
    expect(spendFingerprint({ ...base, amountCents: 10_001 })).not.toBe(f);
    expect(spendFingerprint({ ...base, storeId: "s2" })).not.toBe(f);
    expect(spendFingerprint({ ...base, at: new Date("2026-08-23T03:00:00Z") })).not.toBe(f);
    expect(spendFingerprint(base)).toBe(f);
  });

  test("活跃即长期有效：24 个月后失效", () => {
    const from = new Date("2026-08-22T00:00:00Z");
    expect(computeInactivityExpiry(from).toISOString().slice(0, 7)).toBe("2028-08");
  });

  test("资金红线：只有 purchase 余额可用于购券", () => {
    expect(isBalancePurchasable({ origin: "purchase" })).toBe(true);
    expect(isBalancePurchasable({ origin: "cashback" })).toBe(false);
    expect(isBalancePurchasable({ origin: "prize" })).toBe(false);
    expect(() => assertBalanceUsableForPurchase({ origin: "purchase" })).not.toThrow();
    expect(() => assertBalanceUsableForPurchase({ origin: "cashback" })).toThrow(CashbackError);
  });
});

describe("recordSpend · 端到端", () => {
  let businessId: string;
  let storeId: string;
  let campaignId: string;
  const phone = "91230001";

  beforeAll(async () => {
    const stamp = `rs-${Date.now()}`;
    const biz = await prisma.user.create({
      data: { role: "business", email: `${stamp}@test.local`, businessName: "RS Biz", businessSlug: stamp },
    });
    businessId = biz.id;
    const store = await prisma.store.create({
      data: { businessId, name: "RS Store", slug: `${stamp}-store` },
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
        rulesSnapshot: JSON.stringify({
          kind: "cashback", cashbackPercent: 3, drawPercent: 2,
          instantPoolRatio: 35, cashbackInactivityMonths: 24,
        }),
      },
    });
    campaignId = campaign.id;
    // 商家自充 S$100，用于支付平台费
    await prisma.tokenAccount.create({
      data: { userId: businessId, balance: 10_000, giftBalance: 0 },
    });
  });

  test("消费 S$100：发 S$3 额度，商家钱包只扣 S$1 平台费", async () => {
    const before = await prisma.tokenAccount.findUnique({ where: { userId: businessId } });

    const r = await prisma.$transaction((tx) =>
      recordSpend(tx, { campaignId, businessId, storeId, phone, amountCents: 10_000 })
    );

    expect(r.duplicated).toBe(false);
    expect(r.fundingTier).toBe("full");
    expect(r.accrual.cashbackCents).toBe(300);
    expect(r.accrual.drawCents).toBe(200);
    expect(r.platformChargedCents).toBe(100);
    expect(r.platformOwedCents).toBe(0);

    // 关键断言：钱包只少了平台费 S$1，cashback 的 S$3 没扣真金
    const after = await prisma.tokenAccount.findUnique({ where: { userId: businessId } });
    expect(before!.balance - after!.balance).toBe(100);

    // 额度券：Phase 2 起即时小奖并入同一张券（金额小、性质相同，单列只会碎片化）
    const v = await prisma.voucher.findUnique({ where: { id: r.cashbackVoucherId! } });
    expect(v?.origin).toBe("cashback");
    expect(v?.feeExempt).toBe(true);
    expect(v?.paidCents).toBe(0);
    expect(v?.inactivityMonths).toBe(24);
    expect(v?.lastActivityAt).not.toBeNull();

    const instantCents = r.instantPrize?.valueCents ?? 0;
    expect(instantCents).toBeGreaterThan(0); // 100% 必中
    expect(v?.balanceCents).toBe(300 + instantCents);

    // 负债累加：返利 + 即时奖都是发出去的额度
    const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
    expect(c?.cashbackIssuedCents).toBe(300 + instantCents);

    // 大奖池按 65% 累积
    expect(c?.grandPoolCents).toBe(130);
    expect(r.grandProgress?.tierId).toBe("grand_10x");
    // 档位按活动配置的平均客单价（默认 S$25）生成，不随本笔金额浮动
    expect(r.grandProgress?.targetCents).toBe(83_300);

    // 积分
    expect(r.pointsAwarded).toBe(100);
  });

  test("平台费记三笔账：应收 + 减免 + 欠费，净额 = 实扣", async () => {
    const acct = await prisma.tokenAccount.findUnique({ where: { userId: businessId } });
    const txs = await prisma.tokenTransaction.findMany({
      where: { accountId: acct!.id, type: { startsWith: "platform_fee" } },
    });
    expect(txs.some((t) => t.type === "platform_fee" && t.amount === -100)).toBe(true);
    const net = txs.reduce((sum, t) => sum + t.amount, 0);
    expect(net).toBe(-100); // 无减免无欠费时净额 = -实扣
  });

  test("同指纹重复提交：幂等，不重复发放", async () => {
    const c1 = await prisma.campaign.findUnique({ where: { id: campaignId } });
    const r = await prisma.$transaction((tx) =>
      recordSpend(tx, { campaignId, businessId, storeId, phone, amountCents: 10_000 })
    );
    expect(r.duplicated).toBe(true);
    const c2 = await prisma.campaign.findUnique({ where: { id: campaignId } });
    expect(c2?.cashbackIssuedCents).toBe(c1?.cashbackIssuedCents);
  });

  test("单客单店单日封顶 S$50", async () => {
    const p = "91230002";
    // 第一笔 S$1,500 → 返 S$45
    await prisma.$transaction((tx) =>
      recordSpend(tx, { campaignId, businessId, storeId, phone: p, amountCents: 150_000 })
    );
    // 第二笔 S$1,500 → 本应返 S$45，但当日只剩 S$5 额度
    const r2 = await prisma.$transaction((tx) =>
      recordSpend(tx, {
        campaignId, businessId, storeId, phone: p,
        amountCents: 150_000, receiptNote: "second",
      })
    );
    expect(r2.cappedByDaily).toBe(true);
    expect(r2.accrual.cashbackCents).toBe(DEFAULT_DAILY_CAP_CENTS - 4_500);
  });

  test("大奖档位跨交易稳定：不随单笔金额浮动", async () => {
    // 同一活动下，小额与大额消费应看到同一个解锁目标——
    // 否则顾客花 S$5 和花 S$500 会看到完全不同的进度条
    const small = await prisma.$transaction((tx) =>
      recordSpend(tx, {
        campaignId, businessId, storeId,
        phone: "91230010", amountCents: 500,
      })
    );
    const large = await prisma.$transaction((tx) =>
      recordSpend(tx, {
        campaignId, businessId, storeId,
        phone: "91230011", amountCents: 190_000,
      })
    );
    expect(small.grandProgress?.targetCents).toBe(large.grandProgress?.targetCents);
    expect(small.grandProgress?.tierId).toBe(large.grandProgress?.tierId);
  });

  test("单笔超 S$2,000 需企业主确认", async () => {
    await expect(
      prisma.$transaction((tx) =>
        recordSpend(tx, { campaignId, businessId, storeId, phone: "91230003", amountCents: 300_000 })
      )
    ).rejects.toThrow("AMOUNT_TOO_LARGE");

    const ok = await prisma.$transaction((tx) =>
      recordSpend(tx, {
        campaignId, businessId, storeId, phone: "91230003",
        amountCents: 300_000, allowLargeAmount: true,
      })
    );
    expect(ok.duplicated).toBe(false);
  });

  test("门店未参加活动 → 拒绝", async () => {
    const other = await prisma.store.create({
      data: { businessId, name: "Other Store", slug: `other-${Date.now()}` },
    });
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { storeIds: JSON.stringify([storeId]) },
    });
    await expect(
      prisma.$transaction((tx) =>
        recordSpend(tx, {
          campaignId, businessId, storeId: other.id,
          phone: "91230004", amountCents: 5_000,
        })
      )
    ).rejects.toThrow("STORE_NOT_IN_CAMPAIGN");
    await prisma.campaign.update({ where: { id: campaignId }, data: { storeIds: null } });
  });

  test("活动未启用 / 过期 → 拒绝", async () => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "draft" } });
    await expect(
      prisma.$transaction((tx) =>
        recordSpend(tx, { campaignId, businessId, storeId, phone: "91230005", amountCents: 5_000 })
      )
    ).rejects.toThrow("CAMPAIGN_NOT_ACTIVE");
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "active" } });
  });

  test("钱包见底：平台费记欠，但仍照常发额度（顾客不为商家账务买单）", async () => {
    await prisma.tokenAccount.update({
      where: { userId: businessId },
      data: { balance: 0, giftBalance: 0 },
    });
    const r = await prisma.$transaction((tx) =>
      recordSpend(tx, { campaignId, businessId, storeId, phone: "91230006", amountCents: 10_000 })
    );
    expect(r.platformChargedCents).toBe(0);
    expect(r.platformOwedCents).toBeGreaterThan(0);
    expect(r.accrual.cashbackCents).toBe(300); // 额度照发
    expect(r.cashbackVoucherId).not.toBeNull();
  });
});

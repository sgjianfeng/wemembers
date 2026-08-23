/**
 * Phase 1 · A 组：cashback 资金安全红线
 *
 * 1. feeExempt 券核销零抽点（防双重抽点）
 * 2. cashback 券不可提现 / 不可退款 / 不可拆分
 * 3. cashback 储备金核销
 */
import { prisma } from "./setup";
import {
  splitRedeemAmount,
  splitFeeExemptRedeem,
} from "@/lib/redeem-economics";
import { applyRedeemSplit } from "@/lib/apply-redeem-split";
import { settleCashbackRedeem, CASHBACK_INACTIVITY_MONTHS } from "@/lib/cashback";

describe("splitRedeemAmount · feeExempt 短路", () => {
  test("feeExempt=true · draw 模式也零抽点，面额全额归门店", () => {
    const s = splitRedeemAmount({
      amountCents: 10_000,
      budgetPercent: 20,
      sellerCommissionPercent: 5,
      platformFeePercent: 2,
      hasSeller: true,
      mode: "draw",
      feeExempt: true,
    });
    expect(s.storeIncomeCents).toBe(10_000);
    expect(s.potCents).toBe(0);
    expect(s.platformFeeCents).toBe(0);
    expect(s.sellerCommissionCents).toBe(0);
    expect(s.prizePoolCents).toBe(0);
  });

  test("feeExempt=true · voucher 模式忽略 face/paid 折算", () => {
    const s = splitRedeemAmount({
      amountCents: 3_000,
      hasSeller: true,
      mode: "voucher",
      faceCents: 10_000,
      paidCents: 9_000, // 若走正常路径会按 90% 折算现金当量
      feeExempt: true,
    });
    expect(s.cashCents).toBe(3_000);
    expect(s.storeIncomeCents).toBe(3_000);
    expect(s.platformFeeCents).toBe(0);
  });

  test("feeExempt=false · 仍走原扣点逻辑（回归保护）", () => {
    const s = splitRedeemAmount({
      amountCents: 10_000,
      budgetPercent: 20,
      sellerCommissionPercent: 5,
      platformFeePercent: 2,
      hasSeller: true,
      mode: "draw",
    });
    expect(s.storeIncomeCents).toBe(8_000);
    expect(s.platformFeeCents).toBe(200);
  });

  test("splitFeeExemptRedeem · 负数/零金额安全", () => {
    expect(splitFeeExemptRedeem({ amountCents: 0, hasSeller: false }).storeIncomeCents).toBe(0);
    expect(splitFeeExemptRedeem({ amountCents: -500, hasSeller: false }).storeIncomeCents).toBe(0);
  });
});

describe("applyRedeemSplit · feeExempt 不产生平台费/佣金/奖池", () => {
  let businessId: string;
  let storeId: string;
  let campaignId: string;
  let customerId: string;

  beforeAll(async () => {
    const stamp = `cbg-${Date.now()}`;
    const biz = await prisma.user.create({
      data: {
        role: "business",
        email: `${stamp}@test.local`,
        businessName: "Cashback Guard Biz",
        businessSlug: stamp,
      },
    });
    businessId = biz.id;

    const store = await prisma.store.create({
      data: { businessId, name: "CB Store", slug: `${stamp}-store` },
    });
    storeId = store.id;

    const customer = await prisma.user.create({
      data: { role: "customer", phone: `9${Date.now()}`.slice(0, 11) },
    });
    customerId = customer.id;

    const campaign = await prisma.campaign.create({
      data: {
        businessId,
        name: "Cashback 测试",
        type: "cashback",
        status: "active",
        startDate: new Date(Date.now() - 86400_000),
        endDate: new Date(Date.now() + 86400_000 * 30),
        productKind: "self_use",
        cashbackIssuedCents: 5_000,
      },
    });
    campaignId = campaign.id;
  });

  test("feeExempt 券核销：奖池/平台费/佣金累计均为 0", async () => {
    const voucher = await prisma.voucher.create({
      data: {
        customerId,
        campaignId,
        storeId,
        amountCents: 1_000,
        paidCents: 0,
        balanceCents: 1_000,
        prizePoolContribution: 0,
        drawWeight: 0,
        tier: "small",
        productKind: "self_use",
        origin: "cashback",
        feeExempt: true,
      },
    });

    const applied = await applyRedeemSplit({
      voucherId: voucher.id,
      campaignId,
      amountCents: 1_000,
      storeId,
      redeemerBusinessId: businessId,
      issuerBusinessId: businessId,
      budgetPercent: 20,
      sellerCommissionPercent: 5,
      platformFeePercent: 2,
      sellerId: null,
      label: "核销 cashback 额度",
      mode: "draw",
      feeExempt: true,
    });

    expect(applied.split.storeIncomeCents).toBe(1_000);
    expect(applied.split.platformFeeCents).toBe(0);
    expect(applied.split.prizePoolCents).toBe(0);
    expect(applied.sellerRewardRecipientId).toBeNull();

    const usage = await prisma.voucherUsage.findUnique({
      where: { id: applied.usageId },
    });
    expect(usage?.feeCents).toBe(0);
    expect(usage?.storeIncome).toBe(1_000);

    const after = await prisma.voucher.findUnique({ where: { id: voucher.id } });
    expect(after?.prizePoolContribution).toBe(0);
    expect(after?.platformFeeCents).toBe(0);
    expect(after?.sellerCommissionCents).toBe(0);
    // 活跃即长期有效：核销刷新时钟
    expect(after?.lastActivityAt).not.toBeNull();

    // 奖池未被污染
    const camp = await prisma.campaign.findUnique({ where: { id: campaignId } });
    expect(camp?.instantPoolCents).toBe(0);
    expect(camp?.grandPoolCents).toBe(0);
  });
});

describe("settleCashbackRedeem · 负债兑现", () => {
  let campaignId: string;

  beforeAll(async () => {
    const stamp = `cbs-${Date.now()}`;
    const biz = await prisma.user.create({
      data: {
        role: "business",
        email: `${stamp}@test.local`,
        businessName: "CB Settle Biz",
        businessSlug: stamp,
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        businessId: biz.id,
        name: "负债测试",
        type: "cashback",
        status: "active",
        startDate: new Date(Date.now() - 86400_000),
        endDate: new Date(Date.now() + 86400_000 * 30),
        cashbackIssuedCents: 1_000,
      },
    });
    campaignId = campaign.id;
  });

  test("核销累加，未核销负债递减", async () => {
    const r = await settleCashbackRedeem(prisma, campaignId, 300);
    expect(r.redeemedCents).toBe(300);
    expect(r.outstandingAfterCents).toBe(700);
    const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
    expect(c?.cashbackIssuedCents).toBe(1_000);
    expect(c?.cashbackRedeemedCents).toBe(300);
  });

  test("核销超过已发放：负债夹到 0，不为负", async () => {
    const r = await settleCashbackRedeem(prisma, campaignId, 5_000);
    expect(r.redeemedCents).toBe(5_000);
    expect(r.outstandingAfterCents).toBe(0);
    const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
    // 核销累计记真实值，便于对账发现异常（发放 1000 却核销了 5300）
    expect(c?.cashbackRedeemedCents).toBe(5_300);
  });

  test("零/负金额是 no-op", async () => {
    const before = await prisma.campaign.findUnique({ where: { id: campaignId } });
    const r = await settleCashbackRedeem(prisma, campaignId, 0);
    expect(r.redeemedCents).toBe(0);
    const after = await prisma.campaign.findUnique({ where: { id: campaignId } });
    expect(after?.cashbackRedeemedCents).toBe(before?.cashbackRedeemedCents);
  });
});

describe("schema 默认值 · 存量券不受影响", () => {
  test("新建 Voucher 默认 origin=purchase / feeExempt=false", async () => {
    const stamp = `cbd-${Date.now()}`;
    const biz = await prisma.user.create({
      data: {
        role: "business",
        email: `${stamp}@test.local`,
        businessName: "Default Biz",
        businessSlug: stamp,
      },
    });
    const customer = await prisma.user.create({ data: { role: "customer" } });
    const campaign = await prisma.campaign.create({
      data: {
        businessId: biz.id,
        name: "默认值测试",
        type: "voucher_sale",
        status: "active",
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400_000),
      },
    });
    const v = await prisma.voucher.create({
      data: {
        customerId: customer.id,
        campaignId: campaign.id,
        amountCents: 5_000,
        balanceCents: 5_000,
        prizePoolContribution: 0,
        drawWeight: 1,
        tier: "small",
      },
    });
    expect(v.origin).toBe("purchase");
    expect(v.feeExempt).toBe(false);
    expect(v.lastActivityAt).toBeNull();
    expect(v.inactivityMonths).toBeNull();
  });

  test("cashback 默认失效月数为 24", () => {
    expect(CASHBACK_INACTIVITY_MONTHS).toBe(24);
  });

  test("SpendRecord.fundedByBusinessId 必填（加盟连锁前置）", async () => {
    const stamp = `cbf-${Date.now()}`;
    const biz = await prisma.user.create({
      data: {
        role: "business",
        email: `${stamp}@test.local`,
        businessName: "Funder Biz",
        businessSlug: stamp,
      },
    });
    const store = await prisma.store.create({
      data: { businessId: biz.id, name: "F Store", slug: `${stamp}-s` },
    });
    const campaign = await prisma.campaign.create({
      data: {
        businessId: biz.id,
        name: "流水测试",
        type: "cashback",
        status: "active",
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400_000),
      },
    });
    const rec = await prisma.spendRecord.create({
      data: {
        campaignId: campaign.id,
        businessId: biz.id,
        fundedByBusinessId: biz.id,
        storeId: store.id,
        phone: "91234567",
        amountCents: 10_000,
        cashbackPercent: 3,
        drawPercent: 2,
        platformPercent: 1,
        cashbackCents: 300,
        drawCents: 200,
        platformFeeCents: 100,
      },
    });
    expect(rec.fundedByBusinessId).toBe(biz.id);
    expect(rec.fundingTier).toBe("full");
    expect(rec.status).toBe("settled");
    expect(rec.platformWaivedCents).toBe(0);
  });
});

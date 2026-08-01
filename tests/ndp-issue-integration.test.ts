/**
 * 国庆满赠发放集成：双权益 + 门槛 + 防重
 */
import { prisma } from "./setup";
import {
  issueNdpGrantDual,
  issueNdpGiftCouponOnly,
  NDP_MIN_SPEND_CENTS,
  giftGrandDrawWeight,
  buildNdpRulesSnapshot,
} from "@/lib/ndp-promo";

describe("issueNdpGrantDual", () => {
  let businessId: string;
  let storeId: string;
  let campaignId: string;

  beforeAll(async () => {
    const biz = await prisma.user.create({
      data: {
        role: "business",
        email: `ndp-biz-${Date.now()}@test.local`,
        businessName: "NDP Test Biz",
        businessSlug: `ndp-biz-${Date.now()}`,
      },
    });
    businessId = biz.id;

    const store = await prisma.store.create({
      data: {
        businessId,
        name: "NDP Store",
        slug: `ndp-store-${Date.now()}`,
      },
    });
    storeId = store.id;

    const start = new Date();
    start.setDate(start.getDate() - 1);
    const end = new Date();
    end.setDate(end.getDate() + 60);

    const campaign = await prisma.campaign.create({
      data: {
        businessId,
        name: "国庆满赠测试",
        type: "holiday",
        status: "active",
        startDate: start,
        endDate: end,
        productKind: "self_use",
        tags: JSON.stringify(["ndp"]),
        rulesSnapshot: JSON.stringify({
          ndp: {
            minSpendCents: 12000,
            giftCouponCents: 6100,
            validDays: 30,
            giftWeightFactor: 0.2,
          },
        }),
      },
    });
    campaignId = campaign.id;
  });

  it("issues S$61 coupon + gift draw voucher without instant prize", async () => {
    const phone = `9${String(Date.now()).slice(-7)}`;
    const result = await prisma.$transaction((tx) =>
      issueNdpGrantDual(tx, {
        campaignId,
        businessId,
        storeId,
        staffUserId: businessId,
        phone,
        channel: "receipt",
        receiptAmountCents: 12800,
        receiptNote: "t001",
      })
    );

    expect(result.giftCoupon.valueCents).toBe(6100);
    expect(result.drawEntry.drawWeight).toBe(giftGrandDrawWeight());
    expect(result.drawEntry.weightMultiple).toBeCloseTo(5, 5);

    const claim = await prisma.customerCoupon.findUnique({
      where: { id: result.giftCoupon.customerCouponId },
    });
    expect(claim?.status).toBe("available");
    expect(claim?.expiresAt).not.toBeNull();

    const voucher = await prisma.voucher.findUnique({
      where: { id: result.drawEntry.voucherId },
    });
    expect(voucher?.balanceCents).toBe(0);
    expect(voucher?.paidCents).toBe(0);
    expect(voucher?.prizePoolContribution).toBe(0);
    expect(voucher?.drawWeight).toBe(giftGrandDrawWeight());

    const draws = await prisma.voucherDraw.count({
      where: { voucherId: voucher!.id },
    });
    expect(draws).toBe(0);

    const grant = await prisma.promoGrant.findUnique({
      where: { id: result.grantId },
    });
    expect(grant?.status).toBe("claimed");
    expect(grant?.phone).toBe(phone);
  });

  it("rejects below min spend", async () => {
    await expect(
      prisma.$transaction((tx) =>
        issueNdpGrantDual(tx, {
          campaignId,
          businessId,
          storeId,
          phone: `8${String(Date.now()).slice(-7)}`,
          channel: "receipt",
          receiptAmountCents: NDP_MIN_SPEND_CENTS - 1,
        })
      )
    ).rejects.toThrow("BELOW_MIN_SPEND");
  });

  it("rejects duplicate receipt fingerprint same day", async () => {
    const phone = `7${String(Date.now()).slice(-7)}`;
    await prisma.$transaction((tx) =>
      issueNdpGrantDual(tx, {
        campaignId,
        businessId,
        storeId,
        phone,
        channel: "receipt",
        receiptAmountCents: 15000,
        receiptNote: "dup-me",
      })
    );
    await expect(
      prisma.$transaction((tx) =>
        issueNdpGrantDual(tx, {
          campaignId,
          businessId,
          storeId,
          phone,
          channel: "receipt",
          receiptAmountCents: 15000,
          receiptNote: "dup-me",
        })
      )
    ).rejects.toThrow("DUPLICATE_RECEIPT");
  });

  it("comp skips min spend", async () => {
    const phone = `6${String(Date.now()).slice(-7)}`;
    const result = await prisma.$transaction((tx) =>
      issueNdpGrantDual(tx, {
        campaignId,
        businessId,
        storeId,
        phone,
        channel: "comp",
        receiptAmountCents: 0,
        receiptNote: "vip",
        skipMinSpend: true,
      })
    );
    expect(result.giftCoupon.valueCents).toBe(6100);
  });

  it("redeem path issues coupon only (no gift draw voucher)", async () => {
    const cust = await prisma.user.create({
      data: {
        role: "customer",
        phone: `5${String(Date.now()).slice(-7)}`,
        displayName: "Redeem Cust",
      },
    });
    // refresh rules with enabled ndp
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { rulesSnapshot: buildNdpRulesSnapshot({ enabled: true }) },
    });

    const only = await prisma.$transaction((tx) =>
      issueNdpGiftCouponOnly(tx, {
        campaignId,
        businessId,
        storeId,
        customerId: cust.id,
        phone: cust.phone,
        receiptAmountCents: 15000,
        fingerprint: `redeem|test-${Date.now()}`,
        channel: "redeem",
      })
    );
    expect(only).not.toBeNull();
    expect(only!.valueCents).toBe(6100);

    const grant = await prisma.promoGrant.findUnique({
      where: { id: only!.grantId },
    });
    expect(grant?.voucherId).toBeNull();
    expect(grant?.channel).toBe("redeem");
  });
});

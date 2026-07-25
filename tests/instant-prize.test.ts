/**
 * 直观模式：小奖金额加入可花余额
 */
import { prisma } from "./setup";
import { awardInstantPrizeToVoucher } from "@/lib/instant-prize";
import { resolveTier } from "@/lib/draw-v2";

describe("awardInstantPrizeToVoucher", () => {
  it("credits prize value into voucher balance", async () => {
    const r = Date.now().toString(36);
    const biz = await prisma.user.create({
      data: {
        email: `ip-${r}@t.local`,
        role: "business",
        businessName: `IP ${r}`,
        status: "active",
      },
    });
    const cust = await prisma.user.create({
      data: {
        phone: `91${r.slice(-6)}`,
        role: "customer",
        status: "active",
      },
    });
    const camp = await prisma.campaign.create({
      data: {
        businessId: biz.id,
        name: `Draw ${r}`,
        type: "lucky_draw_v2",
        productKind: "self_use",
        status: "active",
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000 * 30),
        instantPoolCents: 5000,
      },
    });
    const voucher = await prisma.voucher.create({
      data: {
        customerId: cust.id,
        campaignId: camp.id,
        amountCents: 10000,
        paidCents: 10000,
        balanceCents: 10000,
        usedCents: 0,
        prizePoolContribution: 0,
        drawWeight: 100,
        tier: "medium",
        status: "active",
        productKind: "self_use",
        paymentMethod: "stripe",
      },
    });

    const tier = resolveTier(100)!;
    const awarded = await awardInstantPrizeToVoucher(prisma, {
      voucherId: voucher.id,
      campaignId: camp.id,
      tier,
      weightAtTime: 100,
      instantPoolCents: 5000,
      recomputeWeight: true,
    });

    expect(awarded.creditedCents).toBeGreaterThan(0);
    expect(awarded.balanceAfterCents).toBe(10000 + awarded.creditedCents);

    const after = await prisma.voucher.findUnique({
      where: { id: voucher.id },
    });
    expect(after!.balanceCents).toBe(10000 + awarded.creditedCents);

    const draw = await prisma.voucherDraw.findFirst({
      where: { voucherId: voucher.id, drawType: "instant" },
    });
    expect(draw?.won).toBe(true);
    expect(draw?.valueCents).toBe(awarded.creditedCents);
  });
});

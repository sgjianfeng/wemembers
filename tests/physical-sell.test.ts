/**
 * Physical ticket sell + group redeem rules (unit, Prisma only)
 */
import { prisma } from "./setup";
import {
  canClaimPhysicalStatus,
  canRedeemPhysicalVoucherStatus,
  normalizePhysicalCode,
} from "@/lib/physical-tickets";

describe("physical-tickets helpers", () => {
  it("normalizes code and claim/redeem status gates", () => {
    expect(normalizePhysicalCode("pt-abc123")).toBe("PT-ABC123");
    expect(normalizePhysicalCode("https://wemembers.store/c/PT-XYZ")).toBe(
      "PT-XYZ"
    );
    expect(canClaimPhysicalStatus("printed")).toBe(true);
    expect(canClaimPhysicalStatus("sold")).toBe(true);
    expect(canClaimPhysicalStatus("redeemed")).toBe(false);
    expect(canRedeemPhysicalVoucherStatus("printed")).toBe(false);
    expect(canRedeemPhysicalVoucherStatus("sold")).toBe(true);
    expect(canRedeemPhysicalVoucherStatus("claimed")).toBe(true);
  });
});

describe("physical sell → redeem data model", () => {
  it("records soldStore and redeemedStore across group stores", async () => {
    const r = Date.now().toString(36);
    const biz = await prisma.user.create({
      data: {
        email: `phys-u-${r}@t.local`,
        role: "business",
        businessName: `Phys ${r}`,
        status: "active",
      },
    });
    const storeA = await prisma.store.create({
      data: {
        businessId: biz.id,
        name: `A ${r}`,
        slug: `a-${r}`,
      },
    });
    const storeB = await prisma.store.create({
      data: {
        businessId: biz.id,
        name: `B ${r}`,
        slug: `b-${r}`,
      },
    });
    const coupon = await prisma.coupon.create({
      data: {
        businessId: biz.id,
        title: `C ${r}`,
        type: "fixed_amount",
        valueCents: 1000,
        status: "published",
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 86400000 * 30),
      },
    });
    const batch = await prisma.physicalBatch.create({
      data: {
        businessId: biz.id,
        storeId: storeA.id,
        type: "voucher",
        title: `Batch ${r}`,
        valueCents: 1000,
        quantity: 1,
        couponId: coupon.id,
      },
    });
    const ticket = await prisma.physicalTicket.create({
      data: {
        batchId: batch.id,
        storeId: storeA.id,
        code: `PT-TEST${r.toUpperCase().slice(0, 8)}`,
        status: "printed",
      },
    });

    // sell at A
    const sold = await prisma.physicalTicket.update({
      where: { id: ticket.id },
      data: {
        status: "sold",
        soldAt: new Date(),
        soldById: biz.id,
        soldStoreId: storeA.id,
        paidCents: 900,
        paymentMethod: "cash",
      },
    });
    expect(sold.status).toBe("sold");
    expect(sold.soldStoreId).toBe(storeA.id);
    expect(sold.paidCents).toBe(900);

    // redeem at B
    const redeemed = await prisma.physicalTicket.update({
      where: { id: ticket.id },
      data: {
        status: "redeemed",
        redeemedAt: new Date(),
        redeemedById: biz.id,
        redeemedStoreId: storeB.id,
      },
    });
    expect(redeemed.redeemedStoreId).toBe(storeB.id);
    expect(redeemed.soldStoreId).toBe(storeA.id);
    expect(redeemed.storeId).toBe(storeA.id); // print store unchanged
  });
});

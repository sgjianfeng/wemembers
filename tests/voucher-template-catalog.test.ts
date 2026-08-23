/**
 * E 组：券模版目录
 *
 * - 折扣券折扣率 / 有效期 / 门槛可配
 * - 抵扣额度与奖励券只能系统发放，不可手动创建
 */
import { prisma } from "./setup";
import {
  buildDiscountVoucherSnapshot,
  clampDiscountPercent,
} from "@/lib/store-defaults";
import { createVoucherProduct } from "@/lib/catalog";

describe("折扣券参数化", () => {
  test("折扣率 0 / 10 / 20 各自成立", () => {
    expect(buildDiscountVoucherSnapshot(0).discountPercent).toBe(0);
    expect(buildDiscountVoucherSnapshot(10).discountPercent).toBe(10);
    expect(buildDiscountVoucherSnapshot(20).discountPercent).toBe(20);
  });

  test("有效期：null = 跟随活动截止（存量行为）", () => {
    expect(buildDiscountVoucherSnapshot(10).validDays).toBeNull();
    expect(buildDiscountVoucherSnapshot(10, [10], { validDays: 0 }).validDays).toBeNull();
    expect(buildDiscountVoucherSnapshot(10, [10], { validDays: 90 }).validDays).toBe(90);
  });

  test("门槛倍数：0 = 无门槛", () => {
    expect(buildDiscountVoucherSnapshot(10).minSpendMultiplier).toBe(0);
    expect(
      buildDiscountVoucherSnapshot(10, [10], { minSpendMultiplier: 10 })
        .minSpendMultiplier
    ).toBe(10);
  });

  test("折扣率上限 50%（防误配成 90% 折扣）", () => {
    expect(clampDiscountPercent(90)).toBe(50);
  });
});

describe("createVoucherProduct · discount_voucher", () => {
  let businessId: string;

  beforeAll(async () => {
    const stamp = `vt-${Date.now()}`;
    const biz = await prisma.user.create({
      data: {
        role: "business",
        email: `${stamp}@test.local`,
        businessName: "VT Biz",
        businessSlug: stamp,
      },
    });
    businessId = biz.id;
    await prisma.store.create({
      data: { businessId, name: "VT Store", slug: `${stamp}-s` },
    });
  });

  test("8 折卡：折扣率与有效期落进 rulesSnapshot", async () => {
    const p = await createVoucherProduct(businessId, {
      name: "8折卡",
      packKind: "discount_voucher",
      discountPercent: 20,
      validDays: 90,
      enabledTiers: [50, 100],
    });
    const product = await prisma.voucherProduct.findUnique({
      where: { id: p.id },
      select: { rulesSnapshot: true, type: true },
    });
    const snap = JSON.parse(product!.rulesSnapshot!);
    expect(snap.discountPercent).toBe(20);
    expect(snap.validDays).toBe(90);
    expect(snap.packKind).toBe("discount_voucher");
    expect(product!.type).toBe("voucher_sale");
  });

  test("门槛储值券：minSpendMultiplier 落库", async () => {
    const p = await createVoucherProduct(businessId, {
      name: "门槛券",
      packKind: "discount_voucher",
      discountPercent: 0,
      minSpendMultiplier: 10,
      enabledTiers: [10, 20],
    });
    const product = await prisma.voucherProduct.findUnique({
      where: { id: p.id },
      select: { rulesSnapshot: true },
    });
    const snap = JSON.parse(product!.rulesSnapshot!);
    expect(snap.minSpendMultiplier).toBe(10);
    expect(snap.discountPercent).toBe(0);
  });

  test("折扣券不带奖池（与抽奖券资金逻辑隔离）", async () => {
    const p = await createVoucherProduct(businessId, {
      name: "隔离检查",
      packKind: "discount_voucher",
      discountPercent: 10,
      enabledTiers: [10],
    });
    const product = await prisma.voucherProduct.findUnique({
      where: { id: p.id },
      select: { rulesSnapshot: true },
    });
    const snap = JSON.parse(product!.rulesSnapshot!);
    expect(snap.prizePackId).toBe("none");
    expect(snap.exclusiveFeeTotalPercent).toBeNull();
    expect(snap.instantPoolRatio).toBe(0);
  });
});

describe("系统发放的券不可手动创建", () => {
  // 守卫在 /api/business/products 的 SYSTEM_ISSUED_KINDS；
  // 这里锁住不变量：这些 packKind 不属于任何可创建目录
  const SYSTEM_ISSUED = ["cashback", "prize", "cashback_credit"];

  test("cashback / prize 不在可创建 packKind 中", async () => {
    const { BASE_CATALOG_PACKS } = await import("@/lib/store-defaults");
    for (const k of SYSTEM_ISSUED) {
      expect(BASE_CATALOG_PACKS).not.toContain(k);
    }
  });
});

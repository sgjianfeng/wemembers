/**
 * 折扣券统一模版：折扣率参数化（0 = 原价代金）
 *
 * 「原价代金券」与「9 折卡」本是同一模版的两个参数值。
 * 旧的 face_open / discount_10 保留为向后兼容别名——存量商品的 rulesSnapshot
 * 已固化这两个 packKind，且业务 UI 有 12 处在匹配，不做破坏性重命名。
 */
import { describe, test, expect } from "@jest/globals";
import {
  buildDiscountVoucherSnapshot,
  buildFaceOpenSnapshot,
  buildDiscount10Snapshot,
  buildFaceThresholdSnapshot,
  clampDiscountPercent,
  isBaseCatalogPack,
  BASE_CATALOG_PACKS,
  DISCOUNT_VOUCHER_PERCENT_MAX,
  DISCOUNT_CARD_PERCENT,
} from "@/lib/store-defaults";

describe("buildDiscountVoucherSnapshot", () => {
  test("折扣率 0 = 原价代金（付 100 得 100）", () => {
    const s = buildDiscountVoucherSnapshot(0);
    expect(s.discountPercent).toBe(0);
    expect(s.packKind).toBe("discount_voucher");
    expect(s.campaignType).toBe("voucher_sale");
  });

  test("折扣率 10 = 9 折卡（付 90 得 100）", () => {
    expect(buildDiscountVoucherSnapshot(10).discountPercent).toBe(10);
  });

  test("折扣率 20 = 8 折卡——商家现在能自定义任意折扣", () => {
    expect(buildDiscountVoucherSnapshot(20).discountPercent).toBe(20);
    expect(buildDiscountVoucherSnapshot(5).discountPercent).toBe(5);
  });

  test("折扣率越界被夹住（防误配成负数或 90%）", () => {
    expect(clampDiscountPercent(-5)).toBe(0);
    expect(clampDiscountPercent(90)).toBe(DISCOUNT_VOUCHER_PERCENT_MAX);
    expect(clampDiscountPercent("abc")).toBe(0);
    expect(buildDiscountVoucherSnapshot(999).discountPercent).toBe(
      DISCOUNT_VOUCHER_PERCENT_MAX
    );
  });

  test("档位排序且可自定义", () => {
    const s = buildDiscountVoucherSnapshot(10, [200, 10, 50]);
    expect(s.enabledTiers).toEqual([10, 50, 200]);
  });

  test("不带奖池、不带卖券佣金（折扣券与抽奖资金逻辑隔离）", () => {
    const s = buildDiscountVoucherSnapshot(10);
    expect(s.prizePackId).toBe("none");
    expect(s.instantPoolRatio).toBe(0);
    expect(s.grandPoolRatio).toBe(0);
    expect(s.sellerCommissionPercent).toBe(0);
    expect(s.exclusiveFeeTotalPercent).toBeNull();
  });
});

describe("向后兼容：旧 builder 是薄包装，行为不变", () => {
  test("buildFaceOpenSnapshot 仍产出 face_open + 折扣 0", () => {
    const s = buildFaceOpenSnapshot();
    expect(s.packKind).toBe("face_open");
    expect(s.discountPercent).toBe(0);
  });

  test("buildDiscount10Snapshot 仍产出 discount_10 + 折扣 10", () => {
    const s = buildDiscount10Snapshot();
    expect(s.packKind).toBe("discount_10");
    expect(s.discountPercent).toBe(DISCOUNT_CARD_PERCENT);
  });

  test("门槛券 = 折扣券 + minSpendMultiplier，不是满减券", () => {
    const s = buildFaceThresholdSnapshot();
    expect(s.packKind).toBe("face_threshold");
    expect(s.minSpendMultiplier).toBeGreaterThan(0);
    // 仍是储值券（有面额档位），与 Coupon 的满减券是两套模型
    expect(s.campaignType).toBe("voucher_sale");
  });

  test("两个旧 builder 与统一 builder 只差 packKind", () => {
    const legacy = buildDiscount10Snapshot([10, 20]);
    const unified = buildDiscountVoucherSnapshot(10, [10, 20]);
    const strip = (o: Record<string, unknown>) => {
      const rest = { ...o };
      delete rest.packKind;
      delete rest.snapshottedAt;
      return rest;
    };
    expect(strip(legacy)).toEqual(strip(unified));
  });
});

describe("长期券归类接受统一模版", () => {
  test("discount_voucher 属于门店基础券", () => {
    expect(isBaseCatalogPack("discount_voucher")).toBe(true);
    expect(BASE_CATALOG_PACKS).toContain("discount_voucher");
  });
  test("旧值仍然属于", () => {
    expect(isBaseCatalogPack("face_open")).toBe(true);
    expect(isBaseCatalogPack("discount_10")).toBe(true);
    expect(isBaseCatalogPack("face_threshold")).toBe(true);
  });
  test("抽奖券不属于（资金逻辑不同，禁止混入）", () => {
    expect(isBaseCatalogPack("exclusive_ballot")).toBe(false);
  });
});

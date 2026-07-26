import {
  normalizeExclusiveFeeConfig,
  splitExclusiveSaleFees,
  FEE_PLATFORM_PERCENT,
} from "@/lib/activity-fees";
import {
  normalizeBusinessTemplateInput,
  buildSnapshotFromBusinessTemplate,
} from "@/lib/business-templates";

describe("business template copy rules", () => {
  it("self-use copy allows discount within range", () => {
    // discount 5 should throw - min 8
    expect(() =>
      normalizeBusinessTemplateInput({
        baseTemplateId: "self_use_voucher",
        name: "bad",
        discountPercent: 5,
      })
    ).toThrow("DISCOUNT_OUT_OF_RANGE");

    const ok = normalizeBusinessTemplateInput({
      baseTemplateId: "self_use_voucher",
      name: "我的九折",
      discountPercent: 10,
    });
    expect(ok.discountPercent).toBe(10);
    expect(ok.exclusiveTotalPercent).toBeNull();
  });

  it("exclusive custom: platform always 2, small+2+grand=total", () => {
    const cfg = normalizeExclusiveFeeConfig({
      totalPercent: 12,
      smallPrizePercent: 4,
      grandPoolPercent: 6,
    });
    expect(cfg.platformFeePercent).toBe(2);
    expect(cfg.totalPercent).toBe(12);
    expect(cfg.plan).toBe("exclusive_custom");

    const split = splitExclusiveSaleFees(10000, cfg);
    expect(split.platformFeeCents).toBe(200);
    expect(split.smallPrizeCents).toBe(400);
    expect(split.grandPoolCents).toBe(600);
    expect(split.totalCents).toBe(1200);
  });

  it("exclusive mismatch throws or auto-fills grand from total+small", () => {
    const cfg = normalizeExclusiveFeeConfig({
      totalPercent: 15,
      smallPrizePercent: 5,
      // grand omitted → 15 - 2 - 5 = 8
    });
    expect(cfg.grandPoolPercent).toBe(8);
    expect(cfg.platformFeePercent).toBe(FEE_PLATFORM_PERCENT);
  });

  it("buildSnapshotFromBusinessTemplate embeds custom fees", () => {
    const snap = buildSnapshotFromBusinessTemplate({
      baseTemplateId: "exclusive_draw_15",
      discountPercent: null,
      exclusiveTotalPercent: 12,
      exclusiveSmallPrizePercent: 4,
      exclusivePlatformFeePercent: 2,
      exclusiveGrandPoolPercent: 6,
      enabledTiers: JSON.stringify([50, 100, 200]),
    });
    expect(snap.exclusiveFeeTotalPercent).toBe(12);
    expect(snap.exclusiveSmallPrizePercent).toBe(4);
    expect(snap.exclusivePlatformFeePercent).toBe(2);
    expect(snap.exclusiveGrandPoolPercent).toBe(6);
    expect(snap.productKind).toBe("self_use");
  });

  it("preset 15 and 10 stay labeled", () => {
    expect(
      normalizeExclusiveFeeConfig({
        totalPercent: 15,
        smallPrizePercent: 3,
        grandPoolPercent: 10,
      }).plan
    ).toBe("exclusive_15");
    expect(
      normalizeExclusiveFeeConfig({
        totalPercent: 10,
        smallPrizePercent: 3,
        grandPoolPercent: 5,
      }).plan
    ).toBe("exclusive_10");
  });
});

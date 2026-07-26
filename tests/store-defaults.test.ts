import {
  ballotGrandContributionCents,
  companyGiftForStoreCount,
  DEFAULT_STORE_GIFT_CENTS,
  FACE_VOUCHER_MIN_SPEND_MULTIPLIER,
  minSpendCentsFromFace,
  buildFaceOpenSnapshot,
  buildFaceThresholdSnapshot,
  buildExclusiveBallotSnapshot,
} from "@/lib/store-defaults";

describe("store default pack rules", () => {
  it("gift is S$100 per store", () => {
    expect(DEFAULT_STORE_GIFT_CENTS).toBe(10000);
    expect(companyGiftForStoreCount(1)).toBe(10000);
    expect(companyGiftForStoreCount(3)).toBe(30000);
  });

  it("A2 min spend = face × 10", () => {
    expect(FACE_VOUCHER_MIN_SPEND_MULTIPLIER).toBe(10);
    expect(minSpendCentsFromFace(1000, 10)).toBe(10000); // S$10 → S$100
    expect(minSpendCentsFromFace(2000, 10)).toBe(20000);
    expect(minSpendCentsFromFace(1000, 0)).toBe(0);
  });

  it("ballot grand contribution is 10% of paid face", () => {
    expect(ballotGrandContributionCents(10000)).toBe(1000); // S$100 → S$10
    expect(ballotGrandContributionCents(5000)).toBe(500);
  });

  it("snapshots encode pack kinds", () => {
    const open = buildFaceOpenSnapshot();
    expect(open.discountPercent).toBe(0);
    expect(open.minSpendMultiplier).toBe(0);
    expect(open.packKind).toBe("face_open");

    const th = buildFaceThresholdSnapshot();
    expect(th.minSpendMultiplier).toBe(10);
    expect(th.packKind).toBe("face_threshold");

    const ex = buildExclusiveBallotSnapshot();
    expect(ex.exclusiveFeeTotalPercent).toBe(15);
    expect(ex.exclusiveGrandPoolPercent).toBe(10);
    expect(ex.enabledTiers).toEqual([50, 100]);
    expect(ex.ballotEnabled).toBe(true);
  });
});

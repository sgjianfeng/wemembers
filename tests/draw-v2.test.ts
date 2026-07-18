/**
 * Unit tests for V2 Draw Algorithm Library (draw-v2.ts)
 */
import { describe, test, expect } from "@jest/globals";
import {
  drawInstantV2,
  calculateTierWeight,
  resolveTier,
  estimatePoolCountdown,
  allocatePrizePools,
  allocateDeferredToPrizes,
  splitPoolFunding,
  W_BALANCE,
  SMALL_POOL_RATIO,
  DEFAULT_VOUCHER_TIERS,
  FIXED_VOUCHER_AMOUNTS,
  GRAND_PRIZE_TARGETS,
} from "@/lib/draw-v2";

describe("drawInstantV2", () => {
  test("returns a prize (100% win rate)", () => {
    const tier = DEFAULT_VOUCHER_TIERS[0];
    const result = drawInstantV2(tier, 50000);
    expect(result.won).toBe(true);
    expect(result.prize).toBeDefined();
  });

  test("respects instantPrizeCap for entry tier (S$8)", () => {
    const tier = DEFAULT_VOUCHER_TIERS[0]; // S$50 / cap 8
    for (let i = 0; i < 50; i++) {
      const r = drawInstantV2(tier, 50000);
      expect(r.prize.valueCents).toBeLessThanOrEqual(800);
    }
  });

  test("S$200 tier can hit higher prizes than S$50", () => {
    const large = DEFAULT_VOUCHER_TIERS[2];
    expect(large.instantPrizeCap).toBe(40);
    let sawHigh = false;
    for (let i = 0; i < 200; i++) {
      const r = drawInstantV2(large, 50000);
      expect(r.prize.valueCents).toBeLessThanOrEqual(4000);
      if (r.prize.valueCents > 800) sawHigh = true;
    }
    expect(sawHigh).toBe(true);
  });
});

describe("calculateTierWeight (w_balance=0.2, redeem primary)", () => {
  test("all three tiers enter grand pool (no zero-weight small)", () => {
    // S$50 holding only
    expect(calculateTierWeight(5000, "small", 5000, 0, 0)).toBe(Math.round(5000 * W_BALANCE));
    // S$50 full redeem → 1×
    expect(calculateTierWeight(5000, "small", 0, 0, 5000)).toBe(5000);
  });

  test("holding only: balance × 0.2", () => {
    expect(calculateTierWeight(10000, "medium", 10000, 0, 0)).toBe(Math.round(10000 * W_BALANCE));
    expect(calculateTierWeight(20000, "large", 20000, 0, 0)).toBe(Math.round(20000 * W_BALANCE));
  });

  test("full redeem: small 1×, medium 2×, large 3×", () => {
    expect(calculateTierWeight(5000, "small", 0, 0, 5000)).toBe(5000);
    expect(calculateTierWeight(10000, "medium", 0, 0, 10000)).toBe(20000);
    expect(calculateTierWeight(20000, "large", 0, 0, 20000)).toBe(60000);
  });

  test("mixed balance + redeem", () => {
    // medium used 3000 + balance 2000 → 2*3000 + 0.2*2000 = 6400
    expect(calculateTierWeight(10000, "medium", 2000, 0, 3000)).toBe(6400);
  });

  test("share boosts add face × n", () => {
    expect(calculateTierWeight(5000, "small", 0, 1, 5000)).toBe(5000 + 5000);
    expect(calculateTierWeight(20000, "large", 0, 1, 20000)).toBe(60000 + 20000);
  });

  test("withdrawn: zero balance zero used → 0", () => {
    expect(calculateTierWeight(20000, "large", 0, 0, 0)).toBe(0);
  });
});

describe("splitPoolFunding 20/80", () => {
  test("default small 20%", () => {
    const s = splitPoolFunding(1000);
    expect(s.smallCents).toBe(200);
    expect(s.grandCents).toBe(800);
    expect(SMALL_POOL_RATIO).toBe(20);
  });
});

describe("allocatePrizePools", () => {
  test("defaults to 20/80", () => {
    const r = allocatePrizePools(10_000);
    expect(r.instantRatio).toBe(20);
    expect(r.deferredRatio).toBe(80);
    expect(r.instantPoolCents).toBe(2000);
    expect(r.deferredPoolCents).toBe(8000);
  });
});

describe("allocateDeferredToPrizes", () => {
  test("splits by target", () => {
    const configs = allocateDeferredToPrizes(3000, [
      { id: "a", name: "奖A", icon: "🎁", targetCents: 1000 },
      { id: "b", name: "奖B", icon: "📱", targetCents: 2000 },
    ]);
    expect(configs.a.currentCents).toBe(1000);
    expect(configs.b.currentCents).toBe(2000);
  });
});

describe("estimatePoolCountdown", () => {
  test("custom labels work", () => {
    const results = estimatePoolCountdown(
      {
        store_gift: {
          targetCents: 100000,
          currentCents: 50000,
          displayName: "本店礼盒",
          icon: "🎁",
        },
      },
      10000
    );
    expect(results).toHaveLength(1);
    expect(results[0].daysPredicted).toBe(5);
  });
});

describe("constants", () => {
  test("FIXED_VOUCHER_AMOUNTS is 50/100/200", () => {
    expect(FIXED_VOUCHER_AMOUNTS).toEqual([50, 100, 200]);
    expect(DEFAULT_VOUCHER_TIERS).toHaveLength(3);
  });
  test("GRAND_PRIZE_TARGETS", () => {
    expect(GRAND_PRIZE_TARGETS.iPhone).toBeDefined();
  });
  test("resolveTier ladder", () => {
    expect(resolveTier(50)?.tier).toBe("small");
    expect(resolveTier(100)?.tier).toBe("medium");
    expect(resolveTier(200)?.tier).toBe("large");
    expect(resolveTier(20)).toBeNull();
  });
});

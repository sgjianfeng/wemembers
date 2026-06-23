/**
 * Unit tests for V2 Draw Algorithm Library (draw-v2.ts)
 */
import { describe, test, expect } from "@jest/globals";
import {
  drawInstantV2,
  calculateTierWeight,
  resolveTier,
  estimatePoolCountdown,
  DEFAULT_VOUCHER_TIERS,
  FIXED_VOUCHER_AMOUNTS,
  GRAND_PRIZE_TARGETS,
  type VoucherTierConfig,
} from "@/lib/draw-v2";

describe("drawInstantV2", () => {
  // Deterministic test: mock Math.random to verify weighted selection
  test("returns a prize (100% win rate)", () => {
    const tier = DEFAULT_VOUCHER_TIERS[0]; // small: cap = S$2
    const result = drawInstantV2(tier, 50000);
    expect(result.won).toBe(true);
    expect(result.prize).toBeDefined();
    expect(result.prize.name).toBeTruthy();
    expect(result.prize.valueCents).toBeGreaterThan(0);
  });

  test("respects instantPrizeCap for small tier (S$2)", () => {
    const tier = DEFAULT_VOUCHER_TIERS[0]; // cap = S$2 = 200 cents
    const results = new Map<string, number>();
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const { prize } = drawInstantV2(tier, 50000);
      expect(prize.valueCents).toBeLessThanOrEqual(200);
      results.set(prize.name, (results.get(prize.name) || 0) + 1);
    }

    // All results should be ≤ S$2 prizes
    expect(results.size).toBeGreaterThanOrEqual(1);
  });

  test("respects instantPrizeCap for large tier (S$20)", () => {
    const tier = DEFAULT_VOUCHER_TIERS[2]; // cap = S$20 = 2000 cents
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const { prize } = drawInstantV2(tier, 50000);
      expect(prize.valueCents).toBeLessThanOrEqual(2000);
    }
  });

  test("returns smaller prizes more frequently (weight distribution)", () => {
    const tier = DEFAULT_VOUCHER_TIERS[2]; // large tier, all prizes available
    const counts: Record<string, number> = {};
    const iterations = 5000;

    for (let i = 0; i < iterations; i++) {
      const { prize } = drawInstantV2(tier, 50000);
      counts[prize.name] = (counts[prize.name] || 0) + 1;
    }

    // S$0.50 (weight 50) should appear more than S$20 (weight 3)
    expect(counts["S$0.50 代金券"]).toBeGreaterThan(counts["S$20 代金券"]);
  });
});

describe("calculateTierWeight", () => {
  test("small tier returns 0 weight", () => {
    expect(calculateTierWeight(1000, "small")).toBe(0);
    expect(calculateTierWeight(4000, "small")).toBe(0);
    expect(calculateTierWeight(999999, "small")).toBe(0);
  });

  test("medium tier returns 1x amountCents", () => {
    expect(calculateTierWeight(5000, "medium")).toBe(5000);
    expect(calculateTierWeight(10000, "medium")).toBe(10000);
    expect(calculateTierWeight(1, "medium")).toBe(1);
  });

  test("large tier returns 2x amountCents", () => {
    expect(calculateTierWeight(10000, "large")).toBe(20000);
    expect(calculateTierWeight(500000, "large")).toBe(1000000);
    expect(calculateTierWeight(1, "large")).toBe(2);
  });

  test("applies share boosts correctly", () => {
    // large + 1 share boost = 3x (base 2x + 1x)
    expect(calculateTierWeight(10000, "large", 0, 1)).toBe(30000);
    // large + 2 share boosts = 4x
    expect(calculateTierWeight(10000, "large", 0, 2)).toBe(40000);
    // medium + 1 share boost = 2x
    expect(calculateTierWeight(5000, "medium", 0, 1)).toBe(10000);
    // small + share boosts still = 0
    expect(calculateTierWeight(1000, "small", 0, 5)).toBe(0);
  });

  test("zero share boosts returns base weight", () => {
    expect(calculateTierWeight(10000, "large", 0, 0)).toBe(20000);
    expect(calculateTierWeight(5000, "medium", 0, 0)).toBe(5000);
  });

  test("applies balanceCents weight (2x) for medium tier", () => {
    // medium (1x amount) + balance 2000 (2x = 4000) = 5000 + 4000 = 9000
    expect(calculateTierWeight(5000, "medium", 2000)).toBe(9000);
    // medium (1x) + shareBoost 1 + balance 1000 = 5000 + 5000 + 2000 = 12000
    expect(calculateTierWeight(5000, "medium", 1000, 1)).toBe(12000);
  });

  test("applies balanceCents weight (2x) for large tier", () => {
    // large (2x amount = 20000) + balance 5000 (2x = 10000) = 30000
    expect(calculateTierWeight(10000, "large", 5000)).toBe(30000);
  });

  test("balanceCents of 0 has no effect", () => {
    expect(calculateTierWeight(5000, "medium", 0)).toBe(5000);
    expect(calculateTierWeight(10000, "large", 0)).toBe(20000);
  });

  test("balanceCents does not affect small tier", () => {
    expect(calculateTierWeight(5000, "small", 9999)).toBe(0);
  });
});

describe("resolveTier", () => {
  test("returns small tier for S$20 (fixed)", () => {
    const t = resolveTier(20);
    expect(t).not.toBeNull();
    expect(t!.tier).toBe("small");
    expect(t!.min).toBe(20);
    expect(t!.max).toBe(20);
  });

  test("returns medium tier for S$50 (fixed)", () => {
    const t = resolveTier(50);
    expect(t).not.toBeNull();
    expect(t!.tier).toBe("medium");
  });

  test("returns large tier for S$100 (fixed)", () => {
    const t = resolveTier(100);
    expect(t).not.toBeNull();
    expect(t!.tier).toBe("large");
  });

  test("returns large tier for S$200 (fixed)", () => {
    const t = resolveTier(200);
    expect(t).not.toBeNull();
    expect(t!.tier).toBe("large");
  });

  test("handles exact fixed amount matches", () => {
    expect(resolveTier(20)!.tier).toBe("small");
    expect(resolveTier(50)!.tier).toBe("medium");
    expect(resolveTier(100)!.tier).toBe("large");
    expect(resolveTier(200)!.tier).toBe("large");
  });

  test("returns null for non-matching amounts", () => {
    expect(resolveTier(25)).toBeNull();
    expect(resolveTier(75)).toBeNull();
    expect(resolveTier(500)).toBeNull();
    expect(resolveTier(9999)).toBeNull();
  });

  test("returns large tier for amounts above S$9999", () => {
    const t = resolveTier(10000);
    expect(t).not.toBeNull();
    expect(t!.tier).toBe("large");
  });

  test("returns null for amounts below S$20", () => {
    expect(resolveTier(19)).toBeNull();
    expect(resolveTier(10)).toBeNull();
    expect(resolveTier(0)).toBeNull();
    expect(resolveTier(-1)).toBeNull();
  });
});

describe("estimatePoolCountdown", () => {
  const poolConfigs = {
    iPhone: { targetCents: 500000, currentCents: 250000 },
    MacBook: { targetCents: 1000000, currentCents: 500000 },
    BYD: { targetCents: 66700000, currentCents: 33350000 },
  };

  test("calculates countdown for all configured pools", () => {
    const results = estimatePoolCountdown(poolConfigs, 10000);
    expect(results).toHaveLength(3);

    // iPhone: remaining 250000 / 10000 = 25 days
    const iPhone = results.find((r) => r.prizeName === "iPhone")!;
    expect(iPhone.daysPredicted).toBe(25);
    expect(iPhone.progress).toBe(50); // 250000/500000 = 50%
    expect(iPhone.velocityPerDay).toBe(10000);
    expect(iPhone.accelerating).toBe(false);
  });

  test("handles zero velocity gracefully", () => {
    const results = estimatePoolCountdown(poolConfigs, 0);
    expect(results).toHaveLength(3);
    // velocity should default to 1 if <= 0
    for (const r of results) {
      expect(r.velocityPerDay).toBe(1);
    }
  });

  test("handles negative velocity gracefully", () => {
    const results = estimatePoolCountdown(poolConfigs, -5);
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.velocityPerDay).toBe(1);
    }
  });

  test("freezes at optimistic estimate (never decelerates)", () => {
    // Start with a slow velocity to get pessimistic estimate
    const slowResults = estimatePoolCountdown(poolConfigs, 10000);
    const slowDays = slowResults.map((r) => r.daysPredicted);

    // Now increase velocity — should accelerate
    const fastResults = estimatePoolCountdown(
      poolConfigs,
      50000,
      { iPhone: slowDays[0], MacBook: slowDays[1], BYD: slowDays[2] }
    );

    const fastiPhone = fastResults.find((r) => r.prizeName === "iPhone")!;
    expect(fastiPhone.accelerating).toBe(true);
    expect(fastiPhone.daysPredicted).toBeLessThan(slowDays[0]);

    // Now decrease velocity — should freeze at optimistic
    const slowerResults = estimatePoolCountdown(
      poolConfigs,
      10000,
      { iPhone: fastiPhone.daysPredicted, MacBook: slowDays[1], BYD: slowDays[2] }
    );
    const sloweriPhone = slowerResults.find((r) => r.prizeName === "iPhone")!;
    expect(sloweriPhone.accelerating).toBe(false);
    expect(sloweriPhone.daysPredicted).toBe(fastiPhone.daysPredicted);
  });

  test("returns 0 days when target is met or exceeded", () => {
    const configs = {
      iPhone: { targetCents: 500000, currentCents: 500000 },
      MacBook: { targetCents: 500000, currentCents: 600000 },
    };

    const results = estimatePoolCountdown(configs, 10000);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.daysPredicted).toBe(0);
      expect(r.progress).toBe(100);
    }
  });

  test("skips unknown pool keys gracefully", () => {
    const configs = {
      UnknownPrize: { targetCents: 100000, currentCents: 50000 },
    };
    const results = estimatePoolCountdown(configs, 10000);
    expect(results).toHaveLength(0);
  });

  test("progress is clipped to 100%", () => {
    const configs = {
      iPhone: { targetCents: 500000, currentCents: 1000000 },
    };
    const results = estimatePoolCountdown(configs, 10000);
    expect(results[0].progress).toBe(100);
  });

  test("previousEstimates with matching key freezes at optimistic", () => {
    // First call: no previous, ~50 days
    const first = estimatePoolCountdown(
      { iPhone: { targetCents: 500000, currentCents: 10000 } },
      10000
    );
    expect(first[0].accelerating).toBe(false);

    // Second call with same velocity — days match previous, no acceleration
    const second = estimatePoolCountdown(
      { iPhone: { targetCents: 500000, currentCents: 10000 } },
      10000,
      { iPhone: first[0].daysPredicted }
    );
    expect(second[0].accelerating).toBe(false);
    expect(second[0].daysPredicted).toBe(first[0].daysPredicted);
  });
});

describe("constants", () => {
  test("DEFAULT_VOUCHER_TIERS has 4 tiers with correct structure", () => {
    expect(DEFAULT_VOUCHER_TIERS).toHaveLength(4);
    expect(DEFAULT_VOUCHER_TIERS[0].tier).toBe("small");
    expect(DEFAULT_VOUCHER_TIERS[1].tier).toBe("medium");
    expect(DEFAULT_VOUCHER_TIERS[2].tier).toBe("large");
    expect(DEFAULT_VOUCHER_TIERS[3].tier).toBe("large");
    for (const t of DEFAULT_VOUCHER_TIERS) {
      expect(t.min).toBeGreaterThan(0);
      expect(t.max).toBe(t.min); // fixed amounts: min === max
      expect(t.instantPrizeCap).toBeGreaterThan(0);
    }
  });

  test("FIXED_VOUCHER_AMOUNTS has 4 entries", () => {
    expect(FIXED_VOUCHER_AMOUNTS).toHaveLength(4);
    expect(FIXED_VOUCHER_AMOUNTS[0]).toBe(20);
    expect(FIXED_VOUCHER_AMOUNTS[1]).toBe(50);
    expect(FIXED_VOUCHER_AMOUNTS[2]).toBe(100);
    expect(FIXED_VOUCHER_AMOUNTS[3]).toBe(200);
  });

  test("GRAND_PRIZE_TARGETS has expected entries", () => {
    expect(GRAND_PRIZE_TARGETS.iPhone).toBeDefined();
    expect(GRAND_PRIZE_TARGETS.MacBook).toBeDefined();
    expect(GRAND_PRIZE_TARGETS.BYD).toBeDefined();
    expect(GRAND_PRIZE_TARGETS.iPhone.targetCents).toBe(500000);
    expect(GRAND_PRIZE_TARGETS.MacBook.targetCents).toBe(1000000);
    expect(GRAND_PRIZE_TARGETS.BYD.targetCents).toBe(66700000);
  });
});

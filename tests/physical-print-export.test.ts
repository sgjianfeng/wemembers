import {
  estimateSplitPlan,
  resolveSafeParts,
  splitTicketsIntoParts,
  suggestSplitParts,
} from "../src/lib/physical-print-export";

describe("physical-print-export split-by-parts", () => {
  test("split evenly without cutting tickets", () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const parts = splitTicketsIntoParts(items, 3);
    expect(parts.map((p) => p.length)).toEqual([7, 7, 6]);
    expect(parts.flat()).toEqual(items);
  });

  test("suggest ~6 tickets per part", () => {
    expect(suggestSplitParts(3)).toBe(1);
    expect(suggestSplitParts(6)).toBe(1);
    expect(suggestSplitParts(12)).toBe(2);
    expect(suggestSplitParts(20)).toBe(4); // ceil(20/6)=4
  });

  test("estimate plan matches parts", () => {
    const plan = estimateSplitPlan({
      ticketCount: 20,
      parts: 4,
      ticketHeightMm: 60,
      dpi: 150,
    });
    expect(plan.parts).toBe(4);
    expect(plan.maxPerPart).toBe(5);
    expect(plan.minPerPart).toBe(5);
    expect(plan.approxHeightMm).toBeGreaterThan(60);
  });

  test("safe parts increases when canvas would overflow", () => {
    // huge ticket height → force 1 per part
    const safe = resolveSafeParts({
      ticketCount: 10,
      parts: 1,
      ticketHeightPx: 5000,
      gapPx: 100,
      marginPx: 20,
    });
    expect(safe.parts).toBeGreaterThan(1);
    expect(safe.maxOnPart).toBeLessThanOrEqual(2);
    expect(safe.partHeightPx).toBeLessThanOrEqual(8192);
  });
});

import { describe, test, expect } from "@jest/globals";
import { recommendFace } from "@/lib/recommend-face";

const TIERS = [50, 100, 200];

describe("recommendFace", () => {
  test("no balance: need face covering bill, prefer strict greater", () => {
    const r = recommendFace({ billSgd: 68, balanceSgd: 0, tiers: TIERS });
    expect(r.canCoverWithoutPurchase).toBe(false);
    expect(r.needSgd).toBe(68);
    expect(r.affordable).toEqual([100, 200]);
    expect(r.insufficient).toEqual([50]);
    expect(r.recommended).toBe(100);
    expect(r.recommendedStrictGreater).toBe(true);
  });

  test("partial balance reduces need", () => {
    const r = recommendFace({ billSgd: 68, balanceSgd: 40, tiers: TIERS });
    expect(r.needSgd).toBe(28);
    expect(r.affordable).toEqual([50, 100, 200]);
    expect(r.recommended).toBe(50);
  });

  test("balance already covers bill", () => {
    const r = recommendFace({ billSgd: 68, balanceSgd: 80, tiers: TIERS });
    expect(r.canCoverWithoutPurchase).toBe(true);
    expect(r.needSgd).toBe(0);
    expect(r.recommended).toBeNull();
  });

  test("exact face = bill still affordable; recommend next if available", () => {
    const r = recommendFace({ billSgd: 100, balanceSgd: 0, tiers: TIERS });
    expect(r.affordable).toEqual([100, 200]);
    // 优先 > bill
    expect(r.recommended).toBe(200);
    expect(r.recommendedStrictGreater).toBe(true);
  });

  test("only exact tier available", () => {
    const r = recommendFace({ billSgd: 100, balanceSgd: 0, tiers: [100] });
    expect(r.recommended).toBe(100);
    expect(r.recommendedStrictGreater).toBe(false);
  });

  test("bill just below 50", () => {
    const r = recommendFace({ billSgd: 48, balanceSgd: 0, tiers: TIERS });
    expect(r.recommended).toBe(50);
  });
});

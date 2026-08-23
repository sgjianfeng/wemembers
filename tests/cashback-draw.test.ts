/**
 * Phase 2：活动 2 抽奖（纯额度奖包 + 逐档解锁）
 */
import { describe, test, expect } from "@jest/globals";
import {
  calibrateBarbellPack,
  instantEvCents,
  shouldRequireThreshold,
  suggestedThresholdCents,
  drawCreditPrize,
  roundNiceCents,
  MIN_INSTANT_PRIZE_CENTS,
} from "@/lib/templates/cashback-prizes";
import {
  resolveGrandUnlock,
  defaultGrandTiers,
  splitInstalments,
  parseAwardedIds,
  drawInstantCredit,
} from "@/lib/cashback-draw";

describe("EV 标定", () => {
  test("公式：客单 × 抽奖% × 即时占比%", () => {
    // S$25 × 2% × 35% = S$0.175 → 18 分
    expect(instantEvCents({ avgTicketCents: 2500, drawPercent: 2, instantPoolRatio: 35 })).toBe(18);
    // S$200 × 2% × 35% = S$1.40
    expect(instantEvCents({ avgTicketCents: 20000, drawPercent: 2, instantPoolRatio: 35 })).toBe(140);
  });

  test("EV 可达时加权均值精确等于目标（商家不超发）", () => {
    for (const ev of [44, 70, 140, 350, 1000]) {
      const pack = calibrateBarbellPack(ev);
      expect(pack.feasible).toBe(true);
      expect(pack.actualEvCents).toBe(ev);
      expect(pack.overspendCents).toBe(0);
    }
  });

  test("EV 低于最小奖额时如实上报不可达，不静默超发", () => {
    // 「每笔必中」+「最小奖 S$0.20」两个约束下，EV 不可能低于 S$0.20
    const pack = calibrateBarbellPack(18);
    expect(pack.feasible).toBe(false);
    expect(pack.actualEvCents).toBe(MIN_INSTANT_PRIZE_CENTS);
    expect(pack.overspendCents).toBe(2);
    // 退化成单档，不给假的多档幻觉
    expect(pack.prizes).toHaveLength(1);
  });

  test("杠铃形状：基础档高频，尾部低频高额", () => {
    const pack = calibrateBarbellPack(140);
    const d = pack.distribution;
    expect(d[0].percent).toBeGreaterThan(70);
    expect(d[d.length - 1].percent).toBeLessThan(2);
    // 尾部面额远高于基础档
    expect(d[d.length - 1].valueCents).toBeGreaterThan(d[0].valueCents * 10);
  });

  test("概率之和为 100%", () => {
    const sum = calibrateBarbellPack(140).distribution.reduce((s, x) => s + x.percent, 0);
    expect(Math.abs(sum - 100)).toBeLessThan(0.5);
  });

  test("低客单必须启用累计门槛", () => {
    const coffee = { avgTicketCents: 800, drawPercent: 5, instantPoolRatio: 35 };
    expect(shouldRequireThreshold(instantEvCents(coffee))).toBe(true);
    const threshold = suggestedThresholdCents(coffee);
    expect(threshold).toBeGreaterThan(800);
    // 用门槛后 EV 达标
    const lifted = instantEvCents({ ...coffee, avgTicketCents: threshold });
    expect(shouldRequireThreshold(lifted)).toBe(false);
  });

  test("高客单不需要门槛", () => {
    expect(suggestedThresholdCents({ avgTicketCents: 20000, drawPercent: 2, instantPoolRatio: 35 })).toBe(0);
  });

  test("面额取整好看", () => {
    expect(roundNiceCents(17)).toBe(15);
    expect(roundNiceCents(123)).toBe(120);
    expect(roundNiceCents(1234)).toBe(1250);
    expect(roundNiceCents(12345)).toBe(12300);
  });
});

describe("即时开奖", () => {
  test("必中，且只开奖包内的档位", () => {
    const pack = calibrateBarbellPack(140);
    const ids = new Set(pack.prizes.map((p) => p.id));
    for (let i = 0; i < 500; i++) {
      const p = drawCreditPrize(pack.prizes);
      expect(ids.has(p.id)).toBe(true);
      expect(p.valueCents).toBeGreaterThan(0);
    }
  });

  test("大样本均值收敛到 EV（±12%）", () => {
    const pack = calibrateBarbellPack(140);
    let total = 0;
    const N = 40_000;
    for (let i = 0; i < N; i++) total += drawCreditPrize(pack.prizes).valueCents;
    const mean = total / N;
    expect(Math.abs(mean - 140) / 140).toBeLessThan(0.12);
  });

  test("rng 可注入 → 结果可复现", () => {
    const pack = calibrateBarbellPack(140);
    const always0 = () => 0;
    expect(drawCreditPrize(pack.prizes, always0).id).toBe(
      drawCreditPrize(pack.prizes, always0).id
    );
  });

  test("drawInstantCredit 透传不可达标志", () => {
    const bad = drawInstantCredit({ amountCents: 800, drawPercent: 5, instantPoolRatio: 35 });
    expect(bad.overspending).toBe(true);
    const ok = drawInstantCredit({ amountCents: 20000, drawPercent: 2, instantPoolRatio: 35 });
    expect(ok.overspending).toBe(false);
  });
});

describe("大奖逐档解锁", () => {
  const tiers = defaultGrandTiers(2500); // 客单 S$25

  test("面额挂客单价：10x / 30x / 100x", () => {
    expect(tiers.map((t) => t.valueCents)).toEqual([25_000, 75_000, 250_000]);
  });

  test("解锁目标 > 奖品价值（约 30% 兑付率，抽出后仍有余额养池）", () => {
    for (const t of tiers) {
      expect(t.targetCents).toBeGreaterThan(t.valueCents);
      expect(t.targetCents / t.valueCents).toBeCloseTo(1 / 0.3, 0);
    }
  });

  test("进度条指向下一个未发放档位", () => {
    const u = resolveGrandUnlock({ grandPoolCents: 40_000, tiers, awardedIds: [] });
    expect(u.nextTier?.id).toBe("grand_10x");
    expect(u.unlocked).toBeNull();
    expect(u.progressPercent).toBe(48); // 40000 / 83300
  });

  test("达标即可发放", () => {
    const u = resolveGrandUnlock({ grandPoolCents: 90_000, tiers, awardedIds: [] });
    expect(u.unlocked?.id).toBe("grand_10x");
  });

  test("跨越多档不越级：仍只解锁下一档", () => {
    // 池子 S$9000 已超过全部三档目标
    const u = resolveGrandUnlock({ grandPoolCents: 900_000, tiers, awardedIds: [] });
    expect(u.unlocked?.id).toBe("grand_10x"); // 不是 grand_100x
  });

  test("已发放的档位跳过", () => {
    const u = resolveGrandUnlock({
      grandPoolCents: 900_000, tiers, awardedIds: ["grand_10x"],
    });
    expect(u.nextTier?.id).toBe("grand_30x");
    expect(u.unlocked?.id).toBe("grand_30x");
  });

  test("全部发完", () => {
    const u = resolveGrandUnlock({
      grandPoolCents: 900_000, tiers,
      awardedIds: tiers.map((t) => t.id),
    });
    expect(u.nextTier).toBeNull();
    expect(u.progressPercent).toBe(100);
  });

  test("parseAwardedIds 容错", () => {
    expect(parseAwardedIds(null)).toEqual([]);
    expect(parseAwardedIds("{oops")).toEqual([]);
    expect(parseAwardedIds('["a","b"]')).toEqual(["a", "b"]);
  });
});

describe("大奖分期", () => {
  test("12 期均分，总额守恒", () => {
    const parts = splitInstalments(240_000, 12);
    expect(parts).toHaveLength(12);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(240_000);
    expect(parts[0]).toBe(20_000);
  });

  test("除不尽时余数落最后一张", () => {
    const parts = splitInstalments(1000, 3);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts[2]).toBe(1000 - 333 * 2);
  });

  test("1 期 = 一次性一张", () => {
    expect(splitInstalments(5000, 1)).toEqual([5000]);
  });
});

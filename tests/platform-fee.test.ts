/**
 * 平台费：阶梯边际计费 + 月保底 + 促销减免
 */
import { describe, test, expect } from "@jest/globals";
import {
  marginalPlatformFee,
  marginalPlatformFeeDetailed,
  monthlyMinimumTopUp,
  gmvToReachMinimum,
  PLATFORM_MIN_MONTHLY_CENTS,
} from "@/lib/platform-fee";
import { quotePlatformFee, quoteMonthlyMinimum } from "@/lib/platform-fee-policy";

describe("marginalPlatformFee · 阶梯边际计费", () => {
  test("首档内：1%", () => {
    expect(marginalPlatformFee(0, 10_000)).toBe(100); // S$100 → S$1
    expect(marginalPlatformFee(1_000_000, 10_000)).toBe(100);
  });

  test("第二档内：0.7%", () => {
    expect(marginalPlatformFee(5_000_000, 10_000)).toBe(70);
  });

  test("第三档内：0.5%", () => {
    expect(marginalPlatformFee(20_000_000, 10_000)).toBe(50);
  });

  test("跨档必须分段，不能用单一费率", () => {
    // 当月已 S$29,900，本笔 S$200 → S$100 落首档(1%) + S$100 落二档(0.7%)
    const d = marginalPlatformFeeDetailed(2_990_000, 20_000);
    expect(d.segments).toHaveLength(2);
    expect(d.segments[0]).toEqual({ percent: 1, amountCents: 10_000, feeCents: 100 });
    expect(d.segments[1]).toEqual({ percent: 0.7, amountCents: 10_000, feeCents: 70 });
    expect(d.feeCents).toBe(170);
    // 若错误地用单一档费率会得到 200(全1%) 或 140(全0.7%)
    expect(d.feeCents).not.toBe(200);
    expect(d.feeCents).not.toBe(140);
  });

  test("一笔跨三档", () => {
    const d = marginalPlatformFeeDetailed(2_900_000, 8_000_000);
    expect(d.segments.map((s) => s.percent)).toEqual([1, 0.7, 0.5]);
    // 100k@1% + 7,000k@0.7% + 900k@0.5%
    expect(d.feeCents).toBe(1_000 + 49_000 + 4_500);
  });

  test("正好卡在档位边界", () => {
    expect(marginalPlatformFee(2_999_999, 1)).toBe(0); // 向下取整
    expect(marginalPlatformFee(3_000_000, 100_000)).toBe(700); // 全落二档
  });

  test("零/负金额", () => {
    expect(marginalPlatformFee(0, 0)).toBe(0);
    expect(marginalPlatformFee(0, -100)).toBe(0);
  });
});

describe("月保底", () => {
  test("未达 S$88 时补齐", () => {
    expect(monthlyMinimumTopUp(0)).toBe(PLATFORM_MIN_MONTHLY_CENTS);
    expect(monthlyMinimumTopUp(3_000)).toBe(5_800);
  });
  test("已超 S$88 不补", () => {
    expect(monthlyMinimumTopUp(8_800)).toBe(0);
    expect(monthlyMinimumTopUp(50_000)).toBe(0);
  });
  test("达到保底所需流水（首档 1%）", () => {
    expect(gmvToReachMinimum()).toBe(880_000); // S$8,800
  });
});

describe("quotePlatformFee · 促销减免", () => {
  const base = { mtdGmvCents: 0, amountCents: 10_000 };

  test("无策略：应收 = 实收，减免 0", () => {
    const q = quotePlatformFee({ ...base, policy: null });
    expect(q.grossCents).toBe(100);
    expect(q.waivedCents).toBe(0);
    expect(q.netCents).toBe(100);
  });

  test("waive_all：应收仍记 100，减免 100，实收 0", () => {
    const q = quotePlatformFee({
      ...base,
      policy: {
        id: "p1", kind: "waive_all", percentOverride: null,
        waiveMinimum: true, endsAt: null, reason: "启动期",
      },
    });
    // 红线：应收不能记 0，否则算不出补贴成本
    expect(q.grossCents).toBe(100);
    expect(q.waivedCents).toBe(100);
    expect(q.netCents).toBe(0);
    expect(q.grossCents - q.waivedCents).toBe(q.netCents);
  });

  test("rate_override 0.5%：实收 50，减免 50", () => {
    const q = quotePlatformFee({
      ...base,
      policy: {
        id: "p2", kind: "rate_override", percentOverride: 0.5,
        waiveMinimum: false, endsAt: null, reason: "早鸟",
      },
    });
    expect(q.grossCents).toBe(100);
    expect(q.netCents).toBe(50);
    expect(q.waivedCents).toBe(50);
  });

  test("rate_override 高于标准费率时不加收", () => {
    const q = quotePlatformFee({
      ...base,
      policy: {
        id: "p3", kind: "rate_override", percentOverride: 5,
        waiveMinimum: false, endsAt: null, reason: "异常配置",
      },
    });
    expect(q.netCents).toBe(100); // 取 min，不会变成 500
    expect(q.waivedCents).toBe(0);
  });

  test("waive_minimum 不改单笔费率，只影响月末保底", () => {
    const policy = {
      id: "p4", kind: "waive_minimum" as const, percentOverride: null,
      waiveMinimum: true, endsAt: null, reason: "小商家友好",
    };
    const q = quotePlatformFee({ ...base, policy });
    expect(q.netCents).toBe(100);

    const m = quoteMonthlyMinimum({ chargedThisMonthCents: 1_000, policy });
    expect(m.waived).toBe(true);
    expect(m.topUpCents).toBe(0);
  });

  test("只免率不免保底 = 等于没免（回归保护）", () => {
    const policy = {
      id: "p5", kind: "rate_override" as const, percentOverride: 0,
      waiveMinimum: false, endsAt: null, reason: "只免率",
    };
    const q = quotePlatformFee({ ...base, policy });
    expect(q.netCents).toBe(0);
    // 但月末仍要补满 S$88 —— 这正是为什么 waiveMinimum 必须存在
    const m = quoteMonthlyMinimum({ chargedThisMonthCents: 0, policy });
    expect(m.waived).toBe(false);
    expect(m.topUpCents).toBe(PLATFORM_MIN_MONTHLY_CENTS);
  });
});

import {
  DEFAULT_ACTIVITY_SLOTS,
  categoryLabel,
  detectActivityCategory,
} from "@/lib/default-activities";

describe("default activities catalog", () => {
  it("has long-term, grand countdown, and NDP slots", () => {
    const cats = new Set(DEFAULT_ACTIVITY_SLOTS.map((s) => s.category));
    expect(cats.has("long_term")).toBe(true);
    expect(cats.has("grand_countdown")).toBe(true);
    expect(cats.has("ndp")).toBe(true);
    expect(DEFAULT_ACTIVITY_SLOTS.length).toBeGreaterThanOrEqual(4);
  });

  it("labels categories in zh", () => {
    expect(categoryLabel("long_term", "zh")).toContain("长期");
    expect(categoryLabel("grand_countdown", "zh")).toContain("大奖");
    expect(categoryLabel("ndp", "zh")).toContain("国庆");
  });

  it("detects category from campaign fields", () => {
    expect(
      detectActivityCategory({
        type: "holiday",
        name: "国庆满赠",
        tags: '["ndp"]',
      })
    ).toBe("ndp");
    expect(
      detectActivityCategory({
        type: "lucky_draw_v2",
        rulesSnapshot: JSON.stringify({ packKind: "exclusive_ballot" }),
      })
    ).toBe("grand_countdown");
    // 大奖活动 rules 里常挂 ndp 联动，不可误判为国庆
    expect(
      detectActivityCategory({
        type: "lucky_draw_v2",
        name: "大奖倒计时·品牌独享",
        packKind: "exclusive_ballot",
        rulesSnapshot: JSON.stringify({
          packKind: "exclusive_ballot",
          ndp: { enabled: true },
        }),
      })
    ).toBe("grand_countdown");
    expect(
      detectActivityCategory({
        type: "voucher_sale",
        rulesSnapshot: JSON.stringify({ packKind: "face_open" }),
      })
    ).toBe("long_term");
    expect(
      detectActivityCategory({
        type: "voucher_sale",
        packKind: "discount_10",
      })
    ).toBe("long_term");
  });
});

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
    expect(
      detectActivityCategory({
        type: "voucher_sale",
        rulesSnapshot: JSON.stringify({ packKind: "face_open" }),
      })
    ).toBe("long_term");
  });
});

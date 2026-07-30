import {
  buildCampaignPosterCopy,
  extractTierAmountsSgd,
  fillShareTemplate,
  formatSgdList,
  paidAfterDiscount,
} from "../src/lib/campaign-poster-copy";

describe("campaign-poster-copy", () => {
  test("formatSgdList and paidAfterDiscount", () => {
    expect(formatSgdList([10, 50, 100])).toBe("S$10 / S$50 / S$100");
    expect(paidAfterDiscount(10, 20)).toBe(8);
    expect(paidAfterDiscount(50, 10)).toBe(45);
  });

  test("extractTierAmounts from rules enabledTiers", () => {
    const rules = {
      templateId: "voucher_discount" as const,
      kind: "voucher_discount" as const,
      allowDiscount: true,
      discountPercent: 20,
      sellerCommissionPercent: 5,
      platformFeePercent: 1.5,
      prizePoolPercent: 0,
      shareSellingEnabled: true,
      campaignType: "voucher_sale",
      instantPoolRatio: 0,
      midPoolRatio: 0,
      grandPoolRatio: 0,
      enabledTiers: [10],
      prizePackId: "none" as const,
      snapshottedAt: new Date().toISOString(),
    };
    expect(extractTierAmountsSgd(null, rules)).toEqual([10]);
  });

  test("extractTierAmounts from voucherTiers JSON", () => {
    const json = JSON.stringify([
      { min: 50, max: 50, tier: "small", instantPrizeCap: 8 },
      { min: 100, max: 100, tier: "medium", instantPrizeCap: 20 },
      { min: 200, max: 200, tier: "large", instantPrizeCap: 40 },
    ]);
    expect(extractTierAmountsSgd(json, null)).toEqual([50, 100, 200]);
  });

  test("voucher single face with discount → benefit + share", () => {
    const rules = JSON.stringify({
      templateId: "voucher_discount",
      kind: "voucher_discount",
      allowDiscount: true,
      discountPercent: 20,
      sellerCommissionPercent: 5,
      platformFeePercent: 1.5,
      prizePoolPercent: 0,
      shareSellingEnabled: true,
      campaignType: "voucher_sale",
      instantPoolRatio: 0,
      midPoolRatio: 0,
      grandPoolRatio: 0,
      enabledTiers: [10],
      prizePackId: "none",
      snapshottedAt: "2026-01-01T00:00:00.000Z",
    });
    const copy = buildCampaignPosterCopy({
      type: "voucher_sale",
      name: "Meow BBQ S$10",
      endDate: "2026-08-30T00:00:00.000Z",
      rulesSnapshot: rules,
      lang: "zh",
    });
    expect(copy.isDraw).toBe(false);
    expect(copy.benefitLine).toContain("S$10");
    expect(copy.benefitLine).toContain("S$8");
    expect(copy.headline).toMatch(/扫码|代金/);
    expect(copy.shareTemplates.length).toBe(3);
    expect(fillShareTemplate(copy.shareTemplates[0], "https://x.test")).toContain(
      "https://x.test"
    );
  });

  test("draw tiers zh sell points", () => {
    const rules = JSON.stringify({
      templateId: "draw_standard",
      kind: "draw",
      allowDiscount: false,
      discountPercent: 0,
      sellerCommissionPercent: 5,
      platformFeePercent: 1.5,
      prizePoolPercent: 0,
      shareSellingEnabled: true,
      campaignType: "lucky_draw_v2",
      instantPoolRatio: 20,
      midPoolRatio: 0,
      grandPoolRatio: 80,
      enabledTiers: [50, 100, 200],
      prizePackId: "default_grand_v1",
      snapshottedAt: "2026-01-01T00:00:00.000Z",
    });
    const copy = buildCampaignPosterCopy({
      type: "lucky_draw_v2",
      name: "夏日抽奖",
      endDate: "2026-09-01T00:00:00.000Z",
      rulesSnapshot: rules,
      lang: "zh",
    });
    expect(copy.isDraw).toBe(true);
    expect(copy.benefitLine).toContain("S$50");
    expect(copy.benefitLine).toContain("200");
    expect(copy.headline).toMatch(/买就抽|有奖/);
    expect(copy.untilLine).toMatch(/活动至/);
  });

  test("custom subline overrides default sub", () => {
    const copy = buildCampaignPosterCopy({
      type: "voucher_sale",
      name: "Test",
      endDate: new Date("2026-12-01"),
      lang: "en",
      customSubline: "Only this weekend!",
    });
    expect(copy.sub).toBe("Only this weekend!");
  });

  test("en draw copy", () => {
    const copy = buildCampaignPosterCopy({
      type: "lucky_draw_v2",
      name: "Summer Draw",
      endDate: "2026-09-01",
      voucherTiers: JSON.stringify([
        { min: 50, max: 50, tier: "small", instantPrizeCap: 8 },
      ]),
      lang: "en",
    });
    expect(copy.isDraw).toBe(true);
    expect(copy.headline.toLowerCase()).toMatch(/buy|prize|win/);
    expect(copy.untilLine).toMatch(/Until/);
  });
});

describe("campaign-poster-export sizes", () => {
  // size helpers are pure — import dynamically to avoid DOM deps in node
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    posterCanvasSize,
    posterFilename,
    dataUrlToBase64,
  } = require("../src/lib/campaign-poster-export");

  test("canvas sizes", () => {
    expect(posterCanvasSize("sticker")).toEqual({ w: 1080, h: 1080 });
    expect(posterCanvasSize("poster").w).toBe(1080);
    expect(posterCanvasSize("tent").h).toBeGreaterThan(1000);
    // A4 ~150dpi
    expect(posterCanvasSize("a4")).toEqual({ w: 1240, h: 1754 });
  });

  test("filename sanitizes", () => {
    const f = posterFilename("Meow BBQ 夏日!", true, "tent", "小王");
    expect(f).toMatch(/\.png$/);
    expect(f).toContain("dist");
    expect(f).toContain("tent");
    expect(posterFilename("x", false, "a4")).toContain("a4");
  });

  test("dataUrlToBase64 strips prefix", () => {
    expect(dataUrlToBase64("data:image/png;base64,AAA")).toBe("AAA");
  });
});

describe("campaign-poster zip", () => {
  test("zipCampaignPosterFiles builds non-empty blob", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { zipCampaignPosterFiles } = require("../src/lib/campaign-poster-export");
    // 1x1 png base64
    const tiny =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const blob = await zipCampaignPosterFiles([
      { filename: "a-store-tent.png", dataUrl: tiny },
      { filename: "b-dist-tent.png", dataUrl: tiny },
    ]);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(40);
  });
});

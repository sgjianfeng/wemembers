import {
  buildCustomerActivityBundles,
  buildDiscoverActivityBundles,
  activityToneFromType,
  resolveCustomerDrawLinks,
} from "@/lib/activity-entitlements";

describe("activity-entitlements grouping", () => {
  it("groups gift coupon + draw under same campaign", () => {
    const bundles = buildCustomerActivityBundles({
      lang: "zh",
      claims: [
        {
          id: "c1",
          status: "available",
          campaignId: "camp1",
          campaignName: "国庆满赠",
          campaignType: "holiday",
          businessName: "Meow",
          title: "国庆赠送券 S$61",
          valueCents: 6100,
          validUntil: "2026-09-01T00:00:00.000Z",
        },
      ],
      draws: [
        {
          id: "d1",
          campaignId: "camp1",
          campaignName: "国庆满赠",
          businessName: "Meow",
          drawWeight: 400,
          shortCode: "ABC123",
          isGiftEntry: true,
          balanceCents: 0,
          amountCents: 10000,
        },
      ],
    });
    expect(bundles).toHaveLength(1);
    expect(bundles[0].tone).toBe("ndp");
    expect(bundles[0].entitlements.length).toBeGreaterThanOrEqual(2);
    expect(bundles[0].entitlements.some((e) => e.kind === "gift_coupon")).toBe(
      true
    );
    expect(bundles[0].entitlements.some((e) => e.kind === "draw_entry")).toBe(
      true
    );
  });

  it("detects ndp tone from name", () => {
    expect(activityToneFromType("promotion", "国庆满赠")).toBe("ndp");
    expect(activityToneFromType("lucky_draw_v2", "Summer")).toBe("draw");
  });

  it("ndp draw links go to /ndp and grand voucher countdown", () => {
    const links = resolveCustomerDrawLinks({
      campaignId: "c1",
      campaignSlug: "ndp-2uevq5-2026",
      campaignType: "holiday",
      campaignName: "国庆满赠 · 满120送61",
      rulesSnapshot: JSON.stringify({
        ndp: { enabled: true, buyVoucherSlug: "meow-bbq-exclusive-ballot-15" },
      }),
    });
    expect(links.activityHref).toBe("/ndp/ndp-2uevq5-2026");
    expect(links.countdownHref).toBe(
      "/voucher/meow-bbq-exclusive-ballot-15?view=draw#grand-countdown"
    );
  });

  it("exclusive draw links stay on voucher pool page", () => {
    const links = resolveCustomerDrawLinks({
      campaignId: "c2",
      campaignSlug: "meow-bbq-exclusive-ballot-15",
      campaignType: "lucky_draw_v2",
      campaignName: "大奖倒计时·品牌独享",
    });
    expect(links.activityHref).toBe("/voucher/meow-bbq-exclusive-ballot-15");
    expect(links.countdownHref).toBe(
      "/voucher/meow-bbq-exclusive-ballot-15?view=draw#grand-countdown"
    );
  });

  it("builds discover ads without entitlements", () => {
    const ads = buildDiscoverActivityBundles(
      [
        {
          id: "a1",
          name: "夏季促销",
          businessName: "Meow",
          type: "promotion",
          href: "/voucher/meow-summer",
          joined: false,
        },
      ],
      "zh"
    );
    expect(ads[0].entitlements).toHaveLength(0);
    expect(ads[0].href).toBe("/voucher/meow-summer");
    expect(ads[0].tone).toBe("default");
  });
});

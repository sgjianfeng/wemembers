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
          campaignName: "满赠",
          campaignType: "holiday",
          businessName: "Meow",
          title: "赠送券 S$61",
          valueCents: 6100,
          validUntil: "2026-09-01T00:00:00.000Z",
        },
      ],
      draws: [
        {
          id: "d1",
          campaignId: "camp1",
          campaignName: "满赠",
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
    expect(bundles[0].tone).toBe("spend_get");
    expect(bundles[0].entitlements.length).toBeGreaterThanOrEqual(2);
    expect(bundles[0].entitlements.some((e) => e.kind === "gift_coupon")).toBe(
      true
    );
    expect(bundles[0].entitlements.some((e) => e.kind === "draw_entry")).toBe(
      true
    );
  });

  it("detects spend-get tone from name", () => {
    expect(activityToneFromType("promotion", "满赠")).toBe("spend_get");
    expect(activityToneFromType("lucky_draw_v2", "Summer")).toBe("draw");
  });

  it("满赠链接指向 /spend-get，大奖倒计时指向购券活动", () => {
    const links = resolveCustomerDrawLinks({
      campaignId: "c1",
      campaignSlug: "spend-get-2uevq5",
      campaignType: "holiday",
      campaignName: "满赠 · 满120送61",
      rulesSnapshot: JSON.stringify({
        spendGet: { enabled: true, buyVoucherSlug: "meow-bbq-exclusive-ballot-15" },
      }),
    });
    expect(links.activityHref).toBe("/spend-get/spend-get-2uevq5");
    expect(links.countdownHref).toBe(
      "/voucher/meow-bbq-exclusive-ballot-15?view=draw#grand-countdown"
    );
  });

  it("存量活动的旧 ndp 键仍然读得出来", () => {
    const links = resolveCustomerDrawLinks({
      campaignId: "c1",
      campaignSlug: "ndp-2uevq5-2026",
      campaignType: "holiday",
      campaignName: "满赠 · 满120送61",
      rulesSnapshot: JSON.stringify({
        ndp: { enabled: true, buyVoucherSlug: "meow-bbq-exclusive-ballot-15" },
      }),
    });
    expect(links.activityHref).toBe("/spend-get/ndp-2uevq5-2026");
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

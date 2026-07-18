/**
 * Unit tests — campaign templates & purchase split math
 */
import {
  buildRulesSnapshot,
  computePurchaseSplit,
  getTemplate,
  listTemplates,
  legacyDrawSnapshot,
} from "@/lib/templates";

describe("campaign templates", () => {
  test("catalog has discount, draw, and share templates", () => {
    const ids = listTemplates().map((t) => t.id);
    expect(ids).toContain("voucher_discount");
    expect(ids).toContain("draw_standard");
    expect(ids).toContain("share_boost");
  });

  test("draw_standard is 梦想大奖池 with default_grand prize pack", () => {
    const tpl = getTemplate("draw_standard");
    expect(tpl?.nameZh).toBe("梦想大奖池");
    expect(tpl?.rules.prizePackId).toBe("default_grand_v1");

    const snap = buildRulesSnapshot({ templateId: "draw_standard" });
    expect(snap.allowDiscount).toBe(false);
    expect(snap.discountPercent).toBe(0);
    // Model A: no purchase-time pool skim
    expect(snap.prizePoolPercent).toBe(0);
    expect(snap.sellerCommissionPercent).toBe(5);
    expect(snap.campaignType).toBe("lucky_draw_v2");
    expect(snap.prizePackId).toBe("default_grand_v1");
    expect(snap.prizePack?.drawStyle).toBe("instant_plus_deferred_grand");
    expect(snap.prizePack?.grandPrizeIds).toEqual(
      expect.arrayContaining(["ipad", "iphone", "byd"])
    );
    expect(snap.prizePack?.requiresEscrowGrandIds).toContain("byd");
    expect(snap.grandPrizes?.map((p) => p.name)).toEqual(
      expect.arrayContaining(["iPad", "iPhone", "BYD 梦想座驾"])
    );
  });

  test("store can rename grand prizes; targets clamped; algorithm fields unchanged", () => {
    const snap = buildRulesSnapshot({
      templateId: "draw_standard",
      grandPrizes: [
        { id: "ipad", name: "本店礼盒", icon: "🎁", targetCents: 200_000 },
        { id: "iphone", name: "iPhone 17", icon: "📱", targetCents: 500_000 },
        { id: "byd", name: "员工旅游基金", icon: "🏆", targetCents: 50_000 },
      ],
    });
    expect(snap.prizePoolPercent).toBe(0);
    expect(snap.instantPoolRatio).toBe(20);
    expect(snap.midPoolRatio).toBe(0);
    expect(snap.grandPoolRatio).toBe(80);
    expect(snap.grandPrizes).toHaveLength(3);
    expect(snap.grandPrizes![0].name).toBe("本店礼盒");
    expect(snap.grandPrizes![0].targetCents).toBe(200_000);
    expect(snap.grandPrizes![2].name).toBe("员工旅游基金");
    // min clamp S$100
    const low = buildRulesSnapshot({
      templateId: "draw_standard",
      grandPrizes: [{ id: "x", name: "小奖", icon: "🎁", targetCents: 100 }],
    });
    expect(low.grandPrizes![0].targetCents).toBe(10_000);
  });

  test("voucher_discount clamps discount into range (≥8% above 6.5% fee floor)", () => {
    const low = buildRulesSnapshot({ templateId: "voucher_discount", discountPercent: 1 });
    expect(low.discountPercent).toBe(8);
    const atFloor = buildRulesSnapshot({ templateId: "voucher_discount", discountPercent: 7 });
    expect(atFloor.discountPercent).toBe(8);
    const high = buildRulesSnapshot({ templateId: "voucher_discount", discountPercent: 99 });
    expect(high.discountPercent).toBe(30);
    const mid = buildRulesSnapshot({ templateId: "voucher_discount", discountPercent: 15 });
    expect(mid.discountPercent).toBe(15);
    expect(mid.prizePoolPercent).toBe(0);
  });

  test("share_boost forces share selling on", () => {
    const snap = buildRulesSnapshot({
      templateId: "share_boost",
      shareSellingEnabled: false,
    });
    expect(snap.shareSellingEnabled).toBe(true);
    expect(snap.allowDiscount).toBe(true);
  });

  test("enabled tiers filter to allowed amounts", () => {
    const snap = buildRulesSnapshot({
      templateId: "draw_standard",
      enabledTiers: [100, 999, 50],
    });
    expect(snap.enabledTiers).toEqual([50, 100]);
  });

  test("default faces are 50/100/200 only", () => {
    const draw = buildRulesSnapshot({ templateId: "draw_standard" });
    expect(draw.enabledTiers).toEqual([50, 100, 200]);
    const disc = buildRulesSnapshot({
      templateId: "voucher_discount",
      discountPercent: 10,
      enabledTiers: [50, 200],
    });
    expect(disc.enabledTiers).toEqual([50, 200]);
    expect(disc.discountPercent).toBe(10);
  });
});

describe("computePurchaseSplit", () => {
  const drawSnap = buildRulesSnapshot({ templateId: "draw_standard" });
  const discountSnap = buildRulesSnapshot({
    templateId: "voucher_discount",
    discountPercent: 20,
  });

  test("draw full price: 5% seller + 1.5% platform + 0% purchase pool (model A)", () => {
    // face S$50 — pool is funded on redeem, not at purchase
    const s = computePurchaseSplit(5000, drawSnap, true);
    expect(s.paidCents).toBe(5000);
    expect(s.sellerCommissionCents).toBe(250); // 5%
    expect(s.platformFeeCents).toBe(75); // 1.5%
    expect(s.prizePoolCents).toBe(0);
    expect(s.redeemReserveCents).toBe(5000 - 250 - 75);
  });

  test("no seller → zero commission", () => {
    const s = computePurchaseSplit(5000, drawSnap, false);
    expect(s.sellerCommissionCents).toBe(0);
    expect(s.prizePoolCents).toBe(0);
    expect(s.platformFeeCents).toBe(75);
  });

  test("discount voucher: commission on paid not face", () => {
    // face 50, 20% off → paid 40; commission 5% of 40 = 2
    const s = computePurchaseSplit(5000, discountSnap, true);
    expect(s.paidCents).toBe(4000);
    expect(s.discountCents).toBe(1000);
    expect(s.sellerCommissionCents).toBe(200);
    expect(s.prizePoolCents).toBe(0);
    expect(s.platformFeeCents).toBe(60); // 1.5% of 4000
    expect(s.redeemReserveCents).toBe(4000 - 200 - 60);
  });

  test("legacy draw snapshot usable (purchase pool always 0)", () => {
    const legacy = legacyDrawSnapshot(20);
    const s = computePurchaseSplit(2000, legacy, true);
    expect(s.prizePoolCents).toBe(0);
    expect(legacy.prizePoolPercent).toBe(0);
    expect(getTemplate("draw_standard")).toBeDefined();
  });
});

import {
  buildRulesSnapshot,
  getTemplate,
  isExclusiveTemplateId,
  listTemplates,
  exclusivePlanFromSnapshot,
} from "@/lib/templates";
import { storeIdsAllows, serializeStoreIds, parseStoreIdsScope } from "@/lib/utils";

describe("default self-use & exclusive templates", () => {
  it("lists new templates", () => {
    const ids = listTemplates().map((t) => t.id);
    expect(ids).toContain("self_use_voucher");
    expect(ids).toContain("exclusive_draw_15");
    expect(ids).toContain("exclusive_draw_10");
  });

  it("self_use_voucher defaults 10/20/50/100/200 and 10% discount", () => {
    const snap = buildRulesSnapshot({ templateId: "self_use_voucher" });
    expect(snap.discountPercent).toBe(10);
    expect(snap.enabledTiers).toEqual([10, 20, 50, 100, 200]);
    expect(snap.productKind).toBe("self_use");
    expect(snap.exclusiveFeeTotalPercent).toBeNull();
  });

  it("exclusive_draw_15 uses 50/100/200 and fee 15", () => {
    const snap = buildRulesSnapshot({ templateId: "exclusive_draw_15" });
    expect(snap.enabledTiers).toEqual([50, 100, 200]);
    expect(snap.exclusiveFeeTotalPercent).toBe(15);
    expect(snap.productKind).toBe("self_use");
    expect(exclusivePlanFromSnapshot(snap)).toBe("exclusive_15");
  });

  it("exclusive_draw_10 uses fee 10", () => {
    const snap = buildRulesSnapshot({ templateId: "exclusive_draw_10" });
    expect(snap.exclusiveFeeTotalPercent).toBe(10);
    expect(exclusivePlanFromSnapshot(snap)).toBe("exclusive_10");
    expect(isExclusiveTemplateId("exclusive_draw_10")).toBe(true);
  });

  it("store opt-in: empty array means no store", () => {
    expect(parseStoreIdsScope("[]")).toEqual({ mode: "selected", ids: [] });
    expect(storeIdsAllows("[]", "store-a")).toBe(false);
    expect(storeIdsAllows(null, "store-a")).toBe(true); // legacy all
    expect(storeIdsAllows(serializeStoreIds(["store-a"]), "store-a")).toBe(true);
    expect(storeIdsAllows(serializeStoreIds(["store-a"]), "store-b")).toBe(false);
  });

  it("getTemplate returns exclusive meta", () => {
    const t = getTemplate("exclusive_draw_10");
    expect(t?.rules.exclusiveFeeTotalPercent).toBe(10);
    expect(t?.rules.defaultProductKind).toBe("self_use");
  });
});

import {
  computeEntitlementExpiry,
  computeNdpGiftExpiry,
  resolveRelativeDays,
  addDays,
} from "@/lib/validity";

describe("validity rules", () => {
  const obtain = new Date("2026-03-15T10:00:00.000Z");
  const activityEnd = new Date("2026-03-31T15:00:00.000Z");

  it("relative only: claim + days, activity end does not shorten", () => {
    const r = computeEntitlementExpiry({
      obtainedAt: obtain,
      entitlementValidDays: 30,
      activityEnd,
      dualProtection: false,
    });
    expect(r.truncatedByActivityEnd).toBe(false);
    expect(r.expiresAt.toISOString().slice(0, 10)).toBe(
      addDays(obtain, 30).toISOString().slice(0, 10)
    );
  });

  it("dual protection: earlier of relative vs activity end", () => {
    const r = computeEntitlementExpiry({
      obtainedAt: obtain,
      entitlementValidDays: 30,
      activityEnd,
      dualProtection: true,
    });
    expect(r.truncatedByActivityEnd).toBe(true);
    // 3/15+30 = 4/14, activity 3/31 → 3/31
    expect(r.expiresAt.getMonth()).toBe(2); // March
    expect(r.expiresAt.getDate()).toBe(31);
  });

  it("two relative rules take shorter", () => {
    const { days } = resolveRelativeDays(60, 30);
    expect(days).toBe(30);
  });

  it("NDP default: full month even near activity end", () => {
    const late = new Date("2026-03-30T12:00:00.000Z");
    const r = computeNdpGiftExpiry({
      obtainedAt: late,
      validDays: 30,
      activityEnd,
      dualProtection: false,
    });
    expect(r.truncatedByActivityEnd).toBe(false);
    expect(r.expiresAt.toISOString().slice(0, 10)).toBe(
      addDays(late, 30).toISOString().slice(0, 10)
    );
  });

  it("NDP dual on: late claim truncated to activity end", () => {
    const late = new Date("2026-03-30T12:00:00.000Z");
    const r = computeNdpGiftExpiry({
      obtainedAt: late,
      validDays: 30,
      activityEnd,
      dualProtection: true,
    });
    expect(r.truncatedByActivityEnd).toBe(true);
    expect(r.expiresAt.getDate()).toBe(31);
  });
});

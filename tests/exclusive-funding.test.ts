import { splitExclusiveSaleFees } from "@/lib/activity-fees";
import {
  EXCLUSIVE_GIFT_WEIGHT_FACTOR,
  exclusivePrizeFundingCents,
} from "@/lib/exclusive-fees";

describe("exclusive funding modes", () => {
  it("15% split unchanged", () => {
    const s = splitExclusiveSaleFees(10000);
    expect(s.totalCents).toBe(1500);
    expect(s.smallPrizeCents + s.platformFeeCents + s.grandPoolCents).toBe(
      1500
    );
  });

  it("10% prize funding is 3%+5% only (not platform 2%)", () => {
    const s = splitExclusiveSaleFees(10000, "exclusive_10");
    expect(exclusivePrizeFundingCents(s)).toBe(800);
    expect(s.platformFeeCents).toBe(200);
    expect(s.totalCents).toBe(1000);
  });

  it("gift weight factor is 0.2", () => {
    expect(EXCLUSIVE_GIFT_WEIGHT_FACTOR).toBe(0.2);
  });

  it("prize funding is 3%+10% only (not platform 2%)", () => {
    const s = splitExclusiveSaleFees(10000);
    expect(exclusivePrizeFundingCents(s)).toBe(1300);
    expect(s.platformFeeCents).toBe(200);
  });

  it("platform fee alone is the cash-sale minimum (no forced topup for prizes)", () => {
    const s = splitExclusiveSaleFees(10000);
    // gift S$300 can cover many 2% fees without self-topup
    expect(s.platformFeeCents).toBe(200);
    expect(s.platformFeeCents).toBeLessThan(s.totalCents);
  });
});

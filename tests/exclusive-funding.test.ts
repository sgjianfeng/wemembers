import { splitExclusiveSaleFees } from "@/lib/activity-fees";
import { EXCLUSIVE_GIFT_WEIGHT_FACTOR } from "@/lib/exclusive-fees";

describe("exclusive funding modes", () => {
  it("15% split unchanged", () => {
    const s = splitExclusiveSaleFees(10000);
    expect(s.totalCents).toBe(1500);
    expect(s.smallPrizeCents + s.platformFeeCents + s.grandPoolCents).toBe(
      1500
    );
  });

  it("gift weight factor is 0.2", () => {
    expect(EXCLUSIVE_GIFT_WEIGHT_FACTOR).toBe(0.2);
  });
});

import { customerProfileRow, maskedCustomerPhone, normalizeCustomerPhone } from "@/lib/nexuswork-customer-profile";

describe("nexuswork customer profile", () => {
  test("normalizes and masks phones without exposing the full value", () => {
    expect(normalizeCustomerPhone("+65 9123 4567")).toBe("91234567");
    expect(maskedCustomerPhone("+65 9123 4567")).toBe("4567****");
  });

  test("builds a stable weekly row with no name or raw phone", () => {
    const row = customerProfileRow("store-1", "2026-09-06", {
      phone: "+6591234567",
      firstVisit: new Date("2026-01-01T16:30:00Z"),
      lastVisit: new Date("2026-09-06T08:00:00Z"),
      totalSpentCents: 12345,
      balanceCents: 670,
    });
    expect(row).toMatchObject({ phone_masked: "4567****", first_visit: "2026-01-02", last_visit: "2026-09-06", total_spent: 123.45, balance: 6.7 });
    expect(JSON.stringify(row)).not.toContain("91234567");
    expect(row.externalKey).toMatch(/^wm-customer-2026-09-06-store-1-[a-f0-9]{20}$/);
  });
});

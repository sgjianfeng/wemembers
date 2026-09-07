import { createHash } from "node:crypto";

export type CustomerProfile = {
  phone: string;
  firstVisit: Date;
  lastVisit: Date;
  totalSpentCents: number;
  balanceCents: number;
};

export function normalizeCustomerPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("65") && digits.length === 10 ? digits.slice(2) : digits;
}

/** 只留下本地号码末四位；externalKey 使用摘要，不能反推出手机号。 */
export function maskedCustomerPhone(value: string): string {
  const digits = normalizeCustomerPhone(value);
  return `${digits.slice(-4).padStart(4, "*")}****`;
}

export function customerProfileRow(storeId: string, weekEnding: string, profile: CustomerProfile) {
  const phone = normalizeCustomerPhone(profile.phone);
  const digest = createHash("sha256").update(phone).digest("hex").slice(0, 20);
  return {
    externalKey: `wm-customer-${weekEnding}-${storeId}-${digest}`,
    phone_masked: maskedCustomerPhone(phone),
    first_visit: singaporeDate(profile.firstVisit),
    last_visit: singaporeDate(profile.lastVisit),
    total_spent: profile.totalSpentCents / 100,
    balance: profile.balanceCents / 100,
  };
}

export function singaporeDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(value);
}

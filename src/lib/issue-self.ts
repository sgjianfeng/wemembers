/**
 * 柜台发券：现金销售 vs 无支付（抵欠/福利等）
 */

export const ISSUE_REASONS = [
  {
    id: "cash_sale" as const,
    needsPay: true,
    zh: "现金销售（已收款）",
    en: "Cash sale (paid)",
    descZh: "顾客已付现金/店收 · 店员可操作",
    descEn: "Customer paid cash · staff ok",
  },
  {
    id: "supplier_debt" as const,
    needsPay: false,
    zh: "供应商抵欠",
    en: "Supplier debt offset",
    descZh: "用券冲应付 · 仅企业主 · 必填备注",
    descEn: "Offset AP · business only · note required",
  },
  {
    id: "staff_welfare" as const,
    needsPay: false,
    zh: "员工福利",
    en: "Staff welfare",
    descZh: "内部福利发券 · 仅企业主 · 必填备注",
    descEn: "Internal welfare · business only · note required",
  },
  {
    id: "marketing" as const,
    needsPay: false,
    zh: "营销赠送",
    en: "Marketing gift",
    descZh: "活动/补偿赠送 · 仅企业主 · 必填备注",
    descEn: "Promo/comp · business only · note required",
  },
  {
    id: "other_no_pay" as const,
    needsPay: false,
    zh: "其他无支付",
    en: "Other (no payment)",
    descZh: "其他抵账/赠送 · 仅企业主 · 必填备注",
    descEn: "Other no-pay · business only · note required",
  },
] as const;

export type IssueReasonId = (typeof ISSUE_REASONS)[number]["id"];

export function isIssueReasonId(v: string): v is IssueReasonId {
  return ISSUE_REASONS.some((r) => r.id === v);
}

export function issueReasonMeta(id: string | null | undefined) {
  return ISSUE_REASONS.find((r) => r.id === id) || null;
}

export function isNoPayReason(id: string | null | undefined): boolean {
  const m = issueReasonMeta(id);
  return !!m && !m.needsPay;
}

/** paymentMethod 落库值（便于旧报表） */
export function paymentMethodForReason(reason: IssueReasonId): string {
  if (reason === "cash_sale") return "cash";
  return reason; // supplier_debt | staff_welfare | marketing | other_no_pay
}

export function reasonLabel(
  id: string | null | undefined,
  lang: "zh" | "en"
): string {
  const m = issueReasonMeta(id || "");
  if (!m) return id || "—";
  return lang === "en" ? m.en : m.zh;
}

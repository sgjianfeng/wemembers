// 共享类型定义

export type Role = "admin" | "business" | "customer";
export type CouponType = "fixed_amount" | "percentage" | "free_item";
export type CouponStatus = "draft" | "published" | "paused" | "ended";
export type ClaimStatus = "available" | "used" | "expired" | "gifted";
export type Tier = "regular" | "silver" | "gold" | "platinum";

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  meta?: {
    cursor?: string;
    hasMore?: boolean;
  };
}

export interface TokenPackage {
  id: string;
  name: string;
  price: number;
  tokens: number;
  bonus: string;
  color: string;
  recommended?: boolean;
}

export const TOKEN_PACKAGES: TokenPackage[] = [
  { id: "trial", name: "体验包", price: 10, tokens: 1200, bonus: "20%", color: "slate" },
  { id: "basic", name: "基础包", price: 100, tokens: 15000, bonus: "50%", color: "blue", recommended: true },
  { id: "growth", name: "成长包", price: 500, tokens: 100000, bonus: "100%", color: "purple" },
  { id: "enterprise", name: "企业包", price: 2000, tokens: 500000, bonus: "150%", color: "amber" },
];

export const TOKEN_COSTS = {
  coupon_create: 10,
  sms_notify: 30,
  email_notify: 5,
  redeem_verify: 2,
  member_add: 5,
  export_report: 50,
} as const;

export const SIGNUP_BONUS = {
  business: 500,
  customer: 100,
} as const;

export const SERVICE_CATEGORIES = [
  { value: "cafe", label: "咖啡茶饮" },
  { value: "food", label: "餐饮美食" },
  { value: "retail", label: "零售百货" },
  { value: "beauty", label: "美容美发" },
  { value: "fitness", label: "健身运动" },
  { value: "entertainment", label: "休闲娱乐" },
  { value: "education", label: "教育培训" },
  { value: "other", label: "其他" },
] as const;

export const TIER_THRESHOLDS = {
  regular: { min: 0, label: "普通会员", color: "slate" },
  silver: { min: 500, label: "银卡会员", color: "slate" },
  gold: { min: 2000, label: "金卡会员", color: "amber" },
  platinum: { min: 10000, label: "铂金会员", color: "purple" },
} as const;

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

/** @deprecated 运营 Token 体系已下线；平台收入来自服务费。保留空结构避免旧 import 炸裂。 */
export interface TokenPackage {
  id: string;
  name: string;
  price: number;
  tokens: number;
  bonus: string;
  color: string;
  recommended?: boolean;
}

/** 已下线：不再售卖运营 Token 包 */
export const TOKEN_PACKAGES: TokenPackage[] = [];

/** 已下线：建券/核销等不再扣 Token，由平台服务费覆盖 */
export const TOKEN_COSTS = {
  coupon_create: 0,
  sms_notify: 0,
  email_notify: 0,
  redeem_verify: 0,
  member_add: 0,
  export_report: 0,
} as const;

/** 已下线：注册不再赠送运营 Token */
export const SIGNUP_BONUS = {
  business: 0,
  customer: 0,
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

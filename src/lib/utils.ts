import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateCode(length: number = 6): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join("");
}

export function generateQrCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 12 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("");
}

export function formatPoints(n: number): string {
  return n.toLocaleString("zh-CN");
}

export function formatMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * 规范化新加坡手机号为 E.164（+65XXXXXXXX）。
 * 接受：91251676 / 65 9125 1676 / +6591251676
 * 非 SG 格式原样返回（已带 + 的国际号）。
 */
export function normalizeSingaporePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    // +65xxxxxxxx
    if (digits.startsWith("+65") && digits.length === 11) return digits;
    return digits;
  }
  let d = digits.replace(/\D/g, "");
  if (d.startsWith("65") && d.length === 10) return `+${d}`;
  // SG 8 位手机（通常 8/9 开头）
  if (/^[89]\d{7}$/.test(d)) return `+65${d}`;
  return d ? (d.startsWith("65") ? `+${d}` : d) : raw.trim();
}

export function timeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString("zh-CN");
}

/**
 * 英文 URL 标识：仅 a-z 0-9 与连字符，用于 shop slug / 搜索 / 二维码。
 * 中文店名会去掉非 ASCII，不足时用 fallback。
 */
export function toEnglishSlug(input: string, fallback = "shop"): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || fallback;
}

/** 生成唯一感较强的英文 slug（带短随机后缀） */
export function makeBusinessSlug(name: string, email?: string | null): string {
  const fromName = toEnglishSlug(name, "");
  const fromEmail = email
    ? toEnglishSlug(email.split("@")[0] || "", "")
    : "";
  const base = fromName || fromEmail || "shop";
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`.slice(0, 48);
}

/** 校验用户自定义英文标识 */
export function isValidBusinessSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 2 && slug.length <= 48;
}

/**
 * 新加坡 UEN 宽松校验（新式 9–10 位 + 校验字母，或常见 9–10 位字母数字）。
 * 存库统一大写。
 */
export function normalizeUen(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function isValidSingaporeUen(raw: string): boolean {
  const u = normalizeUen(raw);
  // 新格式示例: 201912345A (4位年 + 5位序号 + 字母)
  if (/^[0-9]{9}[A-Z]$/.test(u)) return true;
  // 10 位变体
  if (/^[0-9]{10}[A-Z]$/.test(u)) return true;
  // 旧式 / 其他实体: 8–9 位数字 + 字母
  if (/^[0-9]{8,9}[A-Z]$/.test(u)) return true;
  // 部分实体以字母开头 (T / S / R 等)
  if (/^[A-Z][0-9]{2}[A-Z][0-9]{4}[A-Z]$/.test(u)) return true;
  return false;
}

/** 解析 JSON storeIds；null/空 = 全部门店适用 */
export function parseStoreIdsJson(raw: string | null | undefined): string[] | null {
  if (!raw || !raw.trim()) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    const ids = arr.filter((x): x is string => typeof x === "string" && x.length > 0);
    return ids.length ? ids : null;
  } catch {
    return null;
  }
}

export function storeIdsAllows(
  storeIdsJson: string | null | undefined,
  storeId: string | null | undefined
): boolean {
  if (!storeId) return true;
  const ids = parseStoreIdsJson(storeIdsJson);
  if (ids === null) return true; // 全部门店
  return ids.includes(storeId);
}

export function daysUntil(date: Date): number {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / 86400000);
}

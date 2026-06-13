import { v4 as uuidv4 } from "uuid";

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function generateCode(length: number = 6): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join("");
}

export function generateQrCode(): string {
  // 生成 12 位唯一核销码
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

export function daysUntil(date: Date): number {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / 86400000);
}

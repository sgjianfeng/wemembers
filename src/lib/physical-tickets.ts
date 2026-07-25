import { generateQrCode } from "@/lib/utils";
import { prisma } from "@/lib/db";

/**
 * 实体券规则：
 * - printed：库存，未售不可核销
 * - sold：现金/店收已记；集团门店可核（记 redeemedStoreId）
 * - claimed：已绑用户；可核（同步线上 CustomerCoupon）
 * - redeemed / void
 * - 查找永远按 code；不要求先「挂到核销店」
 * - 实体形态一次用完（非 Voucher V2 储值）
 * - 平台费：现金实体券默认 0
 */

/** 高熵实体码：PT- + 12 位可读字符（大写，与 normalize 一致） */
export function generatePhysicalCode(): string {
  return `PT-${generateQrCode()}`.toUpperCase();
}

export async function uniquePhysicalCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generatePhysicalCode();
    const exists = await prisma.physicalTicket.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  return `PT-${generateQrCode()}${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

export function normalizePhysicalCode(raw: string): string {
  let s = raw.trim();
  // URL .../c/PT-XXXX
  try {
    if (s.includes("://") || s.includes("/c/")) {
      const u = new URL(s, "https://local.invalid");
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.indexOf("c");
      if (idx >= 0 && parts[idx + 1]) s = parts[idx + 1];
      else s = parts[parts.length - 1] || s;
    }
  } catch {
    /* ignore */
  }
  if (s.includes("/")) {
    s = s.split("/").filter(Boolean).pop() || s;
  }
  return s.trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizePhoneLocal(raw: string): string {
  return raw.trim().replace(/\s+/g, "").replace(/^\+65/, "");
}

/** 可被顾客绑定 */
export function canClaimPhysicalStatus(status: string): boolean {
  return status === "printed" || status === "sold";
}

/** 可核销（代金）：已售或已绑，且未核销 */
export function canRedeemPhysicalVoucherStatus(status: string): boolean {
  return status === "sold" || status === "claimed";
}

export type PhysicalTicketPublic = {
  code: string;
  status: string;
  type: string;
  title: string;
  description: string | null;
  valueCents: number;
  storeName: string;
  storeId: string;
  businessName: string | null;
  validUntil: string | null;
  campaignId: string | null;
  canClaim: boolean;
  canRedeemUnbound: boolean;
};

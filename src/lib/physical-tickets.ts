import { generateQrCode } from "@/lib/utils";
import { prisma } from "@/lib/db";

/**
 * 实体券规则摘要（实现与决策对齐）：
 * - 未绑定 printed：代金可本店匿名一次核销；抽奖引导绑定
 * - 绑定 claimed：生成 CustomerCoupon / DrawTicket，之后按线上券处理
 * - 核销 redeemed：线上 used 与纸码同步，防双花
 * - 仅本店：ticket.storeId 必须 = 操作门店
 * - 实体形态一次用完（非 Voucher V2 储值）
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

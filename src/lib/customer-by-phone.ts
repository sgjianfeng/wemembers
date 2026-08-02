/**
 * 按手机号定位「顾客」账号（发券 / 满赠 / 转赠）
 *
 * 历史数据同一号码可能并存多种写法：
 *   企业  phone = "91251676"
 *   顾客  phone = "+6591251676"
 * phone 字段唯一，但字符串不同 → 两行都合法。
 * 发券时必须：先在所有变体里找 role=customer，绝不能因企业/店员占了本地号就报错。
 */
import type { Prisma } from "@prisma/client";
import { normalizeSingaporePhone } from "@/lib/utils";

type Tx = Prisma.TransactionClient | Prisma.DefaultPrismaClient;

/** 同一新加坡号的常见存储形态（E.164 / 本地 8 位 / 65 前缀） */
export function singaporePhoneVariants(raw: string): string[] {
  const trimmed = raw.trim().replace(/\s+/g, "");
  if (!trimmed) return [];
  const e164 = normalizeSingaporePhone(trimmed);
  const digits = e164.replace(/\D/g, "");
  const out = new Set<string>();
  if (trimmed) out.add(trimmed);
  if (e164) out.add(e164);
  if (digits) out.add(digits);
  if (digits.startsWith("65") && digits.length === 10) {
    out.add(digits.slice(2));
    out.add(`+${digits}`);
  }
  if (/^[89]\d{7}$/.test(digits)) {
    out.add(`+65${digits}`);
    out.add(`65${digits}`);
  }
  return [...out].filter(Boolean);
}

export function canonicalCustomerPhone(raw: string): string {
  const e164 = normalizeSingaporePhone(raw.trim());
  if (e164.startsWith("+65") && e164.length === 11) return e164;
  const digits = e164.replace(/\D/g, "");
  if (/^[89]\d{7}$/.test(digits)) return `+65${digits}`;
  if (digits.startsWith("65") && digits.length === 10) return `+${digits}`;
  return e164 || raw.trim();
}

/**
 * 查找或创建顾客。优先命中已有 customer（任意号码写法），
 * 新建时统一写成 E.164（+65…），避免与企业本地号撞唯一约束。
 */
export async function findOrCreateCustomerByPhone(
  tx: Tx,
  phoneRaw: string
): Promise<{ id: string; phone: string; created: boolean }> {
  const variants = singaporePhoneVariants(phoneRaw);
  const canonical = canonicalCustomerPhone(phoneRaw);
  if (!variants.length || canonical.replace(/\D/g, "").length < 8) {
    throw new Error("INVALID_PHONE");
  }

  // 1) 任意写法下的顾客账号（发券目标）
  const existingCustomer = await tx.user.findFirst({
    where: { role: "customer", phone: { in: variants } },
    select: { id: true, phone: true },
  });
  if (existingCustomer?.phone) {
    return {
      id: existingCustomer.id,
      phone: existingCustomer.phone,
      created: false,
    };
  }

  // 2) 规范 E.164 是否已被占用
  const e164Owner = await tx.user.findFirst({
    where: { phone: canonical },
    select: { id: true, role: true, phone: true },
  });
  if (e164Owner) {
    if (e164Owner.role === "customer" && e164Owner.phone) {
      return {
        id: e164Owner.id,
        phone: e164Owner.phone,
        created: false,
      };
    }
    // 该精确写法已是店员/企业 → 无法再挂同一 phone 字符串
    throw new Error("PHONE_NOT_CUSTOMER");
  }

  // 3) 新建顾客（E.164）。企业若只占了「91251676」本地号，此处 +6591251676 仍可建
  const created = await tx.user.create({
    data: {
      phone: canonical,
      role: "customer",
      displayName:
        canonical.length >= 4 ? `客户${canonical.slice(-4)}` : "顾客",
      status: "active",
    },
    select: { id: true, phone: true },
  });

  return {
    id: created.id,
    phone: created.phone || canonical,
    created: true,
  };
}

/**
 * Cashback 领取令牌：店员出码 · 顾客扫码
 *
 * 平台不经手支付，消费金额必须从某处来。三条路的取舍：
 * - 顾客扫固定码自填金额：店员零负担，但作弊风险高（填 S$800 实花 S$5）
 * - 店员后台录手机号 + 金额：可信，但要问手机号、要打字，负担重
 * - **店员出码 · 顾客扫码**：金额由店员填（可信），顾客扫码自助绑定（负担只有输一个数字）
 *
 * 令牌一次性、短时效、扫过即失效。
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type Tx = Prisma.TransactionClient | typeof prisma;

/** 令牌有效期（分钟） */
export const CLAIM_TOKEN_TTL_MINUTES = 10;

/** 无歧义字符集：去掉 0/O/1/I/L 等易混字符 */
const TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TOKEN_LENGTH = 10;

export function generateClaimTokenCandidate(): string {
  let out = "";
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    out += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  }
  return out;
}

export async function allocateClaimToken(
  db: Tx = prisma,
  maxAttempts = 12
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = generateClaimTokenCandidate();
    const exists = await db.cashbackClaimToken.findUnique({
      where: { token: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  throw new Error("TOKEN_ALLOCATION_FAILED");
}

export type ClaimTokenState =
  | "pending"
  | "claimed"
  | "expired"
  | "void"
  | "not_found";

export type LoadedClaimToken = {
  id: string;
  token: string;
  campaignId: string;
  businessId: string;
  storeId: string;
  staffUserId: string | null;
  amountCents: number;
  receiptNote: string | null;
  state: ClaimTokenState;
  expiresAt: Date;
  storeName: string | null;
  businessName: string | null;
  campaignName: string | null;
};

/** 读取令牌并判定状态（过期由时间推导，不依赖后台任务） */
export async function loadClaimToken(
  db: Tx,
  token: string,
  at: Date = new Date()
): Promise<LoadedClaimToken | null> {
  const row = await db.cashbackClaimToken.findUnique({
    where: { token: token.trim().toUpperCase() },
    include: {
      store: { select: { name: true } },
      business: { select: { businessName: true } },
      campaign: { select: { name: true } },
    },
  });
  if (!row) return null;

  let state: ClaimTokenState = row.status as ClaimTokenState;
  if (state === "pending" && row.expiresAt.getTime() <= at.getTime()) {
    state = "expired";
  }

  return {
    id: row.id,
    token: row.token,
    campaignId: row.campaignId,
    businessId: row.businessId,
    storeId: row.storeId,
    staffUserId: row.staffUserId,
    amountCents: row.amountCents,
    receiptNote: row.receiptNote,
    state,
    expiresAt: row.expiresAt,
    storeName: row.store?.name ?? null,
    businessName: row.business?.businessName ?? null,
    campaignName: row.campaign?.name ?? null,
  };
}

/**
 * 原子消费令牌：只有 pending → claimed 这一次转换会成功。
 * 用 updateMany + status 条件避免两个顾客同时扫同一个码重复领取。
 */
export async function consumeClaimToken(
  db: Tx,
  tokenId: string,
  args: { customerId: string; spendRecordId: string; at?: Date }
): Promise<boolean> {
  const now = args.at ?? new Date();
  const res = await db.cashbackClaimToken.updateMany({
    where: { id: tokenId, status: "pending", expiresAt: { gt: now } },
    data: {
      status: "claimed",
      claimedByCustomerId: args.customerId,
      spendRecordId: args.spendRecordId,
      claimedAt: now,
    },
  });
  return res.count === 1;
}

export function claimTokenExpiry(
  from: Date = new Date(),
  minutes: number = CLAIM_TOKEN_TTL_MINUTES
): Date {
  return new Date(from.getTime() + Math.max(1, minutes) * 60_000);
}

/** 顾客扫码落地页 */
export function claimTokenPath(token: string): string {
  return `/c/cashback/${encodeURIComponent(token)}`;
}

export function claimTokenErrorMessage(state: ClaimTokenState): string {
  const map: Record<ClaimTokenState, string> = {
    pending: "",
    claimed: "该二维码已被领取",
    expired: "二维码已过期，请让店员重新生成",
    void: "该二维码已作废",
    not_found: "二维码无效",
  };
  return map[state] || "二维码无效";
}

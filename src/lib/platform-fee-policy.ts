/**
 * 平台费促销减免
 *
 * `FEE_PLATFORM_PERCENT = 2` 是常量且 business-templates.ts 明确校验「不可改」，
 * 促销减免不能改常量，走 `PlatformFeePolicy` 按商家覆盖。
 *
 * 硬规则（见 plan §8.2）：
 * 1. 免率必须能同时免保底（只免率不免保底 = 等于没免）
 * 2. 免掉的部分归商家，不转奖池
 * 3. 减免记两笔账（应收 + 减免），净额 0，绝不记 0——否则永久失去补贴成本 / CAC 分析能力
 * 4. 到期自动恢复 + 提前通知，禁止静默恢复收费
 * 5. 仅 admin 可创建，reason + approvedByUserId 必填
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  marginalPlatformFee,
  monthlyMinimumTopUp,
  PLATFORM_MIN_MONTHLY_CENTS,
} from "@/lib/platform-fee";

type Tx = Prisma.TransactionClient | typeof prisma;

export type PolicyKind =
  | "waive_all"
  | "rate_override"
  | "waive_minimum"
  | "tier_shift";

export type ActivePolicy = {
  id: string;
  kind: PolicyKind;
  percentOverride: number | null;
  waiveMinimum: boolean;
  endsAt: Date | null;
  reason: string;
};

/** 到期前多少天开始提醒 */
export const POLICY_NOTICE_DAYS = [30, 7] as const;

/**
 * 取商家当前生效的促销策略。
 * 多条同时生效时取对商家最有利的一条（waive_all > 最低 percentOverride > waive_minimum）。
 */
export async function resolveActivePolicy(
  db: Tx,
  businessId: string,
  at: Date = new Date()
): Promise<ActivePolicy | null> {
  const rows = await db.platformFeePolicy.findMany({
    where: {
      businessId,
      status: "active",
      startsAt: { lte: at },
      OR: [{ endsAt: null }, { endsAt: { gte: at } }],
    },
    select: {
      id: true,
      kind: true,
      percentOverride: true,
      waiveMinimum: true,
      endsAt: true,
      reason: true,
    },
  });
  if (rows.length === 0) return null;

  const rank = (r: (typeof rows)[number]): number => {
    if (r.kind === "waive_all") return 0;
    if (r.kind === "rate_override") return 1;
    return 2;
  };
  rows.sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return (a.percentOverride ?? 999) - (b.percentOverride ?? 999);
  });

  const best = rows[0];
  return {
    id: best.id,
    kind: best.kind as PolicyKind,
    percentOverride: best.percentOverride,
    waiveMinimum: best.waiveMinimum,
    endsAt: best.endsAt,
    reason: best.reason,
  };
}

export type PlatformFeeQuote = {
  /** 应收（分）——无促销时的标准费用 */
  grossCents: number;
  /** 减免（分） */
  waivedCents: number;
  /** 实收（分）= gross - waived */
  netCents: number;
  policyId: string | null;
  policyKind: PolicyKind | null;
  policyEndsAt: Date | null;
};

/**
 * 单笔消费的平台费报价（含促销减免）。
 * 应收与减免都要返回——记账必须两笔，不能只记净额。
 */
export function quotePlatformFee(input: {
  mtdGmvCents: number;
  amountCents: number;
  policy: ActivePolicy | null;
}): PlatformFeeQuote {
  const gross = marginalPlatformFee(input.mtdGmvCents, input.amountCents);
  const policy = input.policy;

  if (!policy) {
    return {
      grossCents: gross,
      waivedCents: 0,
      netCents: gross,
      policyId: null,
      policyKind: null,
      policyEndsAt: null,
    };
  }

  let net = gross;
  if (policy.kind === "waive_all") {
    net = 0;
  } else if (policy.kind === "rate_override" && policy.percentOverride != null) {
    const pct = Math.max(0, policy.percentOverride);
    const overridden = Math.floor((Math.max(0, input.amountCents) * pct) / 100);
    net = Math.min(gross, overridden);
  }
  // waive_minimum / tier_shift 不改单笔费率，只影响月末保底

  const waived = Math.max(0, gross - net);
  return {
    grossCents: gross,
    waivedCents: waived,
    netCents: net,
    policyId: policy.id,
    policyKind: policy.kind,
    policyEndsAt: policy.endsAt,
  };
}

/** 月末保底：促销豁免保底时不补收 */
export function quoteMonthlyMinimum(input: {
  chargedThisMonthCents: number;
  policy: ActivePolicy | null;
}): { topUpCents: number; waived: boolean } {
  const p = input.policy;
  const waived = !!p && (p.waiveMinimum || p.kind === "waive_all");
  if (waived) return { topUpCents: 0, waived: true };
  return {
    topUpCents: monthlyMinimumTopUp(input.chargedThisMonthCents),
    waived: false,
  };
}

/** 到期扫描：把过期策略置为 expired，返回受影响商家（供恢复通知） */
export async function expireLapsedPolicies(
  db: Tx = prisma,
  at: Date = new Date()
): Promise<string[]> {
  const lapsed = await db.platformFeePolicy.findMany({
    where: { status: "active", endsAt: { not: null, lt: at } },
    select: { id: true, businessId: true },
  });
  if (lapsed.length === 0) return [];
  await db.platformFeePolicy.updateMany({
    where: { id: { in: lapsed.map((r) => r.id) } },
    data: { status: "expired" },
  });
  return Array.from(new Set(lapsed.map((r) => r.businessId)));
}

/** 需要到期提醒的策略（到期前 30 / 7 天） */
export async function policiesNeedingNotice(
  db: Tx = prisma,
  at: Date = new Date()
) {
  const windows = POLICY_NOTICE_DAYS.map((d) => {
    const from = new Date(at.getTime() + (d - 1) * 86400_000);
    const to = new Date(at.getTime() + d * 86400_000);
    return { days: d, from, to };
  });
  const out: Array<{ days: number; policyId: string; businessId: string; endsAt: Date }> = [];
  for (const w of windows) {
    const rows = await db.platformFeePolicy.findMany({
      where: { status: "active", endsAt: { gte: w.from, lt: w.to } },
      select: { id: true, businessId: true, endsAt: true },
    });
    for (const r of rows) {
      if (r.endsAt) {
        out.push({ days: w.days, policyId: r.id, businessId: r.businessId, endsAt: r.endsAt });
      }
    }
  }
  return out;
}

export { PLATFORM_MIN_MONTHLY_CENTS };

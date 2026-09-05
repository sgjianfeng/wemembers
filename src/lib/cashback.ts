/**
 * 活动 2 —— 消费返余额（cashback）
 *
 * ## 资金模型：记账负债，不是储备金
 *
 * 品牌专享下额度只能在自家门店用。发 S$3 额度 = 商家承诺未来给 S$3 商品
 * = 一笔**负债**，不动现金。核销时商家交付商品，真实成本是 `S$3 × COGS`。
 * 让商家发放时先扣 S$3 真金，等于逼他预付 100% 面额去兑付一个只值 40% 的承诺，
 * 而且是付给自己——纯账面搬运，无风控价值。
 *
 * | 场景            | 计提是否扣真金 |
 * |-----------------|----------------|
 * | 专享（Phase 1） | ❌ 只记负债     |
 * | 共赢（Phase 3） | ✅ A 发 B 核销，B 真损失商品 |
 * | 平台费          | ✅ 永远真金（扣不动则记欠） |
 *
 * ## 降级由欠费驱动，不是钱包余额
 *
 * 欠费 = Σ(应收 − 减免 − 实扣)。≥ S$200 降级，≥ S$500 只发积分。
 *
 * ## 红线
 * - cashback 券 `origin="cashback"` + `feeExempt=true`，核销零抽点、不可提现
 * - cashback 余额不得用于购买活动 3 的券（真金池只接受真金）
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { quotePlatformFee, resolveActivePolicy } from "@/lib/platform-fee-policy";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

/** cashback 额度默认无活动失效月数 */
export const CASHBACK_INACTIVITY_MONTHS = 24;

/** 欠费降级阈值（分） */
export const OWED_DEGRADE_CENTS = 20_000; // S$200
export const OWED_POINTS_ONLY_CENTS = 50_000; // S$500

/** 降级档的 cashback 费率 % */
export const DEGRADED_CASHBACK_PERCENT = 1;
/**
 * 降级档的**总发放**上限（返利 + 抽奖，百分点）。
 *
 * 只压 cashback 那条腿是不够的：单一 drawPercent 模型下 cashbackPercent 可能是 0，
 * 压它等于没压——欠了 S$200 的商家照样按 10% 发额度，风控形同虚设。
 *
 * 取 3 是为了对齐旧行为：旧默认 3% 返 + 2% 抽，降级后是 1 + 2 = 3 点。
 * 也正好等于 TOTAL_PERCENT_MIN——降级是掉到"最低可用档"，不是掉到零。
 */
export const DEGRADED_TOTAL_PERCENT = 3;
/** 降级档的抽奖权重系数（与独享 gift 路径一致） */
export const DEGRADED_WEIGHT_FACTOR = 0.2;

/** 商家总费率边界 */
export const TOTAL_PERCENT_MIN = 3;
export const TOTAL_PERCENT_MAX = 15;

export type FundingTier = "full" | "degraded" | "points_only";

export type CashbackRules = {
  cashbackPercent: number;
  drawPercent: number;
  instantPoolRatio: number;
  grandPoolRatio: number;
  minSpendCents: number;
  ticketsPerUnit: number;
  inactivityMonths: number;
  /**
   * 商家的平均客单价（分）。**大奖档位必须按它算，不能按单笔消费金额算**——
   * 否则顾客花 S$5 和花 S$500 会看到完全不同的解锁目标，进度条来回跳。
   * 档位一旦生成就应保持稳定。
   */
  avgTicketCents: number;
};

/**
 * 默认规则 —— **一条线：消费的 10% 全部进抽奖，不再单列固定返利。**
 *
 * 旧默认是 3% 返利 + 2% 抽奖两条线。同样的钱，"返你 S$5"是记账，"抽到 S$8.20"才是活动，
 * 顾客记得住后者。所以把 cashbackPercent 归零，10 个点整个交给抽奖，
 * 由 instantPoolRatio / grandPoolRatio 去分即时小奖与大奖。
 *
 * 两个滑杆都保留：想回到"固定返利 + 小抽奖"的商家自己调回去就是。
 *
 * 10% 是**名义**成本，不是现金成本：额度以商品兑现，餐饮食材成本约 3 成，
 * 再打上核销率，真实成本落在 2–3%。商家后台必须按真实成本展示，
 * 否则老板看到"送 10%"就走了——他的净利率也就 10% 出头。
 */
export const DEFAULT_CASHBACK_RULES: CashbackRules = {
  cashbackPercent: 0,
  drawPercent: 10,
  instantPoolRatio: 35,
  grandPoolRatio: 65,
  minSpendCents: 0,
  ticketsPerUnit: 1,
  inactivityMonths: CASHBACK_INACTIVITY_MONTHS,
  avgTicketCents: 2_500,
};

function clampPercent(n: unknown, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(100, Math.max(0, v));
}

/** 从 Campaign.rulesSnapshot 解析活动 2 规则，缺失走默认 */
export function parseCashbackRules(
  rulesSnapshot: string | null | undefined
): CashbackRules {
  if (!rulesSnapshot) return { ...DEFAULT_CASHBACK_RULES };
  let raw: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rulesSnapshot);
    raw = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return { ...DEFAULT_CASHBACK_RULES };
  }
  const d = DEFAULT_CASHBACK_RULES;
  const instant = clampPercent(raw.instantPoolRatio, d.instantPoolRatio);
  return {
    cashbackPercent: clampPercent(raw.cashbackPercent, d.cashbackPercent),
    drawPercent: clampPercent(raw.drawPercent, d.drawPercent),
    instantPoolRatio: instant,
    grandPoolRatio: 100 - instant,
    minSpendCents:
      typeof raw.minSpendCents === "number" && raw.minSpendCents > 0
        ? Math.round(raw.minSpendCents)
        : d.minSpendCents,
    ticketsPerUnit:
      typeof raw.ticketsPerUnit === "number" && raw.ticketsPerUnit > 0
        ? Math.round(raw.ticketsPerUnit)
        : d.ticketsPerUnit,
    inactivityMonths:
      typeof raw.cashbackInactivityMonths === "number" &&
      raw.cashbackInactivityMonths > 0
        ? Math.round(raw.cashbackInactivityMonths)
        : d.inactivityMonths,
    avgTicketCents:
      typeof raw.avgTicketCents === "number" && raw.avgTicketCents > 0
        ? Math.round(raw.avgTicketCents)
        : d.avgTicketCents,
  };
}

/** 商家可自由分配 cashback / 抽奖，但总率必须落在 [3%, 15%] */
export function validateCashbackRates(
  cashbackPercent: number,
  drawPercent: number
): { ok: true } | { ok: false; error: string } {
  if (cashbackPercent < 0 || drawPercent < 0) {
    return { ok: false, error: "费率不能为负" };
  }
  const total = cashbackPercent + drawPercent;
  if (total < TOTAL_PERCENT_MIN) {
    return {
      ok: false,
      error: `返利 + 抽奖合计不得低于 ${TOTAL_PERCENT_MIN}%（当前 ${total}%），低于此值顾客无感知`,
    };
  }
  if (total > TOTAL_PERCENT_MAX) {
    return {
      ok: false,
      error: `返利 + 抽奖合计不得高于 ${TOTAL_PERCENT_MAX}%（当前 ${total}%）`,
    };
  }
  return { ok: true };
}

export type Accrual = {
  cashbackCents: number;
  drawCents: number;
  /** 抽奖池切分（Phase 2 用） */
  instantPoolCents: number;
  grandPoolCents: number;
  platformGrossCents: number;
  platformWaivedCents: number;
  platformNetCents: number;
  cashbackPercent: number;
  drawPercent: number;
  platformPercent: number;
  /** 会员等级带来的额外返现百分点（已并入 cashbackPercent） */
  tierBonusPercent: number;
};

/**
 * 会员等级加成落到基础返现率上，并夹在总费率上限内。
 *
 * 加成是**商家的额外负债**，所以两条硬约束：
 * 1. 基础 + 加成 + 抽奖 不得超过 TOTAL_PERCENT_MAX；超出部分直接砍掉，不报错——
 *    商家改抽奖比例后加成会被自动挤压，比让收银台报错合理。
 * 2. 欠费降级时加成一并失效（下面 degraded 分支的 min 会兜住）。
 */
export function applyTierBonus(
  basePercent: number,
  drawPercent: number,
  bonusPercent: number
): number {
  const bonus = Math.max(0, Number.isFinite(bonusPercent) ? bonusPercent : 0);
  const room = Math.max(0, TOTAL_PERCENT_MAX - basePercent - drawPercent);
  return basePercent + Math.min(bonus, room);
}

/**
 * 单笔消费的计提计算。
 * cashback / draw 是记账负债；平台费是真金（gross / waived / net 三个数都要留痕）。
 */
export function computeAccrual(input: {
  amountCents: number;
  rules: CashbackRules;
  tier: FundingTier;
  platformQuote: { grossCents: number; waivedCents: number; netCents: number };
  /** 会员等级加成（百分点）。缺省 0 = 无加成 */
  memberBonusPercent?: number;
}): Accrual {
  const amount = Math.max(0, Math.round(input.amountCents));
  const q = input.platformQuote;

  const basePct = input.rules.cashbackPercent;
  let drawPct = input.rules.drawPercent;
  let cashbackPct = applyTierBonus(
    basePct,
    drawPct,
    input.memberBonusPercent ?? 0
  );
  if (input.tier === "degraded") {
    // 降级档是硬上限：等级加成不能绕过它
    cashbackPct = Math.min(cashbackPct, DEGRADED_CASHBACK_PERCENT);
    // 再压抽奖那条腿，把**总发放**收进 DEGRADED_TOTAL_PERCENT。
    // 少了这一步，cashbackPercent = 0 的活动（单一 drawPercent 模型）根本降不下来。
    drawPct = Math.min(drawPct, Math.max(0, DEGRADED_TOTAL_PERCENT - cashbackPct));
  } else if (input.tier === "points_only") {
    cashbackPct = 0;
    drawPct = 0;
  }
  const tierBonusPercent = Math.max(0, cashbackPct - basePct);

  const cashbackCents = Math.floor((amount * cashbackPct) / 100);
  const drawCents = Math.floor((amount * drawPct) / 100);
  const instantPoolCents = Math.floor(
    (drawCents * input.rules.instantPoolRatio) / 100
  );

  return {
    cashbackCents,
    drawCents,
    instantPoolCents,
    grandPoolCents: drawCents - instantPoolCents,
    platformGrossCents: q.grossCents,
    platformWaivedCents: q.waivedCents,
    platformNetCents: q.netCents,
    cashbackPercent: cashbackPct,
    drawPercent: drawPct,
    platformPercent: amount > 0 ? (q.grossCents / amount) * 100 : 0,
    tierBonusPercent,
  };
}

/**
 * 读取顾客在该品牌当前等级的返现加成（百分点）。
 * 尚未开卡 / 商家没配加成 → 0。
 */
export async function memberTierBonusPercent(
  db: Db,
  businessId: string,
  customerId: string
): Promise<{ tier: string | null; bonusPercent: number }> {
  const membership = await db.membership.findUnique({
    where: { businessId_customerId: { businessId, customerId } },
    select: { tier: true },
  });
  if (!membership) return { tier: null, bonusPercent: 0 };

  const config = await db.membershipTierConfig.findUnique({
    where: { businessId_tier: { businessId, tier: membership.tier } },
    select: { cashbackBonusPercent: true },
  });
  return {
    tier: membership.tier,
    bonusPercent: Math.max(0, config?.cashbackBonusPercent ?? 0),
  };
}

/** 商家当前累计欠费（分） */
export async function outstandingPlatformFeeCents(
  db: Db,
  businessId: string
): Promise<number> {
  const agg = await db.spendRecord.aggregate({
    where: { businessId, status: "settled" },
    _sum: {
      platformFeeCents: true,
      platformWaivedCents: true,
      platformFeeChargedCents: true,
    },
  });
  const gross = agg._sum.platformFeeCents ?? 0;
  const waived = agg._sum.platformWaivedCents ?? 0;
  const charged = agg._sum.platformFeeChargedCents ?? 0;
  return Math.max(0, gross - waived - charged);
}

/** 当月累计流水（分），用于阶梯费率 */
export async function monthToDateGmvCents(
  db: Db,
  businessId: string,
  at: Date = new Date()
): Promise<number> {
  const start = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1, 0, 0, 0, 0)
  );
  const agg = await db.spendRecord.aggregate({
    where: { businessId, status: "settled", createdAt: { gte: start } },
    _sum: { amountCents: true },
  });
  return agg._sum.amountCents ?? 0;
}

/**
 * 降级档判定。
 * 专享阶段不看钱包余额（发放不扣真金），只看平台费欠费与未核销负债上限。
 */
export function resolveFundingTier(input: {
  owedCents: number;
  outstandingLiabilityCents: number;
  maxOutstandingCents: number | null;
}): FundingTier {
  if (input.owedCents >= OWED_POINTS_ONLY_CENTS) return "points_only";
  if (
    input.maxOutstandingCents != null &&
    input.outstandingLiabilityCents >= input.maxOutstandingCents
  ) {
    return "points_only";
  }
  if (input.owedCents >= OWED_DEGRADE_CENTS) return "degraded";
  return "full";
}

/** 防重复指纹：同店 + 同手机 + 同金额 + 同日 + 同备注 */
export function spendFingerprint(input: {
  storeId: string;
  phone: string;
  amountCents: number;
  at?: Date;
  receiptNote?: string | null;
}): string {
  const d = input.at ?? new Date();
  const day = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
  return [
    input.storeId,
    input.phone,
    String(Math.round(input.amountCents)),
    day,
    (input.receiptNote || "").trim(),
  ].join("|");
}

/** 活跃即长期有效：无活动 N 个月后失效 */
export function computeInactivityExpiry(
  lastActivityAt: Date,
  months: number = CASHBACK_INACTIVITY_MONTHS
): Date {
  const d = new Date(lastActivityAt.getTime());
  d.setUTCMonth(d.getUTCMonth() + Math.max(1, Math.round(months)));
  return d;
}

/**
 * 核销 cashback 额度：负债兑现。
 * 专享阶段商家发放时未扣现金，核销时也不向门店钱包入账——
 * 商家交付的是商品，成本已在 COGS 里。门店级损益由报表按发放店/核销店轧差呈现。
 */
export async function settleCashbackRedeem(
  db: Db,
  campaignId: string,
  amountCents: number
): Promise<{ redeemedCents: number; outstandingAfterCents: number }> {
  const amount = Math.max(0, Math.round(amountCents));
  if (amount <= 0) {
    const c = await db.campaign.findUnique({
      where: { id: campaignId },
      select: { cashbackIssuedCents: true, cashbackRedeemedCents: true },
    });
    return {
      redeemedCents: 0,
      outstandingAfterCents: Math.max(
        0,
        (c?.cashbackIssuedCents ?? 0) - (c?.cashbackRedeemedCents ?? 0)
      ),
    };
  }

  const updated = await db.campaign.update({
    where: { id: campaignId },
    data: { cashbackRedeemedCents: { increment: amount } },
    select: { cashbackIssuedCents: true, cashbackRedeemedCents: true },
  });

  return {
    redeemedCents: amount,
    outstandingAfterCents: Math.max(
      0,
      updated.cashbackIssuedCents - updated.cashbackRedeemedCents
    ),
  };
}

export { quotePlatformFee, resolveActivePolicy };

// ────────────────────────────────────────────────────────────
// 记录消费 → 发额度
// ────────────────────────────────────────────────────────────

/** 单客单店单日发放封顶（分），活动可覆盖 */
export const DEFAULT_DAILY_CAP_CENTS = 5_000; // S$50
/** 单笔消费上限（分），超出需 business 角色确认 */
export const SINGLE_SPEND_CONFIRM_CENTS = 200_000; // S$2,000
/** 每 S$1 消费得多少积分 */
export const DEFAULT_POINTS_PER_DOLLAR = 1;

export type RecordSpendInput = {
  campaignId: string;
  businessId: string;
  storeId: string;
  phone: string;
  amountCents: number;
  source?: "staff" | "receipt" | "redeem" | "pos";
  staffUserId?: string | null;
  receiptNote?: string | null;
  /** business 角色对大额消费的确认 */
  allowLargeAmount?: boolean;
};

export type RecordSpendResult = {
  duplicated: boolean;
  spendRecordId: string;
  customerId: string;
  fundingTier: FundingTier;
  accrual: Accrual;
  cashbackVoucherId: string | null;
  cashbackShortCode: string | null;
  platformChargedCents: number;
  platformOwedCents: number;
  pointsAwarded: number;
  newTier: string | null;
  cappedByDaily: boolean;
  /** 本笔消费适用的会员等级（发放前），未开卡为 null */
  memberTier: string | null;
  /** 该等级带来的额外返现百分点，0 = 无加成 */
  tierBonusPercent: number;
  /** 即时奖（已并入消费额度券） */
  instantPrize: {
    id: string;
    name: string;
    icon: string;
    valueCents: number;
  } | null;
  /** 大奖进度（指向下一个未发放档位） */
  grandProgress: {
    tierId: string;
    tierName: string;
    tierIcon: string;
    poolCents: number;
    targetCents: number;
    progressPercent: number;
  } | null;
};

export class CashbackError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "CashbackError";
  }
}

export function cashbackErrorMessage(code: string): string {
  const map: Record<string, string> = {
    CAMPAIGN_NOT_FOUND: "活动不存在",
    CAMPAIGN_NOT_ACTIVE: "活动未启用",
    CAMPAIGN_OUT_OF_WINDOW: "不在活动有效期内",
    STORE_NOT_IN_CAMPAIGN: "本门店未参加该活动",
    STORE_NOT_FOUND: "门店不存在",
    INVALID_AMOUNT: "消费金额无效",
    INVALID_PHONE: "手机号格式不正确",
    BELOW_MIN_SPEND: "未达到活动最低消费门槛",
    AMOUNT_TOO_LARGE: "单笔金额过大，需企业主确认",
    BALANCE_NOT_PURCHASABLE: "消费抵扣额度不可用于购券，请到店消费时使用",
  };
  return map[code] || "操作失败";
}

/**
 * 记录一笔消费并发放 cashback 额度。
 *
 * 单事务内完成：指纹去重 → 计提 → 平台费扣真金 → 发额度券 → 累加负债 → 会员积分/等级。
 * 幂等：同指纹重复提交返回已有记录，不重复发放。
 */
export async function recordSpend(
  tx: Tx,
  input: RecordSpendInput
): Promise<RecordSpendResult> {
  const amount = Math.round(input.amountCents);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new CashbackError("INVALID_AMOUNT");
  }
  if (amount > SINGLE_SPEND_CONFIRM_CENTS && !input.allowLargeAmount) {
    throw new CashbackError("AMOUNT_TOO_LARGE");
  }

  const phone = normalizeLocalPhone(input.phone);
  if (phone.replace(/\D/g, "").length < 8) {
    throw new CashbackError("INVALID_PHONE");
  }

  // ── 活动校验 ──
  const campaign = await tx.campaign.findFirst({
    where: { id: input.campaignId, businessId: input.businessId },
    select: {
      id: true,
      status: true,
      type: true,
      startDate: true,
      endDate: true,
      rulesSnapshot: true,
      storeIds: true,
      maxOutstandingCents: true,
      cashbackIssuedCents: true,
      cashbackRedeemedCents: true,
    },
  });
  if (!campaign) throw new CashbackError("CAMPAIGN_NOT_FOUND");
  if (campaign.status !== "active") throw new CashbackError("CAMPAIGN_NOT_ACTIVE");

  const now = new Date();
  if (now < campaign.startDate || now > campaign.endDate) {
    throw new CashbackError("CAMPAIGN_OUT_OF_WINDOW");
  }
  if (!storeAllowed(campaign.storeIds, input.storeId)) {
    throw new CashbackError("STORE_NOT_IN_CAMPAIGN");
  }

  const rules = parseCashbackRules(campaign.rulesSnapshot);
  if (rules.minSpendCents > 0 && amount < rules.minSpendCents) {
    throw new CashbackError("BELOW_MIN_SPEND");
  }

  // ── 幂等：指纹去重 ──
  const fingerprint = spendFingerprint({
    storeId: input.storeId,
    phone,
    amountCents: amount,
    at: now,
    receiptNote: input.receiptNote,
  });
  const existing = await tx.spendRecord.findFirst({
    where: { receiptFingerprint: fingerprint, status: "settled" },
    select: {
      id: true,
      customerId: true,
      fundingTier: true,
      cashbackVoucherId: true,
      cashbackCents: true,
      drawCents: true,
      platformFeeCents: true,
      platformWaivedCents: true,
      platformFeeChargedCents: true,
      cashbackPercent: true,
      drawPercent: true,
      platformPercent: true,
      memberTier: true,
      tierBonusPercent: true,
    },
  });
  if (existing) {
    const short = existing.cashbackVoucherId
      ? await tx.voucher.findUnique({
          where: { id: existing.cashbackVoucherId },
          select: { shortCode: true },
        })
      : null;
    return {
      duplicated: true,
      spendRecordId: existing.id,
      customerId: existing.customerId || "",
      fundingTier: existing.fundingTier as FundingTier,
      accrual: {
        cashbackCents: existing.cashbackCents,
        drawCents: existing.drawCents,
        instantPoolCents: 0,
        grandPoolCents: 0,
        platformGrossCents: existing.platformFeeCents,
        platformWaivedCents: existing.platformWaivedCents,
        platformNetCents:
          existing.platformFeeCents - existing.platformWaivedCents,
        cashbackPercent: existing.cashbackPercent,
        drawPercent: existing.drawPercent,
        platformPercent: existing.platformPercent,
        tierBonusPercent: existing.tierBonusPercent,
      },
      cashbackVoucherId: existing.cashbackVoucherId,
      cashbackShortCode: short?.shortCode ?? null,
      platformChargedCents: existing.platformFeeChargedCents,
      platformOwedCents: Math.max(
        0,
        existing.platformFeeCents -
          existing.platformWaivedCents -
          existing.platformFeeChargedCents
      ),
      pointsAwarded: 0,
      newTier: null,
      cappedByDaily: false,
      memberTier: existing.memberTier,
      tierBonusPercent: existing.tierBonusPercent,
      instantPrize: null,
      grandProgress: null,
    };
  }

  // ── 顾客 ──
  // 必须在计提之前解析：会员等级会影响返现率（等级加成）。
  // 用的是**本笔消费之前**的等级——这笔带来的升级从下一笔才生效，
  // 否则同一笔既算旧率又算新率，账对不上。
  const { findOrCreateCustomerByPhone } = await import("@/lib/customer-by-phone");
  const customer = await findOrCreateCustomerByPhone(tx, phone);
  const memberBonus = await memberTierBonusPercent(
    tx,
    input.businessId,
    customer.id
  );

  // ── 降级档判定（专享阶段看欠费，不看钱包余额）──
  const [owedCents, mtdGmv] = await Promise.all([
    outstandingPlatformFeeCents(tx, input.businessId),
    monthToDateGmvCents(tx, input.businessId, now),
  ]);
  const outstandingLiability = Math.max(
    0,
    campaign.cashbackIssuedCents - campaign.cashbackRedeemedCents
  );
  const tier = resolveFundingTier({
    owedCents,
    outstandingLiabilityCents: outstandingLiability,
    maxOutstandingCents: campaign.maxOutstandingCents,
  });

  // ── 平台费报价（含促销减免）──
  const policy = await resolveActivePolicy(tx, input.businessId, now);
  const quote = quotePlatformFee({
    mtdGmvCents: mtdGmv,
    amountCents: amount,
    policy,
  });

  const accrual = computeAccrual({
    amountCents: amount,
    rules,
    tier,
    platformQuote: quote,
    memberBonusPercent: memberBonus.bonusPercent,
  });

  // ── 单客单店单日封顶 ──
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const todayAgg = await tx.spendRecord.aggregate({
    where: {
      storeId: input.storeId,
      phone,
      status: "settled",
      createdAt: { gte: dayStart },
    },
    _sum: { cashbackCents: true },
  });
  const issuedToday = todayAgg._sum.cashbackCents ?? 0;
  const dailyRoom = Math.max(0, DEFAULT_DAILY_CAP_CENTS - issuedToday);
  const cappedByDaily = accrual.cashbackCents > dailyRoom;
  const cashbackToIssue = Math.min(accrual.cashbackCents, dailyRoom);

  // ── 平台费扣真金（gift 优先，扣不动记欠）──
  const charged = await chargePlatformFee(tx, {
    businessId: input.businessId,
    grossCents: quote.grossCents,
    waivedCents: quote.waivedCents,
    netCents: quote.netCents,
    label: `平台费 · 消费 S$${(amount / 100).toFixed(2)}`,
  });

  // ── 发 cashback 额度券 ──
  let voucherId: string | null = null;
  let shortCode: string | null = null;
  if (cashbackToIssue > 0) {
    const { allocateShortCode } = await import("@/lib/voucher-short-code");
    shortCode = await allocateShortCode();
    const v = await tx.voucher.create({
      data: {
        shortCode,
        customerId: customer.id,
        campaignId: campaign.id,
        storeId: input.storeId,
        amountCents: cashbackToIssue,
        paidCents: 0,
        balanceCents: cashbackToIssue,
        prizePoolContribution: 0,
        drawWeight: 0,
        tier: "small",
        productKind: "self_use",
        origin: "cashback",
        feeExempt: true,
        lastActivityAt: now,
        inactivityMonths: rules.inactivityMonths,
        issueReason: "marketing",
        issueNote: `消费返 ${accrual.cashbackPercent}% · 消费 S$${(amount / 100).toFixed(2)}`,
        issuedById: input.staffUserId || null,
      },
      select: { id: true },
    });
    voucherId = v.id;

    await tx.campaign.update({
      where: { id: campaign.id },
      data: { cashbackIssuedCents: { increment: cashbackToIssue } },
    });
  }

  // ── 抽奖：即时奖并入额度券，大奖池累积 ──
  let instantPrize: RecordSpendResult["instantPrize"] = null;
  let instantPrizeCents = 0;
  let grandProgress: RecordSpendResult["grandProgress"] = null;

  if (accrual.drawCents > 0) {
    const {
      drawInstantCredit,
      creditInstantPrize,
      resolveGrandUnlock,
      defaultGrandTiers,
      parseAwardedIds,
    } = await import("@/lib/cashback-draw");

    // 奖池先入账，再从中开奖——顺序反了会让第一笔消费抽到空池
    await tx.campaign.update({
      where: { id: campaign.id },
      data: {
        instantPoolCents: { increment: accrual.instantPoolCents },
        grandPoolCents: { increment: accrual.grandPoolCents },
      },
    });

    if (voucherId && accrual.instantPoolCents > 0) {
      const award = drawInstantCredit({
        amountCents: amount,
        drawPercent: accrual.drawPercent,
        instantPoolRatio: rules.instantPoolRatio,
      });
      if (award.overspending) {
        console.warn(
          `cashback instant EV infeasible: campaign=${campaign.id} overspend=${award.overspendCents}c/笔 —— 应启用累计门槛`
        );
      }
      await creditInstantPrize(tx, {
        voucherId,
        campaignId: campaign.id,
        prize: award.prize,
        at: now,
      });
      instantPrizeCents = award.prize.valueCents;
      instantPrize = {
        id: award.prize.id,
        name: award.prize.nameZh,
        icon: award.prize.icon,
        valueCents: award.prize.valueCents,
      };
    }

    // 大奖进度（解锁与发放由后台/核销流程处理，此处只回报进度）
    const fresh = await tx.campaign.findUnique({
      where: { id: campaign.id },
      select: { grandPoolCents: true, awardedGrandPrizeIds: true },
    });
    const unlock = resolveGrandUnlock({
      grandPoolCents: fresh?.grandPoolCents ?? 0,
      // 用活动配置的平均客单价，不是本笔金额——档位必须跨交易稳定
      tiers: defaultGrandTiers(rules.avgTicketCents),
      awardedIds: parseAwardedIds(fresh?.awardedGrandPrizeIds),
    });
    if (unlock.nextTier) {
      grandProgress = {
        tierId: unlock.nextTier.id,
        tierName: unlock.nextTier.name,
        tierIcon: unlock.nextTier.icon,
        poolCents: fresh?.grandPoolCents ?? 0,
        targetCents: unlock.nextTier.targetCents,
        progressPercent: unlock.progressPercent,
      };
    }
  }

  // ── 消费流水 ──
  const record = await tx.spendRecord.create({
    data: {
      campaignId: campaign.id,
      businessId: input.businessId,
      // Phase 1 直营恒等于 businessId；加盟连锁上线时指向加盟商
      fundedByBusinessId: input.businessId,
      storeId: input.storeId,
      customerId: customer.id,
      phone,
      staffUserId: input.staffUserId || null,
      amountCents: amount,
      source: input.source || "staff",
      receiptNote: input.receiptNote || null,
      receiptFingerprint: fingerprint,
      cashbackPercent: accrual.cashbackPercent,
      drawPercent: accrual.drawPercent,
      platformPercent: accrual.platformPercent,
      cashbackCents: cashbackToIssue,
      drawCents: accrual.drawCents,
      platformFeeCents: accrual.platformGrossCents,
      platformWaivedCents: accrual.platformWaivedCents,
      platformFeeChargedCents: charged.chargedCents,
      instantPrizeCents,
      memberTier: memberBonus.tier,
      tierBonusPercent: accrual.tierBonusPercent,
      fundingTier: tier,
      status: "settled",
      cashbackVoucherId: voucherId,
    },
    select: { id: true },
  });

  // ── 会员积分 / 等级 ──
  const points = await awardMembershipPoints(tx, {
    businessId: input.businessId,
    customerId: customer.id,
    storeId: input.storeId,
    amountCents: amount,
  });

  return {
    duplicated: false,
    spendRecordId: record.id,
    customerId: customer.id,
    fundingTier: tier,
    accrual: { ...accrual, cashbackCents: cashbackToIssue },
    cashbackVoucherId: voucherId,
    cashbackShortCode: shortCode,
    platformChargedCents: charged.chargedCents,
    platformOwedCents: charged.owedCents,
    pointsAwarded: points.awarded,
    newTier: points.newTier,
    cappedByDaily,
    memberTier: memberBonus.tier,
    tierBonusPercent: accrual.tierBonusPercent,
    instantPrize,
    grandProgress,
  };
}

/** 本地号，无 +65 前缀 */
function normalizeLocalPhone(raw: string): string {
  return String(raw || "").trim().replace(/\s+/g, "").replace(/^\+65/, "");
}

function storeAllowed(storeIdsJson: string | null, storeId: string): boolean {
  if (!storeIdsJson || !storeIdsJson.trim()) return true;
  try {
    const arr = JSON.parse(storeIdsJson);
    if (!Array.isArray(arr)) return true;
    return arr.includes(storeId);
  } catch {
    return true;
  }
}

/**
 * 平台费扣款：gift 额度优先（平台赠送本就只能抵服务费），再扣自充余额。
 * 扣不动的部分记为欠费——欠费累计驱动降级，不阻断当次发放。
 *
 * 记账三笔，净额等于实扣（红线：减免绝不记 0）：
 *   platform_fee        −gross
 *   platform_fee_waiver +waived
 *   platform_fee_owed   +owed
 */
async function chargePlatformFee(
  tx: Tx,
  args: {
    businessId: string;
    grossCents: number;
    waivedCents: number;
    netCents: number;
    label: string;
  }
): Promise<{ chargedCents: number; owedCents: number }> {
  if (args.grossCents <= 0) return { chargedCents: 0, owedCents: 0 };

  let account = await tx.tokenAccount.findUnique({
    where: { userId: args.businessId },
  });
  if (!account) {
    account = await tx.tokenAccount.create({
      data: { userId: args.businessId, balance: 0, giftBalance: 0 },
    });
  }

  const available =
    Math.max(0, account.giftBalance) + Math.max(0, account.balance);
  const charged = Math.min(args.netCents, available);
  const owed = Math.max(0, args.netCents - charged);

  const fromGift = Math.min(charged, Math.max(0, account.giftBalance));
  const fromBalance = charged - fromGift;

  if (charged > 0) {
    await tx.tokenAccount.update({
      where: { id: account.id },
      data: {
        ...(fromGift > 0 ? { giftBalance: { decrement: fromGift } } : {}),
        ...(fromBalance > 0 ? { balance: { decrement: fromBalance } } : {}),
        totalSpent: { increment: charged },
      },
    });
  }

  const balanceAfter = Math.max(0, account.balance - fromBalance);

  await tx.tokenTransaction.create({
    data: {
      accountId: account.id,
      amount: -args.grossCents,
      type: "platform_fee",
      description: `${args.label} · 应收 S$${(args.grossCents / 100).toFixed(2)}`,
      balanceAfter,
    },
  });
  if (args.waivedCents > 0) {
    await tx.tokenTransaction.create({
      data: {
        accountId: account.id,
        amount: args.waivedCents,
        type: "platform_fee_waiver",
        description: `促销减免 S$${(args.waivedCents / 100).toFixed(2)}`,
        balanceAfter,
      },
    });
  }
  if (owed > 0) {
    await tx.tokenTransaction.create({
      data: {
        accountId: account.id,
        amount: owed,
        type: "platform_fee_owed",
        description: `余额不足挂账 S$${(owed / 100).toFixed(2)}`,
        balanceAfter,
      },
    });
  }

  return { chargedCents: charged, owedCents: owed };
}

/** 消费送积分 + 等级复算（tx 内联，不用 points.ts 的 prisma 直连版） */
async function awardMembershipPoints(
  tx: Tx,
  args: {
    businessId: string;
    customerId: string;
    storeId: string;
    amountCents: number;
  }
): Promise<{ awarded: number; newTier: string | null }> {
  const awarded = Math.floor(
    (args.amountCents / 100) * DEFAULT_POINTS_PER_DOLLAR
  );
  if (awarded <= 0) return { awarded: 0, newTier: null };

  const membership = await tx.membership.upsert({
    where: {
      businessId_customerId: {
        businessId: args.businessId,
        customerId: args.customerId,
      },
    },
    create: {
      businessId: args.businessId,
      customerId: args.customerId,
      points: awarded,
      lifetimePoints: awarded,
      visitsCount: 1,
      totalSpent: args.amountCents / 100,
    },
    update: {
      points: { increment: awarded },
      lifetimePoints: { increment: awarded },
      visitsCount: { increment: 1 },
      totalSpent: { increment: args.amountCents / 100 },
    },
    select: { id: true, points: true, lifetimePoints: true, tier: true },
  });

  await tx.pointsLog.create({
    data: {
      membershipId: membership.id,
      storeId: args.storeId,
      amount: awarded,
      type: "cashback_spend",
      reason: `消费 S$${(args.amountCents / 100).toFixed(2)}`,
      balanceAfter: membership.points,
    },
  });

  // 等级看 lifetimePoints（累计获得），不看可花余额——顾客花积分领券不该掉级
  const { getTierConfigs, calculateTier } = await import("@/lib/points");
  const configs = await getTierConfigs(args.businessId);
  const newTier = calculateTier(membership.lifetimePoints, configs);
  if (newTier !== membership.tier) {
    await tx.membership.update({
      where: { id: membership.id },
      data: { tier: newTier },
    });
    return { awarded, newTier };
  }
  return { awarded, newTier: null };
}

// ────────────────────────────────────────────────────────────
// 资金红线：真金池只接受真金
// ────────────────────────────────────────────────────────────

/**
 * 断言某张券的余额可用于**购买**另一张券。
 *
 * 目前购券只支持 Stripe / 现金 / 免费，没有「用余额支付」这条路径。
 * 一旦有人新增该功能，**必须先调用本函数**，否则会打开两个洞：
 *
 * 1. 资金污染：cashback 余额是商家的记账负债，不是现金。用它买活动 3 的券，
 *    扣出的 15% 进的是「负债的一部分」，无法采购实物大奖。
 * 2. 套现：cashback 不可提现，买成券后变成可提现的购券余额。
 *
 * 对商家也是净亏：没收到现金，却把一笔小负债换成大负债 + 15% 奖池义务。
 */
export function assertBalanceUsableForPurchase(voucher: {
  origin: string;
}): void {
  if (voucher.origin !== "purchase") {
    throw new CashbackError("BALANCE_NOT_PURCHASABLE");
  }
}

export function isBalancePurchasable(voucher: { origin: string }): boolean {
  return voucher.origin === "purchase";
}

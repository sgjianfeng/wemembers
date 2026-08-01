/**
 * 权益有效期计算（产品定案）
 *
 * 1. 权益起 S = 购买/领取成功时刻
 * 2. 相对规则优先（购后/领后 N 天）；活动与券都写了相对天数 → 取更短
 * 3. 活动绝对截止默认只停卖/停发，不缩短已发权益
 * 4. 仅 dualProtection=true 时：E = min(相对截止, 活动截止[+宽限])
 * 5. 国庆默认 dualProtection=false，E = 领取 + validDays
 *
 * 客户只看一个「有效至」；副文解释算法。
 */

export type RelativeValidity = {
  /** 自获得日起天数 */
  days: number;
  /** 来源标签，便于文案 */
  source: "entitlement" | "activity" | "default";
};

export type ValidityInput = {
  /** 购买/领取时刻 */
  obtainedAt: Date;
  /** 权益侧相对天数（券/赠送定义） */
  entitlementValidDays?: number | null;
  /** 活动侧相对天数（若活动也写「购后 M 天」） */
  activityValidDays?: number | null;
  /** 活动绝对截止 */
  activityEnd?: Date | null;
  /**
   * 双重保护：核销也受活动截止限制
   * false/默认：活动截止不缩短已发权益
   */
  dualProtection?: boolean;
  /** 双重保护时活动结束后宽限天数，默认 0 */
  postActivityGraceDays?: number;
};

export type ValidityResult = {
  obtainedAt: Date;
  expiresAt: Date;
  /** 实际采用的相对天数 */
  relativeDays: number;
  dualProtection: boolean;
  /** 是否被活动绝对截止截短（仅 dualProtection） */
  truncatedByActivityEnd: boolean;
  /** 客户主文案 key 数据 */
  display: {
    expiresAt: Date;
    /** zh 副文 */
    ruleZh: string;
    /** en 副文 */
    ruleEn: string;
    /** 购前强提示（会被截短时） */
    warningZh: string | null;
    warningEn: string | null;
  };
};

function endOfDay(d: Date): Date {
  const x = new Date(d.getTime());
  x.setHours(23, 59, 59, 999);
  return x;
}

/** 自 obtainedAt 起加 days 天（日历日） */
export function addDays(obtainedAt: Date, days: number): Date {
  const d = new Date(obtainedAt.getTime());
  d.setDate(d.getDate() + Math.max(0, Math.round(days)));
  return d;
}

/**
 * 解析相对天数：权益优先收集；两边都有则取更短（更近）
 */
export function resolveRelativeDays(
  entitlementValidDays?: number | null,
  activityValidDays?: number | null,
  fallbackDays: number = 365
): { days: number; sources: RelativeValidity[] } {
  const sources: RelativeValidity[] = [];
  if (
    entitlementValidDays != null &&
    Number.isFinite(entitlementValidDays) &&
    entitlementValidDays > 0
  ) {
    sources.push({
      days: Math.round(entitlementValidDays),
      source: "entitlement",
    });
  }
  if (
    activityValidDays != null &&
    Number.isFinite(activityValidDays) &&
    activityValidDays > 0
  ) {
    sources.push({
      days: Math.round(activityValidDays),
      source: "activity",
    });
  }
  if (sources.length === 0) {
    return {
      days: fallbackDays,
      sources: [{ days: fallbackDays, source: "default" }],
    };
  }
  const days = Math.min(...sources.map((s) => s.days));
  return { days, sources };
}

/**
 * 计算单张权益的有效至（发放时调用并落库）
 */
export function computeEntitlementExpiry(input: ValidityInput): ValidityResult {
  const obtainedAt = new Date(input.obtainedAt.getTime());
  const dual = Boolean(input.dualProtection);
  const grace = Math.max(0, Math.round(input.postActivityGraceDays ?? 0));

  const { days: relativeDays, sources } = resolveRelativeDays(
    input.entitlementValidDays,
    input.activityValidDays,
    365
  );

  let expiresAt = addDays(obtainedAt, relativeDays);
  let truncatedByActivityEnd = false;

  if (dual && input.activityEnd) {
    const activityCap = addDays(endOfDay(input.activityEnd), grace);
    // activityEnd 当天仍有效：用 endOfDay；grace 再往后
    const cap =
      grace > 0
        ? addDays(endOfDay(input.activityEnd), grace)
        : endOfDay(input.activityEnd);
    if (cap.getTime() < expiresAt.getTime()) {
      expiresAt = cap;
      truncatedByActivityEnd = true;
    }
    void activityCap;
  }

  const ruleZh = buildRuleZh({
    relativeDays,
    sources,
    dual,
    truncatedByActivityEnd,
    activityEnd: input.activityEnd,
    grace,
  });
  const ruleEn = buildRuleEn({
    relativeDays,
    sources,
    dual,
    truncatedByActivityEnd,
    activityEnd: input.activityEnd,
    grace,
  });

  let warningZh: string | null = null;
  let warningEn: string | null = null;
  if (truncatedByActivityEnd && input.activityEnd) {
    const full = addDays(obtainedAt, relativeDays);
    warningZh = `按领取/购买后 ${relativeDays} 天本可至 ${fmtZh(full)}，因开启双重保护并以活动截止为准，有效至 ${fmtZh(expiresAt)}`;
    warningEn = `Would be ${fmtEn(full)} (${relativeDays}d from obtain); dual protection caps at activity end → ${fmtEn(expiresAt)}`;
  }

  return {
    obtainedAt,
    expiresAt,
    relativeDays,
    dualProtection: dual,
    truncatedByActivityEnd,
    display: {
      expiresAt,
      ruleZh,
      ruleEn,
      warningZh,
      warningEn,
    },
  };
}

function fmtZh(d: Date): string {
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function fmtEn(d: Date): string {
  return d.toLocaleDateString("en-SG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildRuleZh(opts: {
  relativeDays: number;
  sources: RelativeValidity[];
  dual: boolean;
  truncatedByActivityEnd: boolean;
  activityEnd?: Date | null;
  grace: number;
}): string {
  const bothRel =
    opts.sources.filter((s) => s.source !== "default").length >= 2;
  let s = bothRel
    ? `自获得日起 ${opts.relativeDays} 天内有效（活动与权益相对天数取较短）`
    : `自获得日起 ${opts.relativeDays} 天内有效`;
  if (opts.dual) {
    s += opts.grace
      ? `；双重保护：不晚于活动结束+${opts.grace}天`
      : `；双重保护：不晚于活动结束日`;
    if (opts.truncatedByActivityEnd) s += `（已按较早日期截取）`;
  } else {
    s += `；活动结束仅停止新领/新购，不缩短已领权益`;
  }
  return s;
}

function buildRuleEn(opts: {
  relativeDays: number;
  sources: RelativeValidity[];
  dual: boolean;
  truncatedByActivityEnd: boolean;
  activityEnd?: Date | null;
  grace: number;
}): string {
  const bothRel =
    opts.sources.filter((s) => s.source !== "default").length >= 2;
  let s = bothRel
    ? `Valid ${opts.relativeDays} days from obtain (shorter of activity/entitlement relative rules)`
    : `Valid ${opts.relativeDays} days from obtain date`;
  if (opts.dual) {
    s += opts.grace
      ? `; dual protection: no later than activity end + ${opts.grace}d`
      : `; dual protection: no later than activity end`;
    if (opts.truncatedByActivityEnd) s += ` (earlier date applied)`;
  } else {
    s += `; activity end stops new claims/sales only — does not shorten held entitlements`;
  }
  return s;
}

// ─── 展示用：活动期 / 售卖期 / 核销规则 / 条款 ───

export type TermsDatesInput = {
  activityStart: Date;
  activityEnd: Date;
  /** 默认 = 活动期 */
  saleStart?: Date | null;
  saleEnd?: Date | null;
  /** 权益相对天数（展示） */
  entitlementValidDays: number;
  activityValidDays?: number | null;
  dualProtection?: boolean;
  postActivityGraceDays?: number;
  /** 活动条款要点 */
  activityTermsZh?: string[];
  activityTermsEn?: string[];
  entitlementTermsZh?: string[];
  entitlementTermsEn?: string[];
  /** 适用门店文案 */
  storeScopeZh?: string;
  storeScopeEn?: string;
};

export type TermsDatesView = {
  activityPeriodZh: string;
  activityPeriodEn: string;
  salePeriodZh: string;
  salePeriodEn: string;
  redeemRuleZh: string;
  redeemRuleEn: string;
  activityTermsZh: string[];
  activityTermsEn: string[];
  entitlementTermsZh: string[];
  entitlementTermsEn: string[];
  storeScopeZh: string;
  storeScopeEn: string;
};

export function buildTermsDatesView(input: TermsDatesInput): TermsDatesView {
  const saleStart = input.saleStart ?? input.activityStart;
  const saleEnd = input.saleEnd ?? input.activityEnd;
  const dual = Boolean(input.dualProtection);
  const { days } = resolveRelativeDays(
    input.entitlementValidDays,
    input.activityValidDays,
    input.entitlementValidDays
  );

  const redeemRuleZh = dual
    ? `自购买/领取日起 ${days} 天内有效，且不晚于活动结束日${
        input.postActivityGraceDays
          ? `+${input.postActivityGraceDays}天`
          : ""
      }（取较早）`
    : `自购买/领取日起 ${days} 天内有效；活动结束后不可再买/领，已获得权益按完整天数使用`;

  const redeemRuleEn = dual
    ? `Valid ${days} days from buy/claim, and no later than activity end${
        input.postActivityGraceDays
          ? ` +${input.postActivityGraceDays}d`
          : ""
      } (earlier wins)`
    : `Valid ${days} days from buy/claim; after activity end no new buy/claim — held perks keep full days`;

  return {
    activityPeriodZh: `${fmtZh(input.activityStart)} ~ ${fmtZh(input.activityEnd)}`,
    activityPeriodEn: `${fmtEn(input.activityStart)} – ${fmtEn(input.activityEnd)}`,
    salePeriodZh:
      saleStart.getTime() === input.activityStart.getTime() &&
      saleEnd.getTime() === input.activityEnd.getTime()
        ? "与活动期相同"
        : `${fmtZh(saleStart)} ~ ${fmtZh(saleEnd)}`,
    salePeriodEn:
      saleStart.getTime() === input.activityStart.getTime() &&
      saleEnd.getTime() === input.activityEnd.getTime()
        ? "Same as activity period"
        : `${fmtEn(saleStart)} – ${fmtEn(saleEnd)}`,
    redeemRuleZh,
    redeemRuleEn,
    activityTermsZh: input.activityTermsZh?.length
      ? input.activityTermsZh
      : [
          "活动期内可按规则参与、领取或购买",
          "活动结束后停止新领/新购（除非另有售卖期）",
        ],
    activityTermsEn: input.activityTermsEn?.length
      ? input.activityTermsEn
      : [
          "Join / claim / buy only during the activity period",
          "After activity end: no new claims or purchases (unless sale window differs)",
        ],
    entitlementTermsZh: input.entitlementTermsZh?.length
      ? input.entitlementTermsZh
      : [
          "以到账页「有效至」为准（发放时已算好）",
          "不可兑换现金；使用规则以核销时门店与系统为准",
        ],
    entitlementTermsEn: input.entitlementTermsEn?.length
      ? input.entitlementTermsEn
      : [
          "Valid-until on the perk is final (computed at issue)",
          "Non-refundable for cash; redeem rules per store & system",
        ],
    storeScopeZh: input.storeScopeZh || "以活动适用门店为准",
    storeScopeEn: input.storeScopeEn || "As listed for this activity",
  };
}

/** 国庆专用：相对优先、默认无双重保护 */
export function computeNdpGiftExpiry(input: {
  obtainedAt: Date;
  validDays: number;
  activityEnd: Date;
  /** 默认 false */
  dualProtection?: boolean;
}): ValidityResult {
  return computeEntitlementExpiry({
    obtainedAt: input.obtainedAt,
    entitlementValidDays: input.validDays,
    activityValidDays: null,
    activityEnd: input.activityEnd,
    dualProtection: input.dualProtection === true,
    postActivityGraceDays: 0,
  });
}

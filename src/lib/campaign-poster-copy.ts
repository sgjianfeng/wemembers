/**
 * 活动广告卖点文案（数据驱动）
 * 从 type / rulesSnapshot / voucherTiers 生成台卡、海报、分享文案。
 * 商家最多可改一行 customSubline。
 */

import {
  isDrawSnapshot,
  parseRulesSnapshot,
  type RulesSnapshot,
} from "@/lib/templates";
import { isFestivalNdpCampaign } from "@/lib/visual-templates";
import { NDP_VALID_DAYS, ndpPosterTermsLine } from "@/lib/ndp-promo";

export type CampaignPosterLang = "zh" | "en";

export type CampaignPosterInput = {
  type: string;
  name: string;
  endDate: string | Date;
  rulesSnapshot?: string | null;
  voucherTiers?: string | null;
  description?: string | null;
  lang: CampaignPosterLang;
  /** 商家可选一行副标题，覆盖默认 sub */
  customSubline?: string | null;
  tags?: string | null;
};

export type CampaignPosterCopy = {
  isDraw: boolean;
  /** 主行动标题 */
  headline: string;
  /** 利益点大字：面额 / 折扣 / 档位 */
  benefitLine: string;
  /** 副文案（动作说明） */
  sub: string;
  /**
   * 广告钩子语（国庆等）：更抓眼球，放在 QR 上方
   * 例：本单满就送 · 下次再来吃
   */
  hookLine?: string | null;
  /** 卖点小标签，最多 3 条 */
  hookPills?: string[] | null;
  /** 档位一行，无则 null */
  tiersLine: string | null;
  /** 活动至 */
  untilLine: string;
  /** 截止日短标签 */
  untilShort: string;
  /**
   * 海报底部精简条款（国庆等）：领后天数 / 不可叠优惠 / 一桌一券 等
   * 非国庆为 null
   */
  termsLine?: string | null;
  discountPercent: number;
  tierAmountsSgd: number[];
  /** WhatsApp / 社交 3 条文案模板（含 {url} 占位） */
  shareTemplates: string[];
};

/** 面额列表展示：S$10 / S$50 / S$100 */
export function formatSgdList(amounts: number[]): string {
  if (!amounts.length) return "";
  return amounts
    .map((a) => {
      const n = Number(a);
      if (!Number.isFinite(n)) return "";
      return Number.isInteger(n) ? `S$${n}` : `S$${n.toFixed(2)}`;
    })
    .filter(Boolean)
    .join(" / ");
}

/** 折扣后实付（SGD） */
export function paidAfterDiscount(
  faceSgd: number,
  discountPercent: number
): number {
  const d = Math.min(100, Math.max(0, Math.round(discountPercent)));
  const paid = faceSgd * (100 - d) / 100;
  return Math.round(paid * 100) / 100;
}

function formatPaidSgd(n: number): string {
  return Number.isInteger(n) ? `S$${n}` : `S$${n.toFixed(2)}`;
}

/**
 * 从 rulesSnapshot.enabledTiers 或 voucherTiers JSON 提取档位（SGD 整数/小数）。
 */
export function extractTierAmountsSgd(
  voucherTiers: string | null | undefined,
  rules: RulesSnapshot | null
): number[] {
  if (rules?.enabledTiers?.length) {
    return uniqueSorted(
      rules.enabledTiers.map(Number).filter((n) => Number.isFinite(n) && n > 0)
    );
  }
  if (!voucherTiers) return [];
  try {
    const arr = JSON.parse(voucherTiers) as unknown;
    if (!Array.isArray(arr)) return [];
    const amounts: number[] = [];
    for (const row of arr) {
      if (row == null || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      if (typeof o.amountSgd === "number") {
        amounts.push(o.amountSgd);
        continue;
      }
      if (typeof o.min === "number") {
        amounts.push(o.min);
        continue;
      }
      if (typeof o.max === "number") {
        amounts.push(o.max);
      }
    }
    return uniqueSorted(amounts.filter((n) => Number.isFinite(n) && n > 0));
  } catch {
    return [];
  }
}

function uniqueSorted(nums: number[]): number[] {
  return [...new Set(nums.map((n) => Math.round(n * 100) / 100))].sort(
    (a, b) => a - b
  );
}

function isDrawType(type: string, rules: RulesSnapshot | null): boolean {
  if (rules && isDrawSnapshot(rules)) return true;
  return type === "lucky_draw_v2" || type === "lucky_draw";
}

function formatUntil(
  endDate: string | Date,
  lang: CampaignPosterLang
): { untilLine: string; untilShort: string } {
  const d = endDate instanceof Date ? endDate : new Date(endDate);
  const untilShort = Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(lang === "en" ? "en-SG" : "zh-CN");
  return {
    untilShort,
    untilLine:
      lang === "en" ? `Until ${untilShort}` : `活动至 ${untilShort}`,
  };
}

/**
 * 生成活动印刷/分享卖点文案。
 */
export function buildCampaignPosterCopy(
  input: CampaignPosterInput
): CampaignPosterCopy {
  const lang = input.lang;
  const rules = parseRulesSnapshot(input.rulesSnapshot);
  const isDraw = isDrawType(input.type, rules);
  const discountPercent =
    rules?.allowDiscount && rules.discountPercent > 0
      ? Math.round(rules.discountPercent)
      : 0;
  const tierAmountsSgd = extractTierAmountsSgd(input.voucherTiers, rules);
  const { untilLine, untilShort } = formatUntil(input.endDate, lang);
  const tiersLine = tierAmountsSgd.length
    ? formatSgdList(tierAmountsSgd)
    : null;

  let headline: string;
  let benefitLine: string;
  let sub: string;

  const isNdp = isFestivalNdpCampaign(
    input.type,
    input.name,
    input.tags
  );

  // 从名称解析「满120送61」类文案
  const spendGet =
    input.name.match(/满\s*(\d+)\s*送\s*(\d+)/) ||
    input.name.match(/spend\s*\$?\s*(\d+)\s*get\s*\$?\s*(\d+)/i);
  const minSpend = spendGet ? Number(spendGet[1]) : 120;
  const giftAmt = spendGet ? Number(spendGet[2]) : 61;

  let hookLine: string | null = null;
  let hookPills: string[] | null = null;
  let termsLine: string | null = null;

  if (isNdp) {
    // 对齐顾客落地页 + 广告钩子（SG61 国庆意象）
    headline =
      lang === "en"
        ? "Scan · claim your gift"
        : "扫码领取 · 本单满赠";
    benefitLine =
      lang === "en"
        ? `S$${minSpend} → S$${giftAmt} · SG${giftAmt}`
        : `S$${minSpend} → S$${giftAmt} · SG${giftAmt}`;
    // 台卡空间紧：副文案直接带关键条款，避免只改 termsLine 却被旧预览漏掉
    sub =
      lang === "en"
        ? `S$${giftAmt} next visit · ${NDP_VALID_DAYS}d after claim · no stacking · 1/table (≤4)`
        : `S$${giftAmt} 下次再用 · 领后${NDP_VALID_DAYS}天 · 不可叠优惠 · 一桌一券(≤4人)`;
    // 钩子语：短、口语、抓眼球（非官方口号抄袭，原创促销向）
    // 稍短，避免竖版中间换行只剩「S$61」单独一行
    hookLine =
      lang === "en"
        ? `SG${giftAmt} · Spend S$${minSpend} get S$${giftAmt}`
        : `本单满 S$${minSpend} 送 S$${giftAmt} · 庆 SG${giftAmt}`;
    hookPills =
      lang === "en"
        ? [
            "Scan at the table",
            `Valid ${NDP_VALID_DAYS} days`,
            "1 table · ≤4 guests",
          ]
        : ["桌边扫一扫", `领后${NDP_VALID_DAYS}天有效`, "一桌一券·4人内"];
    termsLine = ndpPosterTermsLine(lang);
  } else if (isDraw) {
    headline =
      lang === "en" ? "Buy · instant prize · 100% win" : "买就抽 · 100% 有奖";
    benefitLine = tiersLine
      ? lang === "en"
        ? `${tiersLine} · pick a tier`
        : `${tiersLine} 任选`
      : lang === "en"
        ? "Lucky draw voucher"
        : "购券抽奖";
    sub =
      lang === "en"
        ? "Instant small prize + balance to redeem in store"
        : "当场小奖 + 余额到店核销 · 赢取奖品";
  } else {
    headline =
      lang === "en" ? "Scan to buy voucher" : "扫码购买代金券";
    if (tierAmountsSgd.length === 1) {
      const face = tierAmountsSgd[0];
      if (discountPercent > 0) {
        const paid = paidAfterDiscount(face, discountPercent);
        benefitLine =
          lang === "en"
            ? `${formatPaidSgd(face)} face · pay ~${formatPaidSgd(paid)}`
            : `${formatPaidSgd(face)} 代金 · 现付约 ${formatPaidSgd(paid)}`;
      } else {
        benefitLine =
          lang === "en"
            ? `${formatPaidSgd(face)} voucher`
            : `${formatPaidSgd(face)} 代金券`;
      }
    } else if (tierAmountsSgd.length > 1) {
      if (discountPercent > 0) {
        benefitLine =
          lang === "en"
            ? `${tiersLine} · ${discountPercent}% off`
            : `${tiersLine} · ${discountPercent}% 折扣`;
      } else {
        benefitLine =
          lang === "en"
            ? `${tiersLine} · pick face value`
            : `${tiersLine} 任选面额`;
      }
    } else if (discountPercent > 0) {
      benefitLine =
        lang === "en"
          ? `Exclusive voucher · ${discountPercent}% off`
          : `专属代金券 · ${discountPercent}% 折扣`;
    } else {
      benefitLine =
        lang === "en" ? "Exclusive voucher" : "专属代金券 · 到店核销";
    }
    sub =
      lang === "en"
        ? "Balance redeemable at this brand · no draw"
        : "到店当余额花 · 不抽奖";
  }

  if (input.customSubline?.trim()) {
    sub = input.customSubline.trim().slice(0, 80);
  }

  const name = input.name.slice(0, 40);
  const faceHint = tiersLine || (lang === "en" ? "voucher" : "代金券");
  const shareTemplates =
    lang === "en"
      ? isNdp
        ? [
            `${name} — scan to join · redeem in store: {url}`,
            `National Day: spend S$${minSpend} → gift S$${giftAmt}. Scan: {url}`,
            `Until ${untilShort} · National Day gift promo: {url}`,
          ]
        : isDraw
        ? [
            `${name}: buy a tier, instant prize + store balance. Scan: {url}`,
            `Lucky draw at ${name} — ${faceHint}. 100% win rate. {url}`,
            `Join ${name} before ${untilShort}: buy · win · redeem in store. {url}`,
          ]
        : [
            `${name}: great value voucher ${faceHint}. Scan to buy: {url}`,
            discountPercent > 0
              ? `${name} — ${discountPercent}% off vouchers (${faceHint}). Limited: {url}`
              : `${name} voucher (${faceHint}). Redeem in store: {url}`,
            `Grab ${name} before ${untilShort}. Scan: {url}`,
          ]
      : isNdp
        ? [
            // 名称已含「满120送61」时不再重复利益点
            `【${name}】扫码参加 · 到店核销：{url}`,
            `国庆满赠 · 满 S$${minSpend} 送 S$${giftAmt} 赠券，扫码：{url}`,
            `活动至 ${untilShort}｜扫码领国庆活动：{url}`,
          ]
        : isDraw
        ? [
            `【${name}】买券就抽，当场有奖 + 余额到店核！扫码：{url}`,
            `${name} 抽奖进行中 · ${faceHint} · 100% 有奖 → {url}`,
            `限时至 ${untilShort}｜${name} 购券抽奖：{url}`,
          ]
        : [
            `【${name}】超值代金 ${faceHint}，扫码购买：{url}`,
            discountPercent > 0
              ? `${name} · ${discountPercent}% 折扣代金（${faceHint}），手慢无：{url}`
              : `${name} 专属代金券（${faceHint}），到店核销：{url}`,
            `活动至 ${untilShort}｜${name} 购券：{url}`,
          ];

  return {
    isDraw,
    headline,
    benefitLine,
    sub,
    hookLine,
    hookPills,
    tiersLine,
    untilLine,
    untilShort,
    termsLine,
    discountPercent,
    tierAmountsSgd,
    shareTemplates,
  };
}

/** 把分享模板里的 {url} 换成真实链接 */
export function fillShareTemplate(template: string, url: string): string {
  return template.replace(/\{url\}/g, url);
}

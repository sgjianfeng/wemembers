/**
 * 企业默认活动目录（商业心智）
 *
 * 1. 长期券 — 原价代金（无门槛 / 门槛）
 * 2. 大奖倒计时 — 独享购券抽奖（奖池倒计时）
 * 3. 满赠 — 满 120 送 61 + 抽奖路径
 *
 * 与 Meow 试点 A1/A2/B + 满赠对齐。
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createVoucherProduct } from "@/lib/catalog";
import {
  buildSpendGetRulesSnapshot,
  defaultSpendGetActivityEnd,
  defaultSpendGetActivityStart,
  ensureSpendGetGiftCoupon,
  SPEND_GET_GIFT_CENTS,
  SPEND_GET_MIN_SPEND_CENTS,
  SPEND_GET_VALID_DAYS,
} from "@/lib/spend-get-issue";
import { DEFAULT_CAMPAIGN_DAYS, type DefaultPackKind } from "@/lib/store-defaults";

export type DefaultActivityCategory =
  | "long_term"
  | "grand_countdown"
  | "cashback"
  | "spend_get";

export type DefaultActivitySlot = {
  slot: string;
  category: DefaultActivityCategory;
  /** 产品包（满赠可无产品） */
  packKind?: DefaultPackKind;
  nameZh: string;
  nameEn: string;
  descriptionZh: string;
  descriptionEn: string;
  /** 顾客落地优先路径 */
  customerPath: "voucher" | "spend_get" | "cashback";
  /**
   * 开通时的默认状态。只有「9 折卡」与「消费返 + 抽奖」默认启用；
   * 其余留 draft 供商家一键开——新品牌一上来就 5 个活动会让后台显得杂乱。
   */
  defaultStatus: "active" | "draft";
};

export const DEFAULT_ACTIVITY_SLOTS: DefaultActivitySlot[] = [
  {
    slot: "long_face_open",
    category: "long_term",
    packKind: "face_open",
    nameZh: "原价代金",
    nameEn: "Face credit",
    descriptionZh: "付多少抵多少 · 到店核销 · 常年可卖 · 归入长期券",
    descriptionEn: "Pay face · spend in-store · under Long-term",
    customerPath: "voucher",
    defaultStatus: "draft",
  },
  {
    slot: "long_discount_10",
    category: "long_term",
    packKind: "discount_10",
    nameZh: "9折优惠卡",
    nameEn: "10% off card",
    descriptionZh: "付90得100 · 到店核销 · 常年可卖 · 归入长期券",
    descriptionEn: "Pay 90 get 100 · under Long-term",
    customerPath: "voucher",
    defaultStatus: "active",
  },
  {
    slot: "grand_countdown",
    category: "grand_countdown",
    packKind: "exclusive_ballot",
    nameZh: "大奖倒计时 · 独享购券抽奖",
    nameEn: "Grand countdown · exclusive draw",
    descriptionZh: "购 50/100 · 进奖池倒计时 · 可入箱票 · 热门展示",
    descriptionEn: "Buy 50/100 · pool countdown · ballot optional",
    customerPath: "voucher",
    defaultStatus: "draft",
  },
  {
    slot: "spend_get",
    category: "spend_get",
    nameZh: "满赠 · 满120送61",
    nameEn: "Spend & get · Spend 120 Get 61",
    descriptionZh:
      "本单原价，送下次消费用的额度 · 满多少送多少可自己改 · 默认满 S$120 送 S$61，领后 30 天有效",
    descriptionEn:
      "Full price today, credit for the next visit · thresholds are yours to set · default S$120 → S$61, valid 30 days",
    customerPath: "spend_get",
    defaultStatus: "draft",
  },
  {
    slot: "cashback_draw",
    category: "cashback",
    nameZh: "消费返 + 抽奖",
    nameEn: "Spend rewards + draw",
    descriptionZh:
      "顾客正常消费即返抵扣额度并获得抽奖机会 · 无需先买券 · 默认返 3% + 抽奖 2%",
    descriptionEn:
      "Earn credit and a draw on every purchase · no voucher needed · default 3% + 2%",
    customerPath: "cashback",
    defaultStatus: "active",
  },
];

export function categoryLabel(
  cat: DefaultActivityCategory,
  lang: "zh" | "en"
): string {
  const map: Record<DefaultActivityCategory, { zh: string; en: string }> = {
    long_term: { zh: "长期券", en: "Long-term" },
    grand_countdown: { zh: "大奖倒计时", en: "Grand countdown" },
    cashback: { zh: "消费返 + 抽奖", en: "Spend rewards" },
    spend_get: { zh: "满赠", en: "Spend & get" },
  };
  return map[cat][lang];
}

/**
 * 三类商业心智（勿被 rules 里挂的满赠联动字段误判）。
 * 优先级：满赠 → 大奖倒计时 → 长期券。
 */
export function detectActivityCategory(input: {
  type?: string | null;
  name?: string | null;
  tags?: string | null;
  rulesSnapshot?: string | null;
  packKind?: string | null;
}): DefaultActivityCategory | "other" {
  const pack =
    input.packKind || packKindInSnapshot(input.rulesSnapshot || null);
  const tags = input.tags || "";

  // 1) 满赠：按 type 与显式 tag 判定。
  //    不能单靠 rules 里的满赠块 —— 大奖活动也会挂满赠联动（核销自动发赠券）。
  //    `ndp|国庆|national` 是存量数据的兼容读，迁移脚本跑完即可删。
  if (
    input.type === "holiday" ||
    /category:spend_get|slot:spend_get/i.test(tags) ||
    /ndp|国庆|national/i.test(tags)
  ) {
    return "spend_get";
  }

  // 2) 大奖倒计时：独享购券 / 抽奖
  if (
    pack === "exclusive_ballot" ||
    input.type === "lucky_draw_v2" ||
    input.type === "lucky_draw" ||
    /exclusive_ballot|exclusive_draw/i.test(tags) ||
    (input.rulesSnapshot &&
      /exclusive_ballot|"kind"\s*:\s*"draw"/i.test(input.rulesSnapshot) &&
      !/discount_voucher|face_open|face_threshold|discount_10/.test(input.rulesSnapshot))
  ) {
    return "grand_countdown";
  }

  // 3) 长期券：原价代金 / 门槛 / 9 折卡 / 其它 shelf voucher
  if (
    pack === "discount_voucher" ||
    pack === "face_open" ||
    pack === "face_threshold" ||
    pack === "discount_10" ||
    input.type === "voucher_sale" ||
    /discount_voucher|face_open|face_threshold|discount_10|shelf|scope:store/i.test(tags) ||
    (input.rulesSnapshot &&
      /discount_voucher|face_open|face_threshold|discount_10/.test(input.rulesSnapshot))
  ) {
    return "long_term";
  }

  return "other";
}

function packKindInSnapshot(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { packKind?: string };
    return o.packKind || null;
  } catch {
    return null;
  }
}

/**
 * 为一家企业补齐默认活动（幂等：已有同类则跳过）
 */
export async function ensureDefaultActivities(
  businessId: string,
  opts?: { lang?: "zh" | "en"; forceSpendGetRefresh?: boolean }
): Promise<{
  created: string[];
  existing: string[];
  spendGetCampaignId: string | null;
  grandCampaignSlug: string | null;
  slots: Array<{
    slot: string;
    category: DefaultActivityCategory;
    campaignId?: string;
    productId?: string;
    slug?: string | null;
    status: "created" | "existing";
  }>;
}> {
  const lang = opts?.lang || "zh";
  const created: string[] = [];
  const existing: string[] = [];
  const slots: Array<{
    slot: string;
    category: DefaultActivityCategory;
    campaignId?: string;
    productId?: string;
    slug?: string | null;
    status: "created" | "existing";
  }> = [];

  const products = await prisma.voucherProduct.findMany({
    where: { businessId, status: { not: "archived" } },
    select: {
      id: true,
      name: true,
      slug: true,
      rulesSnapshot: true,
      type: true,
      mirrorCampaignId: true,
    },
  });

  const activities = await prisma.campaign.findMany({
    where: {
      businessId,
      role: { not: "product_mirror" },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      tags: true,
      rulesSnapshot: true,
      status: true,
    },
  });

  let grandCampaignSlug: string | null = null;
  let spendGetCampaignId: string | null = null;

  for (const slot of DEFAULT_ACTIVITY_SLOTS) {
    if (slot.packKind) {
      const hasProduct = products.some(
        (p) => packKindInSnapshot(p.rulesSnapshot) === slot.packKind
      );
      const hasActivity = activities.some((a) => {
        const pk = packKindInSnapshot(a.rulesSnapshot);
        return pk === slot.packKind;
      });

      if (hasProduct || hasActivity) {
        existing.push(slot.slot);
        const prod = products.find(
          (p) => packKindInSnapshot(p.rulesSnapshot) === slot.packKind
        );
        const act = activities.find(
          (a) => packKindInSnapshot(a.rulesSnapshot) === slot.packKind
        );
        if (slot.category === "grand_countdown") {
          grandCampaignSlug = act?.slug || prod?.slug || grandCampaignSlug;
        }
        slots.push({
          slot: slot.slot,
          category: slot.category,
          campaignId: act?.id,
          productId: prod?.id,
          slug: act?.slug || prod?.slug,
          status: "existing",
        });
        continue;
      }

      const name = lang === "en" ? slot.nameEn : slot.nameZh;
      const description = lang === "en" ? slot.descriptionEn : slot.descriptionZh;
      const product = await createVoucherProduct(businessId, {
        name,
        description,
        packKind: slot.packKind,
        status: slot.defaultStatus,
        createShelfActivity: true,
      });
      created.push(slot.slot);

      // 刷新活动 tags 加上 category
      const shelf = await prisma.campaign.findFirst({
        where: {
          businessId,
          role: "activity",
          catalogProducts: { some: { productId: product.id } },
        },
        orderBy: { createdAt: "desc" },
      });
      if (shelf) {
        let tags: string[] = [];
        try {
          tags = JSON.parse(shelf.tags || "[]") as string[];
          if (!Array.isArray(tags)) tags = [];
        } catch {
          tags = [];
        }
        tags = [
          ...new Set([
            ...tags,
            `category:${slot.category}`,
            `slot:${slot.slot}`,
            "default_activity",
          ]),
        ];
        await prisma.campaign.update({
          where: { id: shelf.id },
          data: { tags: JSON.stringify(tags) },
        });
        if (slot.category === "grand_countdown") {
          grandCampaignSlug = shelf.slug || product.slug;
        }
        slots.push({
          slot: slot.slot,
          category: slot.category,
          campaignId: shelf.id,
          productId: product.id,
          slug: shelf.slug || product.slug,
          status: "created",
        });
      } else {
        slots.push({
          slot: slot.slot,
          category: slot.category,
          productId: product.id,
          slug: product.slug,
          status: "created",
        });
      }
      continue;
    }

    // ── 活动 2：消费返 + 抽奖（Campaign，非 VoucherProduct）──
    if (slot.category === "cashback") {
      const found = activities.find((a) => a.type === "cashback");
      if (found) {
        existing.push(slot.slot);
        slots.push({
          slot: slot.slot,
          category: "cashback",
          campaignId: found.id,
          slug: found.slug,
          status: "existing",
        });
        continue;
      }

      const { DEFAULT_CASHBACK_RULES, CASHBACK_INACTIVITY_MONTHS } =
        await import("@/lib/cashback");
      const now = new Date();
      const end = new Date(now.getTime() + DEFAULT_CAMPAIGN_DAYS * 86400_000);
      const cb = await prisma.campaign.create({
        data: {
          businessId,
          name: lang === "en" ? slot.nameEn : slot.nameZh,
          description:
            lang === "en" ? slot.descriptionEn : slot.descriptionZh,
          type: "cashback",
          role: "activity",
          status: slot.defaultStatus,
          startDate: now,
          endDate: end,
          productKind: "self_use",
          budgetPercent: 0,
          joinable: false,
          allowCollaboration: false,
          slug: `cashback-${businessId.slice(-8)}`,
          tags: JSON.stringify([
            `category:${slot.category}`,
            `slot:${slot.slot}`,
            "default_activity",
          ]),
          rulesSnapshot: JSON.stringify({
            kind: "cashback",
            cashbackPercent: DEFAULT_CASHBACK_RULES.cashbackPercent,
            drawPercent: DEFAULT_CASHBACK_RULES.drawPercent,
            instantPoolRatio: DEFAULT_CASHBACK_RULES.instantPoolRatio,
            grandPoolRatio: DEFAULT_CASHBACK_RULES.grandPoolRatio,
            minSpendCents: 0,
            ticketsPerUnit: 1,
            avgTicketCents: DEFAULT_CASHBACK_RULES.avgTicketCents,
            cashbackInactivityMonths: CASHBACK_INACTIVITY_MONTHS,
            snapshottedAt: now.toISOString(),
          }),
        },
        select: { id: true, slug: true },
      });
      created.push(slot.slot);
      slots.push({
        slot: slot.slot,
        category: "cashback",
        campaignId: cb.id,
        slug: cb.slug,
        status: "created",
      });
      continue;
    }

    // ── 满赠活动 ──
    if (slot.category === "spend_get") {
      let sgCamp = activities.find(
        (a) => detectActivityCategory(a) === "spend_get"
      );
      if (sgCamp && !opts?.forceSpendGetRefresh) {
        existing.push(slot.slot);
        spendGetCampaignId = sgCamp.id;
        slots.push({
          slot: slot.slot,
          category: "spend_get",
          campaignId: sgCamp.id,
          slug: sgCamp.slug,
          status: "existing",
        });
        continue;
      }

      // 关联大奖购券 slug
      if (!grandCampaignSlug) {
        const grand = activities.find(
          (a) => detectActivityCategory(a) === "grand_countdown"
        );
        grandCampaignSlug = grand?.slug || null;
        if (!grandCampaignSlug) {
          const gp = products.find(
            (p) => packKindInSnapshot(p.rulesSnapshot) === "exclusive_ballot"
          );
          grandCampaignSlug = gp?.slug || null;
        }
      }

      // 满赠默认窗口：从今天起 365 天（不再绑国庆档期）
      const start = defaultSpendGetActivityStart();
      const end = defaultSpendGetActivityEnd();
      const rulesSnapshot = buildSpendGetRulesSnapshot({
        buyVoucherSlug: grandCampaignSlug,
        enabled: true,
      });
      const name = lang === "en" ? slot.nameEn : slot.nameZh;
      const description =
        lang === "en" ? slot.descriptionEn : slot.descriptionZh;
      const baseSlug = `spend-get-${businessId.slice(-6)}`;

      if (sgCamp) {
        sgCamp = await prisma.campaign.update({
          where: { id: sgCamp.id },
          data: {
            name,
            description,
            type: "holiday",
            status: slot.defaultStatus,
            role: "activity",
            tags: JSON.stringify([
              "spend_get",
              "spend_get",
              "满赠",
              "category:spend_get",
              "slot:spend_get",
              "default_activity",
            ]),
            rulesSnapshot,
            minSpendCents: SPEND_GET_MIN_SPEND_CENTS,
            startDate: start,
            endDate: end,
            ...(sgCamp.slug ? {} : { slug: baseSlug }),
          },
        });
        existing.push(slot.slot);
      } else {
        let slug = baseSlug;
        for (let i = 0; i < 5; i++) {
          const taken = await prisma.campaign.findUnique({
            where: { slug },
            select: { id: true },
          });
          if (!taken) break;
          slug = `${baseSlug}-${i + 1}`;
        }
        sgCamp = await prisma.campaign.create({
          data: {
            businessId,
            name,
            description,
            type: "holiday",
            status: slot.defaultStatus,
            role: "activity",
            slug,
            tags: JSON.stringify([
              "spend_get",
              "spend_get",
              "满赠",
              "category:spend_get",
              "slot:spend_get",
              "default_activity",
            ]),
            rulesSnapshot,
            minSpendCents: SPEND_GET_MIN_SPEND_CENTS,
            startDate: start,
            endDate: end,
            productKind: "self_use",
          },
        });
        created.push(slot.slot);
      }

      spendGetCampaignId = sgCamp.id;
      const templateUntil = new Date(end);
      templateUntil.setFullYear(templateUntil.getFullYear() + 1);
      await prisma.$transaction((tx: Prisma.TransactionClient) =>
        ensureSpendGetGiftCoupon(tx, {
          businessId,
          campaignId: sgCamp!.id,
          giftCouponCents: SPEND_GET_GIFT_CENTS,
          validDays: SPEND_GET_VALID_DAYS,
          templateValidUntil: templateUntil,
        })
      );

      // 大奖活动也挂满赠联动：核销时自动发赠券
      if (grandCampaignSlug) {
        const buyCamp = await prisma.campaign.findFirst({
          where: {
            businessId,
            OR: [{ slug: grandCampaignSlug }, { slug: `a-${grandCampaignSlug}` }],
          },
        });
        // also try product slug activity
        const buyByProduct = buyCamp
          ? buyCamp
          : await prisma.campaign.findFirst({
              where: {
                businessId,
                role: "activity",
                rulesSnapshot: { contains: "exclusive_ballot" },
              },
              orderBy: { createdAt: "desc" },
            });
        if (buyByProduct) {
          let snap: Record<string, unknown> = {};
          try {
            snap = buyByProduct.rulesSnapshot
              ? (JSON.parse(buyByProduct.rulesSnapshot) as Record<string, unknown>)
              : {};
          } catch {
            snap = {};
          }
          snap.spendGet = {
            enabled: true,
            minSpendCents: SPEND_GET_MIN_SPEND_CENTS,
            giftCouponCents: SPEND_GET_GIFT_CENTS,
            validDays: SPEND_GET_VALID_DAYS,
            giftWeightFactor: 0.2,
            buyVoucherSlug: buyByProduct.slug || grandCampaignSlug,
          };
          await prisma.campaign.update({
            where: { id: buyByProduct.id },
            data: { rulesSnapshot: JSON.stringify(snap) },
          });
          // 用真实 slug 刷新满赠规则
          await prisma.campaign.update({
            where: { id: sgCamp.id },
            data: {
              rulesSnapshot: buildSpendGetRulesSnapshot({
                buyVoucherSlug: buyByProduct.slug || grandCampaignSlug,
                enabled: true,
              }),
            },
          });
          grandCampaignSlug = buyByProduct.slug || grandCampaignSlug;
        }
      }

      slots.push({
        slot: slot.slot,
        category: "spend_get",
        campaignId: sgCamp.id,
        slug: sgCamp.slug,
        status: created.includes(slot.slot) ? "created" : "existing",
      });
    }
  }

  return {
    created,
    existing,
    spendGetCampaignId,
    grandCampaignSlug,
    slots,
  };
}

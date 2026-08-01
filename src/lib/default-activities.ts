/**
 * 企业默认活动目录（商业心智）
 *
 * 1. 长期券 — 原价代金（无门槛 / 门槛）
 * 2. 大奖倒计时 — 独享购券抽奖（奖池倒计时）
 * 3. 国庆满赠 — 满 120 送 61 + 抽奖路径
 *
 * 与 Meow 试点 A1/A2/B + NDP 对齐。
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createVoucherProduct } from "@/lib/catalog";
import {
  buildNdpRulesSnapshot,
  defaultNdpActivityEnd,
  defaultNdpActivityStart,
  ensureNdpGiftCoupon,
  NDP_GIFT_COUPON_CENTS,
  NDP_MIN_SPEND_CENTS,
  NDP_VALID_DAYS,
} from "@/lib/ndp-promo";
import type { DefaultPackKind } from "@/lib/store-defaults";

export type DefaultActivityCategory =
  | "long_term"
  | "grand_countdown"
  | "ndp";

export type DefaultActivitySlot = {
  slot: string;
  category: DefaultActivityCategory;
  /** 产品包（国庆可无产品） */
  packKind?: DefaultPackKind;
  nameZh: string;
  nameEn: string;
  descriptionZh: string;
  descriptionEn: string;
  /** 顾客落地优先路径 */
  customerPath: "voucher" | "ndp";
};

export const DEFAULT_ACTIVITY_SLOTS: DefaultActivitySlot[] = [
  {
    slot: "long_face_open",
    category: "long_term",
    packKind: "face_open",
    nameZh: "长期 · 原价代金（无门槛）",
    nameEn: "Evergreen · Face credit (no min)",
    descriptionZh: "付多少抵多少 · 到店核销 · 常年可卖",
    descriptionEn: "Pay face · spend in-store · always on",
    customerPath: "voucher",
  },
  {
    slot: "long_face_threshold",
    category: "long_term",
    packKind: "face_threshold",
    nameZh: "长期 · 原价代金（门槛）",
    nameEn: "Evergreen · Face credit (min spend)",
    descriptionZh: "付券面 · 账单约 ≥ 券面×10 可用 · 常年可卖",
    descriptionEn: "Face value · bill ≥ face×10 · always on",
    customerPath: "voucher",
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
  },
  {
    slot: "ndp_gift",
    category: "ndp",
    nameZh: "国庆满赠 · 满120送61",
    nameEn: "National Day · Spend 120 Get 61",
    descriptionZh:
      "满 S$120 送 S$61 下次用；领后 30 天有效；不可叠优惠；一桌一券（4 人内）；活动至 8 月 31 日",
    descriptionEn:
      "Spend S$120 get S$61 next visit; valid 30 days after claim; no stacking; 1/table (≤4); ends 31 Aug",
    customerPath: "ndp",
  },
];

export function categoryLabel(
  cat: DefaultActivityCategory,
  lang: "zh" | "en"
): string {
  const map: Record<DefaultActivityCategory, { zh: string; en: string }> = {
    long_term: { zh: "长期券", en: "Long-term" },
    grand_countdown: { zh: "大奖倒计时", en: "Grand countdown" },
    ndp: { zh: "国庆满赠", en: "National Day" },
  };
  return map[cat][lang];
}

/**
 * 三类商业心智（勿被 rules 里挂的 ndp 联动字段误判）。
 * 优先级：国庆满赠 → 大奖倒计时 → 长期券。
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
  const name = input.name || "";

  // 1) 国庆满赠：holiday / 名称 / 显式 tag（不要单靠 rules.ndp——大奖活动也会挂 ndp 联动）
  if (
    input.type === "holiday" ||
    /国庆|ndp|national/i.test(name) ||
    /ndp|国庆|national|slot:ndp/i.test(tags)
  ) {
    return "ndp";
  }

  // 2) 大奖倒计时：独享购券 / 抽奖
  if (
    pack === "exclusive_ballot" ||
    input.type === "lucky_draw_v2" ||
    input.type === "lucky_draw" ||
    /exclusive_ballot|exclusive_draw/i.test(tags) ||
    (input.rulesSnapshot &&
      /exclusive_ballot|"kind"\s*:\s*"draw"/i.test(input.rulesSnapshot) &&
      !/face_open|face_threshold|discount_10/.test(input.rulesSnapshot))
  ) {
    return "grand_countdown";
  }

  // 3) 长期券：原价代金 / 门槛 / 9 折卡 / 其它 shelf voucher
  if (
    pack === "face_open" ||
    pack === "face_threshold" ||
    pack === "discount_10" ||
    input.type === "voucher_sale" ||
    /face_open|face_threshold|discount_10|shelf|scope:store/i.test(tags) ||
    (input.rulesSnapshot &&
      /face_open|face_threshold|discount_10/.test(input.rulesSnapshot))
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
  opts?: { lang?: "zh" | "en"; forceNdpRefresh?: boolean }
): Promise<{
  created: string[];
  existing: string[];
  ndpCampaignId: string | null;
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
  let ndpCampaignId: string | null = null;

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
        status: "active",
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

    // ── NDP holiday activity ──
    if (slot.category === "ndp") {
      let ndp = activities.find(
        (a) => detectActivityCategory(a) === "ndp"
      );
      if (ndp && !opts?.forceNdpRefresh) {
        existing.push(slot.slot);
        ndpCampaignId = ndp.id;
        slots.push({
          slot: slot.slot,
          category: "ndp",
          campaignId: ndp.id,
          slug: ndp.slug,
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

      // 国庆窗口：8/1–8/31（新加坡），非 start+2 个月
      const start = defaultNdpActivityStart();
      const end = defaultNdpActivityEnd();
      const rulesSnapshot = buildNdpRulesSnapshot({
        buyVoucherSlug: grandCampaignSlug,
        enabled: true,
      });
      const name = lang === "en" ? slot.nameEn : slot.nameZh;
      const description =
        lang === "en" ? slot.descriptionEn : slot.descriptionZh;
      const baseSlug = `ndp-${businessId.slice(-6)}-${end.getUTCFullYear()}`;

      if (ndp) {
        ndp = await prisma.campaign.update({
          where: { id: ndp.id },
          data: {
            name,
            description,
            type: "holiday",
            status: "active",
            role: "activity",
            tags: JSON.stringify([
              "ndp",
              "national-day",
              "国庆",
              "category:ndp",
              "slot:ndp_gift",
              "default_activity",
            ]),
            rulesSnapshot,
            minSpendCents: NDP_MIN_SPEND_CENTS,
            startDate: start,
            endDate: end,
            ...(ndp.slug ? {} : { slug: baseSlug }),
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
        ndp = await prisma.campaign.create({
          data: {
            businessId,
            name,
            description,
            type: "holiday",
            status: "active",
            role: "activity",
            slug,
            tags: JSON.stringify([
              "ndp",
              "national-day",
              "国庆",
              "category:ndp",
              "slot:ndp_gift",
              "default_activity",
            ]),
            rulesSnapshot,
            minSpendCents: NDP_MIN_SPEND_CENTS,
            startDate: start,
            endDate: end,
            productKind: "self_use",
          },
        });
        created.push(slot.slot);
      }

      ndpCampaignId = ndp.id;
      const templateUntil = new Date(end);
      templateUntil.setFullYear(templateUntil.getFullYear() + 1);
      await prisma.$transaction((tx: Prisma.TransactionClient) =>
        ensureNdpGiftCoupon(tx, {
          businessId,
          campaignId: ndp!.id,
          giftCouponCents: NDP_GIFT_COUPON_CENTS,
          templateValidUntil: templateUntil,
        })
      );

      // 大奖活动也打上 ndp 核销自动发 61
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
          snap.ndp = {
            enabled: true,
            minSpendCents: NDP_MIN_SPEND_CENTS,
            giftCouponCents: NDP_GIFT_COUPON_CENTS,
            validDays: NDP_VALID_DAYS,
            giftWeightFactor: 0.2,
            buyVoucherSlug: buyByProduct.slug || grandCampaignSlug,
          };
          await prisma.campaign.update({
            where: { id: buyByProduct.id },
            data: { rulesSnapshot: JSON.stringify(snap) },
          });
          // refresh NDP rules with real slug
          await prisma.campaign.update({
            where: { id: ndp.id },
            data: {
              rulesSnapshot: buildNdpRulesSnapshot({
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
        category: "ndp",
        campaignId: ndp.id,
        slug: ndp.slug,
        status: created.includes(slot.slot) ? "created" : "existing",
      });
    }
  }

  return {
    created,
    existing,
    ndpCampaignId,
    grandCampaignSlug,
    slots,
  };
}

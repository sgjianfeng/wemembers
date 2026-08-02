/**
 * 为每个企业确保「9折优惠卡」产品+活动；
 * 并把原价 face 包标成 listScope=store（不进首页热门）。
 *
 * node scripts/ensure-store-discount-card.mjs
 */
import { PrismaClient } from "@prisma/client";

// Inline snapshots (script runs without TS path imports)
const prisma = new PrismaClient();

const TIERS = [10, 20, 50, 100, 200];
const DISCOUNT = 10;

function snapDiscount10() {
  return {
    templateId: "self_use_voucher",
    kind: "voucher_discount",
    allowDiscount: true,
    discountPercent: DISCOUNT,
    sellerCommissionPercent: 0,
    platformFeePercent: 0,
    prizePoolPercent: 0,
    shareSellingEnabled: false,
    campaignType: "voucher_sale",
    instantPoolRatio: 0,
    midPoolRatio: 0,
    grandPoolRatio: 0,
    enabledTiers: TIERS,
    prizePackId: "none",
    minSpendMultiplier: 0,
    productKind: "self_use",
    packKind: "discount_10",
    listScope: "store",
    snapshottedAt: new Date().toISOString(),
  };
}

function tiersJson(amounts) {
  return amounts.map((sgd) => ({
    min: sgd,
    max: sgd,
    tier: sgd >= 100 ? "large" : sgd >= 50 ? "medium" : "small",
    instantPrizeCap: 0,
  }));
}

function slugify(base) {
  return (
    String(base)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || "offer"
  );
}

async function uniqueSlug(preferred) {
  let slug = preferred.slice(0, 48);
  for (let i = 0; i < 8; i++) {
    const taken =
      (await prisma.voucherProduct.findUnique({ where: { slug } })) ||
      (await prisma.campaign.findUnique({ where: { slug } }));
    if (!taken) return slug;
    slug = `${preferred.slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${preferred}-${Date.now().toString(36)}`;
}

async function markFaceAsStoreOnly(businessId) {
  const products = await prisma.voucherProduct.findMany({
    where: {
      businessId,
      OR: [
        { name: { contains: "原价" } },
        { slug: { contains: "face-open" } },
        { slug: { contains: "face-threshold" } },
      ],
    },
  });
  for (const p of products) {
    let snap = {};
    try {
      snap = p.rulesSnapshot ? JSON.parse(p.rulesSnapshot) : {};
    } catch {
      snap = {};
    }
    const isThreshold =
      p.name.includes("门槛") ||
      (p.slug || "").includes("threshold") ||
      snap.packKind === "face_threshold";
    snap.packKind = isThreshold ? "face_threshold" : "face_open";
    snap.listScope = "store";
    if (snap.discountPercent == null) snap.discountPercent = 0;
    await prisma.voucherProduct.update({
      where: { id: p.id },
      data: { rulesSnapshot: JSON.stringify(snap) },
    });
    if (p.mirrorCampaignId) {
      await prisma.campaign.update({
        where: { id: p.mirrorCampaignId },
        data: { rulesSnapshot: JSON.stringify(snap) },
      });
    }
    // linked activities
    const links = await prisma.campaignProduct.findMany({
      where: { productId: p.id },
      select: { campaignId: true },
    });
    for (const l of links) {
      await prisma.campaign.update({
        where: { id: l.campaignId },
        data: {
          rulesSnapshot: JSON.stringify(snap),
          type: "voucher_sale",
        },
      });
    }
    console.log("  marked store-only:", p.name, p.slug);
  }
}

async function ensureDiscountCard(businessId, businessName) {
  // 勿用「9折」匹配门槛约9折原价券
  const existing = await prisma.voucherProduct.findFirst({
    where: {
      businessId,
      OR: [
        { slug: { contains: "discount-card" } },
        { slug: { contains: "discount-10" } },
        { name: "9折优惠卡" },
      ],
    },
  });
  if (existing) {
    console.log("  discount card exists:", existing.slug);
    // ensure rules
    let snap = {};
    try {
      snap = existing.rulesSnapshot ? JSON.parse(existing.rulesSnapshot) : {};
    } catch {
      snap = {};
    }
    if (
      snap.discountPercent !== DISCOUNT ||
      snap.packKind !== "discount_10" ||
      snap.listScope !== "store"
    ) {
      const next = {
        ...snapDiscount10(),
        ...snap,
        discountPercent: DISCOUNT,
        packKind: "discount_10",
        listScope: "store",
      };
      await prisma.voucherProduct.update({
        where: { id: existing.id },
        data: {
          rulesSnapshot: JSON.stringify(next),
          voucherTiers: JSON.stringify(tiersJson(TIERS)),
          status: "active",
        },
      });
    }
    // 确保挂在「长期券」活动下，而非独立 shelf
    await attachToLongTerm(businessId, existing.id);
    return existing;
  }

  const snap = snapDiscount10();
  const name = "9折优惠卡";
  const slug = await uniqueSlug(
    `${slugify(businessName || "store")}-discount-card-10`
  );
  const now = new Date();
  const end = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const mirror = await prisma.campaign.create({
    data: {
      businessId,
      name,
      description: "付90得100 · 档10/20/50/100/200 · 到店核销",
      type: "voucher_sale",
      role: "product_mirror",
      color: "#10B981",
      startDate: now,
      endDate: end,
      status: "active",
      productKind: "self_use",
      templateId: "self_use_voucher",
      rulesSnapshot: JSON.stringify(snap),
      voucherTiers: JSON.stringify(tiersJson(TIERS)),
      slug: `m-${slug}`,
      storeIds: null,
      tags: JSON.stringify(["product_mirror", "discount_10", "scope:store"]),
    },
  });

  const product = await prisma.voucherProduct.create({
    data: {
      businessId,
      name,
      description: "付90得100 · 档10/20/50/100/200 · 到店核销",
      type: "voucher_sale",
      productKind: "self_use",
      status: "active",
      slug,
      templateId: "self_use_voucher",
      rulesSnapshot: JSON.stringify(snap),
      voucherTiers: JSON.stringify(tiersJson(TIERS)),
      color: "#10B981",
      mirrorCampaignId: mirror.id,
    },
  });

  await attachToLongTerm(businessId, product.id);
  console.log("  created discount card under 长期券:", slug);
  return product;
}

/** 9 折 / 原价等门店基础产品挂到统一「长期券」活动 */
async function attachToLongTerm(businessId, productId) {
  const stores = await prisma.store.findMany({
    where: { businessId },
    select: { id: true },
  });
  let longTerm = await prisma.campaign.findFirst({
    where: {
      businessId,
      role: "activity",
      status: { in: ["active", "draft"] },
      OR: [
        { name: "长期券" },
        { name: { startsWith: "长期券" } },
        { tags: { contains: "category:long_term" } },
        { tags: { contains: "face_open" } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  const now = new Date();
  const end = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  if (!longTerm) {
    longTerm = await prisma.campaign.create({
      data: {
        businessId,
        name: "长期券",
        description: "原价代金 · 9折卡等门店常年可售 · 进店可见",
        type: "voucher_sale",
        role: "activity",
        color: "#1A6EFF",
        startDate: now,
        endDate: end,
        status: "active",
        productKind: "self_use",
        templateId: "self_use_voucher",
        rulesSnapshot: JSON.stringify(snapDiscount10()),
        slug: `a-long-term-${businessId.slice(-6)}`,
        storeIds: JSON.stringify(stores.map((s) => s.id)),
        tags: JSON.stringify([
          "activity",
          "shelf",
          "category:long_term",
          "long_term",
          "default_activity",
          "scope:store",
        ]),
      },
    });
    console.log("  created 长期券 activity", longTerm.slug);
  } else if (longTerm.name !== "长期券") {
    await prisma.campaign.update({
      where: { id: longTerm.id },
      data: {
        name: "长期券",
        status: "active",
        tags: JSON.stringify([
          ...new Set([
            ...(() => {
              try {
                const t = JSON.parse(longTerm.tags || "[]");
                return Array.isArray(t) ? t : [];
              } catch {
                return [];
              }
            })(),
            "category:long_term",
            "long_term",
            "shelf",
          ]),
        ]),
      },
    });
  }

  const link = await prisma.campaignProduct.findFirst({
    where: { campaignId: longTerm.id, productId },
  });
  if (!link) {
    const max = await prisma.campaignProduct.aggregate({
      where: { campaignId: longTerm.id },
      _max: { sortOrder: true },
    });
    await prisma.campaignProduct.create({
      data: {
        campaignId: longTerm.id,
        productId,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    console.log("  linked product → 长期券");
  }

  // 摘除其它独立 9 折 shelf 活动上的链接
  const otherLinks = await prisma.campaignProduct.findMany({
    where: { productId, campaignId: { not: longTerm.id } },
    include: { campaign: { select: { id: true, name: true, tags: true, status: true } } },
  });
  for (const l of otherLinks) {
    await prisma.campaignProduct.delete({ where: { id: l.id } });
    const tags = (() => {
      try {
        const t = JSON.parse(l.campaign.tags || "[]");
        return Array.isArray(t) ? t : [];
      } catch {
        return [];
      }
    })();
    await prisma.campaign.update({
      where: { id: l.campaignId },
      data: {
        status: "ended",
        tags: JSON.stringify([
          ...new Set([...tags, "archived_cleanup", "merged_to_long_term"]),
        ]),
      },
    });
    console.log("  unlinked from old activity", l.campaign.name);
  }
}

async function fixExclusiveActivityTypes(businessId) {
  // Ensure exclusive draw activities/products are lucky_draw_v2 not voucher_sale
  const products = await prisma.voucherProduct.findMany({
    where: {
      businessId,
      OR: [
        { type: "lucky_draw_v2" },
        { name: { contains: "独享" } },
        { name: { contains: "抽奖" } },
        { slug: { contains: "exclusive" } },
        { slug: { contains: "ballot" } },
      ],
    },
  });
  for (const p of products) {
    let snap = {};
    try {
      snap = p.rulesSnapshot ? JSON.parse(p.rulesSnapshot) : {};
    } catch {
      snap = {};
    }
    if (
      snap.packKind === "exclusive_ballot" ||
      p.type === "lucky_draw_v2" ||
      p.name.includes("独享") ||
      p.name.includes("抽奖")
    ) {
      snap.packKind = snap.packKind || "exclusive_ballot";
      snap.listScope = "hot";
      await prisma.voucherProduct.update({
        where: { id: p.id },
        data: {
          type: "lucky_draw_v2",
          rulesSnapshot: JSON.stringify(snap),
        },
      });
      if (p.mirrorCampaignId) {
        await prisma.campaign.update({
          where: { id: p.mirrorCampaignId },
          data: {
            type: "lucky_draw_v2",
            rulesSnapshot: JSON.stringify(snap),
          },
        });
      }
      const links = await prisma.campaignProduct.findMany({
        where: { productId: p.id },
      });
      for (const l of links) {
        await prisma.campaign.update({
          where: { id: l.campaignId },
          data: {
            type: "lucky_draw_v2",
            rulesSnapshot: JSON.stringify(snap),
          },
        });
      }
      console.log("  fixed draw type:", p.name);
    }
  }
}

async function main() {
  const businesses = await prisma.user.findMany({
    where: { role: "business", status: "active" },
    select: { id: true, businessName: true },
  });
  console.log("businesses", businesses.length);
  for (const b of businesses) {
    console.log("→", b.businessName || b.id);
    await markFaceAsStoreOnly(b.id);
    await ensureDiscountCard(b.id, b.businessName || "store");
    await fixExclusiveActivityTypes(b.id);
  }
  console.log("done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Seed Meow BBQ pilot campaigns on the DB pointed by DATABASE_URL.
 *
 * Creates (idempotent by slug):
 *   A) meow-bbq-s10-voucher  — S$10 折扣代金 20% off · 无抽奖
 *   B) meow-bbq-draw-3tier   — 抽奖三档 50/100/200
 *   C) meow-bbq-s2-voucher   — S$2 代金 · 无折扣 · Live PayNow 验账
 *
 * Usage (prod):
 *   cd /var/www/wemembers/current && node scripts/seed-meow-pilot-campaigns.mjs
 * Or from laptop with prod DATABASE_URL in env.
 */
import { PrismaClient } from "@prisma/client";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Prefer compiled/built templates via dynamic path from source when running next to app
async function loadTemplates() {
  try {
    // When run from repo root after tsx/transpile isn't available, inline snapshot builders
    return null;
  } catch {
    return null;
  }
}

const prisma = new PrismaClient();

const MEOW_EMAIL = "meow.jianfeng@gmail.com";

function buildVoucherSnapshot(enabledTiers = [10], discountPercent = 20) {
  return {
    templateId: "voucher_discount",
    kind: "voucher_discount",
    allowDiscount: discountPercent > 0,
    discountPercent,
    sellerCommissionPercent: 5,
    platformFeePercent: 1.5,
    prizePoolPercent: 0,
    shareSellingEnabled: true,
    campaignType: "voucher_sale",
    instantPoolRatio: 0,
    midPoolRatio: 0,
    grandPoolRatio: 0,
    enabledTiers,
    prizePackId: "none",
    snapshottedAt: new Date().toISOString(),
  };
}

function buildDrawSnapshot() {
  return {
    templateId: "draw_standard",
    kind: "draw",
    allowDiscount: false,
    discountPercent: 0,
    sellerCommissionPercent: 5,
    platformFeePercent: 1.5,
    prizePoolPercent: 0,
    shareSellingEnabled: true,
    campaignType: "lucky_draw_v2",
    instantPoolRatio: 20,
    midPoolRatio: 0,
    grandPoolRatio: 80,
    enabledTiers: [50, 100, 200],
    prizePackId: "default_grand_v1",
    grandPrizes: [
      {
        id: "ipad",
        nameZh: "iPad",
        nameEn: "iPad",
        icon: "📲",
        targetCents: 300000,
        valueCents: 80000,
        requiresEscrow: false,
      },
      {
        id: "iphone",
        nameZh: "iPhone",
        nameEn: "iPhone",
        icon: "📱",
        targetCents: 500000,
        valueCents: 150000,
        requiresEscrow: false,
      },
      {
        id: "byd",
        nameZh: "BYD 梦想座驾",
        nameEn: "BYD dream car",
        icon: "🚗",
        targetCents: 66700000,
        valueCents: 20000000,
        requiresEscrow: true,
      },
    ],
    snapshottedAt: new Date().toISOString(),
  };
}

async function upsertCampaign({
  businessId,
  storeIdsJson,
  slug,
  name,
  description,
  type,
  snapshot,
  voucherTiers,
  color,
}) {
  const now = new Date();
  const end = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const existing = await prisma.campaign.findUnique({ where: { slug } });
  if (existing) {
    const updated = await prisma.campaign.update({
      where: { id: existing.id },
      data: {
        name,
        description,
        type,
        status: "active",
        startDate: now,
        endDate: end,
        drawDate: type === "lucky_draw_v2" ? end : null,
        budgetPercent: 20,
        instantPoolRatio: snapshot.instantPoolRatio,
        midPoolRatio: 0,
        grandPoolRatio: snapshot.grandPoolRatio,
        voucherTiers: JSON.stringify(voucherTiers),
        storeIds: storeIdsJson,
        templateId: snapshot.templateId,
        rulesSnapshot: JSON.stringify(snapshot),
        tags: JSON.stringify([snapshot.templateId, "meow-pilot-test"]),
        color,
      },
    });
    return { campaign: updated, created: false };
  }
  const created = await prisma.campaign.create({
    data: {
      businessId,
      name,
      description,
      type,
      color,
      startDate: now,
      endDate: end,
      drawDate: type === "lucky_draw_v2" ? end : null,
      budgetPercent: 20,
      instantPoolRatio: snapshot.instantPoolRatio,
      midPoolRatio: 0,
      grandPoolRatio: snapshot.grandPoolRatio,
      voucherTiers: JSON.stringify(voucherTiers),
      slug,
      joinable: false,
      joinCount: 0,
      allowCollaboration: true,
      storeIds: storeIdsJson,
      templateId: snapshot.templateId,
      rulesSnapshot: JSON.stringify(snapshot),
      tags: JSON.stringify([snapshot.templateId, "meow-pilot-test"]),
      status: "active",
      entryMethod: "auto",
    },
  });
  return { campaign: created, created: true };
}

async function main() {
  await loadTemplates();
  const biz = await prisma.user.findUnique({
    where: { email: MEOW_EMAIL },
    select: { id: true, businessName: true, businessSlug: true },
  });
  if (!biz) {
    throw new Error(`Business not found: ${MEOW_EMAIL}`);
  }
  const stores = await prisma.store.findMany({
    where: { businessId: biz.id },
    select: { id: true, name: true },
  });
  if (!stores.length) {
    throw new Error("Meow BBQ has no stores");
  }
  const storeIdsJson = JSON.stringify(stores.map((s) => s.id));

  const voucherSnap = buildVoucherSnapshot([10], 20);
  const voucherS2Snap = buildVoucherSnapshot([2], 0);
  const drawSnap = buildDrawSnapshot();

  const a = await upsertCampaign({
    businessId: biz.id,
    storeIdsJson,
    slug: "meow-bbq-s10-voucher",
    name: "Meow BBQ S$10 代金券（Test）",
    description:
      "试点纯代金 · 面值 S$10 · 折扣 20% · 实付约 S$8 · 无抽奖 · Stripe Test 验账用",
    type: "voucher_sale",
    snapshot: voucherSnap,
    voucherTiers: [
      { min: 10, max: 10, tier: "small", instantPrizeCap: 0 },
    ],
    color: "#1A6EFF",
  });

  const c = await upsertCampaign({
    businessId: biz.id,
    storeIdsJson,
    slug: "meow-bbq-s2-voucher",
    name: "Meow BBQ S$2 代金券（PayNow 验账）",
    description:
      "Live PayNow 小额验账 · 面值 S$2 · 无折扣 · 实付 S$2 · 入账=实付（老算法）· 无抽奖",
    type: "voucher_sale",
    snapshot: voucherS2Snap,
    voucherTiers: [{ min: 2, max: 2, tier: "small", instantPrizeCap: 0 }],
    color: "#0EA5E9",
  });

  const b = await upsertCampaign({
    businessId: biz.id,
    storeIdsJson,
    slug: "meow-bbq-draw-3tier",
    name: "Meow BBQ 抽奖三档（Test）",
    description:
      "试点抽奖 · 购券档 50/100/200 · 即时小奖 + 大奖池 · 与 S$10 代金分开 · Stripe Test 验账用",
    type: "lucky_draw_v2",
    snapshot: drawSnap,
    voucherTiers: [
      { min: 50, max: 50, tier: "small", instantPrizeCap: 8 },
      { min: 100, max: 100, tier: "medium", instantPrizeCap: 20 },
      { min: 200, max: 200, tier: "large", instantPrizeCap: 40 },
    ],
    color: "#7C3AED",
  });

  const base = process.env.NEXT_PUBLIC_APP_URL || "https://wemembers.store";
  console.log(JSON.stringify({
    business: biz.businessName,
    stores: stores.map((s) => s.name),
    voucherS2: {
      id: c.campaign.id,
      slug: c.campaign.slug,
      created: c.created,
      url: `${base}/voucher/${c.campaign.slug}`,
      face: "S$2",
      pay: "S$2.00 (0% off)",
    },
    voucher: {
      id: a.campaign.id,
      slug: a.campaign.slug,
      created: a.created,
      url: `${base}/voucher/${a.campaign.slug}`,
      face: "S$10",
      payApprox: "S$8.00 (20% off)",
    },
    draw: {
      id: b.campaign.id,
      slug: b.campaign.slug,
      created: b.created,
      url: `${base}/voucher/${b.campaign.slug}`,
      tiers: [50, 100, 200],
    },
  }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

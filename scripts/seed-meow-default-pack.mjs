/**
 * Meow BBQ 默认开店包（定稿）
 *
 * 1) 赠送额度 = S$100 × 门店数（公司账户）
 * 2) A1 原价无门槛代金 · 10/20/50/100
 * 3) A2 原价门槛券 · 券面×10 最低消费
 * 4) B 独享 15% 抽奖 · 50/100 · 全店启用 · 支持入箱票
 *
 * Usage:
 *   node scripts/seed-meow-default-pack.mjs
 *   DATABASE_URL=... node scripts/seed-meow-default-pack.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const GIFT_PER_STORE = 10000; // S$100
const SLUGS = {
  faceOpen: "meow-bbq-face-open",
  faceThreshold: "meow-bbq-face-threshold",
  exclusiveBallot: "meow-bbq-exclusive-ballot-15",
};

function snapFaceOpen() {
  return {
    templateId: "self_use_voucher",
    kind: "voucher_discount",
    allowDiscount: true,
    discountPercent: 0,
    sellerCommissionPercent: 0,
    platformFeePercent: 0,
    prizePoolPercent: 0,
    shareSellingEnabled: false,
    campaignType: "voucher_sale",
    instantPoolRatio: 0,
    midPoolRatio: 0,
    grandPoolRatio: 0,
    enabledTiers: [10, 20, 50, 100],
    prizePackId: "none",
    minSpendMultiplier: 0,
    productKind: "self_use",
    packKind: "face_open",
    snapshottedAt: new Date().toISOString(),
  };
}

function snapFaceThreshold() {
  return {
    ...snapFaceOpen(),
    minSpendMultiplier: 10,
    packKind: "face_threshold",
    snapshottedAt: new Date().toISOString(),
  };
}

function snapExclusive() {
  return {
    templateId: "exclusive_draw_15",
    kind: "draw",
    allowDiscount: false,
    discountPercent: 0,
    sellerCommissionPercent: 0,
    platformFeePercent: 2,
    prizePoolPercent: 0,
    shareSellingEnabled: false,
    campaignType: "lucky_draw_v2",
    instantPoolRatio: 20,
    midPoolRatio: 0,
    grandPoolRatio: 80,
    enabledTiers: [50, 100],
    prizePackId: "default_grand_v1",
    exclusiveFeeTotalPercent: 15,
    exclusiveSmallPrizePercent: 3,
    exclusivePlatformFeePercent: 2,
    exclusiveGrandPoolPercent: 10,
    productKind: "self_use",
    packKind: "exclusive_ballot",
    ballotEnabled: true,
    snapshottedAt: new Date().toISOString(),
  };
}

function tiersJson(amounts, withCap = false) {
  return amounts.map((sgd) => ({
    min: sgd,
    max: sgd,
    tier: sgd >= 100 ? "large" : sgd >= 50 ? "medium" : "small",
    instantPrizeCap: withCap ? (sgd >= 100 ? 20 : 8) : 0,
  }));
}

async function ensureGift(businessId, storeCount) {
  const target = Math.max(1, storeCount) * GIFT_PER_STORE;
  let acct = await prisma.tokenAccount.findUnique({
    where: { userId: businessId },
  });
  if (!acct) {
    acct = await prisma.tokenAccount.create({
      data: {
        userId: businessId,
        balance: 0,
        giftBalance: target,
        totalEarned: target,
        totalSpent: 0,
        frozenBalance: 0,
      },
    });
    await prisma.tokenTransaction.create({
      data: {
        accountId: acct.id,
        amount: target,
        type: "platform_gift",
        description: `默认开店包：每店 S$100 × ${storeCount} 店 = S$${(target / 100).toFixed(0)}（仅抵服务费）`,
        balanceAfter: 0,
      },
    });
    console.log("gift created S$", target / 100);
    return;
  }
  if ((acct.giftBalance || 0) < target) {
    const need = target - (acct.giftBalance || 0);
    await prisma.tokenAccount.update({
      where: { id: acct.id },
      data: {
        giftBalance: { increment: need },
        totalEarned: { increment: need },
      },
    });
    await prisma.tokenTransaction.create({
      data: {
        accountId: acct.id,
        amount: need,
        type: "platform_gift",
        description: `默认开店包补足：每店 S$100 × ${storeCount} 店`,
        balanceAfter: acct.balance,
      },
    });
    console.log("gift topped +S$", need / 100, "→", target / 100);
  } else {
    console.log("gift ok S$", (acct.giftBalance || 0) / 100);
  }
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
  budgetPercent,
}) {
  const now = new Date();
  const end = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const data = {
    name,
    description,
    type,
    color,
    startDate: now,
    endDate: end,
    drawDate: type === "lucky_draw_v2" ? end : null,
    status: "active",
    productKind: "self_use",
    templateId: snapshot.templateId,
    rulesSnapshot: JSON.stringify(snapshot),
    voucherTiers: voucherTiers ? JSON.stringify(voucherTiers) : null,
    storeIds: storeIdsJson,
    partnerIds: null,
    joinable: false,
    allowCollaboration: false,
    budgetPercent: budgetPercent ?? 0,
    instantPoolRatio: snapshot.instantPoolRatio ?? 0,
    midPoolRatio: 0,
    grandPoolRatio: snapshot.grandPoolRatio ?? 0,
    tags: JSON.stringify([
      snapshot.templateId,
      "self_use",
      "default_pack",
      snapshot.packKind,
    ]),
  };

  const existing = await prisma.campaign.findUnique({ where: { slug } });
  if (existing) {
    const updated = await prisma.campaign.update({
      where: { id: existing.id },
      data,
    });
    console.log("updated", slug, updated.id);
    return updated;
  }
  const created = await prisma.campaign.create({
    data: { ...data, businessId, slug },
  });
  console.log("created", slug, created.id);
  return created;
}

async function main() {
  const meow = await prisma.user.findFirst({
    where: {
      OR: [
        { businessSlug: "meow-bbq" },
        { email: "meow.jianfeng@gmail.com" },
      ],
      role: "business",
    },
  });
  if (!meow) {
    console.error("Meow business not found");
    process.exit(1);
  }

  const stores = await prisma.store.findMany({
    where: { businessId: meow.id },
    select: { id: true, name: true },
  });
  console.log(
    "Meow",
    meow.businessName,
    "stores",
    stores.map((s) => s.name).join(", ") || "(none)"
  );

  await ensureGift(meow.id, stores.length || 1);
  // 全店启用（opt-in 列表；无店则 []）
  const storeIdsJson = JSON.stringify(stores.map((s) => s.id));

  await upsertCampaign({
    businessId: meow.id,
    storeIdsJson,
    slug: SLUGS.faceOpen,
    name: "原价代金·无门槛",
    description:
      "长期 · 付多少抵多少 · 无最低消费 · 可网上/现金购买 · 默认开店包 A1",
    type: "voucher_sale",
    snapshot: snapFaceOpen(),
    voucherTiers: tiersJson([10, 20, 50, 100], false),
    color: "#64748B",
    budgetPercent: 0,
  });

  await upsertCampaign({
    businessId: meow.id,
    storeIdsJson,
    slug: SLUGS.faceThreshold,
    name: "原价代金·门槛约9折",
    description:
      "长期 · 原价买券 · 最低消费=券面×10（如 S$10 券满 S$100）· 网上/现金 · 默认开店包 A2",
    type: "voucher_sale",
    snapshot: snapFaceThreshold(),
    voucherTiers: tiersJson([10, 20, 50, 100], false),
    color: "#0EA5E9",
    budgetPercent: 0,
  });

  const exclusive = await upsertCampaign({
    businessId: meow.id,
    storeIdsJson,
    slug: SLUGS.exclusiveBallot,
    name: "消费入箱大奖·独享15%",
    description:
      "长期 · 结账/餐桌扫码付 S$50 或 S$100 · 扣点 3%小奖+2%平台+10%大奖 · 打印入箱票投箱 · 默认开店包 B",
    type: "lucky_draw_v2",
    snapshot: snapExclusive(),
    voucherTiers: tiersJson([50, 100], true),
    color: "#FF6B35",
    budgetPercent: 0,
  });

  // 若有门店：为每店预建 50/100 入箱票各 20 张（可再打）
  for (const store of stores) {
    for (const face of [5000, 10000]) {
      const contrib = Math.floor((face * 10) / 100);
      const title = `入箱票 S$${face / 100} · ${store.name}`;
      const existing = await prisma.physicalBatch.findFirst({
        where: {
          businessId: meow.id,
          storeId: store.id,
          type: "ballot",
          valueCents: face,
          campaignId: exclusive.id,
          status: "active",
        },
      });
      if (existing) {
        console.log("ballot batch exists", title, existing.id);
        continue;
      }
      const batch = await prisma.physicalBatch.create({
        data: {
          businessId: meow.id,
          storeId: store.id,
          type: "ballot",
          title,
          description: `投箱仪式票 · 大奖贡献 S$${(contrib / 100).toFixed(2)} · 不抵消费`,
          valueCents: face,
          contributionCents: contrib,
          quantity: 20,
          campaignId: exclusive.id,
          visualTemplateId: "store_bold",
          themeColor: "#FF6B35",
          status: "active",
          validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });
      const codes = [];
      for (let i = 0; i < 20; i++) {
        const code = `BL-${face / 100}-${store.id.slice(-4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${i.toString(36).toUpperCase()}`;
        codes.push(code.slice(0, 32));
      }
      // unique codes
      const { randomBytes } = await import("crypto");
      const finalCodes = Array.from({ length: 20 }, () => {
        const h = randomBytes(6).toString("hex").toUpperCase();
        return `BL${face / 100}-${h}`;
      });
      await prisma.physicalTicket.createMany({
        data: finalCodes.map((code) => ({
          batchId: batch.id,
          storeId: store.id,
          code,
          status: "printed",
        })),
      });
      console.log("ballot batch", title, batch.id, "×20");
    }
  }

  console.log("\nDone. Slugs:");
  console.log("  /voucher/" + SLUGS.faceOpen);
  console.log("  /voucher/" + SLUGS.faceThreshold);
  console.log("  /voucher/" + SLUGS.exclusiveBallot);
  console.log("  Physical → 入箱票 ballot batches per store");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Meow BBQ 试点商家：完整默认活动 + 默认券产品，可重置
 *
 * 用法：
 *   npx tsx scripts/seed-meowbbq.ts            # 建/补齐（幂等，不动已有数据）
 *   npx tsx scripts/seed-meowbbq.ts --reset    # 清空活动/产品/券/流水再重建
 *   npx tsx scripts/seed-meowbbq.ts --full     # 完全重置成「新建商家」：连品牌资料、门店、
 *                                              # 会员、积分、钱包流水一并清掉重来
 *   npx tsx scripts/seed-meowbbq.ts --show     # 只打印当前结构
 *
 * 三层结构（打印时按此分组）：
 *   券模版 → VoucherProduct（券产品）
 *   活动模版 → Campaign role="activity"（活动）
 *   CampaignProduct → 活动挂券产品
 *
 * 注：role="product_mirror" 的 Campaign 是每个券产品的同名影子（兼容旧购券路径），
 * 不是活动，打印时单独归类，避免与真活动混淆。
 */
import { prisma } from "@/lib/db";
import { ensureDefaultActivities } from "@/lib/default-activities";
import { createVoucherProduct } from "@/lib/catalog";
import { DEFAULT_CASHBACK_RULES } from "@/lib/cashback";

const SLUG = "meow-bbq";
const EMAIL = "meow-bbq@wemembers.local";
const NAME = "Meow BBQ";
const STORES = [
  { name: "牛车水店", slug: "meow-bbq-chinatown" },
  { name: "乌节路店", slug: "meow-bbq-orchard" },
];

/** 自充钱包（分）—— 用于支付平台费；cashback 不扣真金 */
const WALLET_CENTS = 50_000;
/** 平台赠送额度（分）—— 只能抵平台服务费 */
const GIFT_CENTS = 30_000;

const money = (c: number) => `S$${(c / 100).toFixed(2)}`;

async function findOrCreateBusiness() {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ businessSlug: SLUG }, { email: EMAIL }] },
  });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      role: "business",
      email: EMAIL,
      businessName: NAME,
      businessSlug: SLUG,
      businessCategory: "food",
    },
  });
}

/** 清空该商家的活动/产品/券/流水。顺序按外键依赖，避免约束报错。 */
async function reset(businessId: string) {
  const camps = await prisma.campaign.findMany({
    where: { businessId },
    select: { id: true },
  });
  const campaignIds = camps.map((c) => c.id);

  await prisma.cashbackClaimToken.deleteMany({ where: { businessId } });
  await prisma.spendRecord.deleteMany({ where: { businessId } });

  if (campaignIds.length) {
    await prisma.voucherDraw.deleteMany({
      where: { voucher: { campaignId: { in: campaignIds } } },
    });
    await prisma.voucherUsage.deleteMany({
      where: { voucher: { campaignId: { in: campaignIds } } },
    });
    await prisma.physicalTicket.deleteMany({
      where: { voucher: { campaignId: { in: campaignIds } } },
    });
    await prisma.promoGrant.deleteMany({ where: { businessId } });
    await prisma.voucher.deleteMany({
      where: { campaignId: { in: campaignIds } },
    });
    await prisma.drawTicket.deleteMany({
      where: { campaignId: { in: campaignIds } },
    });
    await prisma.luckyDrawEntry.deleteMany({
      where: { campaignId: { in: campaignIds } },
    });
    await prisma.lotteryPrize.deleteMany({
      where: { campaignId: { in: campaignIds } },
    });
    await prisma.campaignJoinRequest.deleteMany({
      where: { campaignId: { in: campaignIds } },
    });
    await prisma.campaignProduct.deleteMany({
      where: { campaignId: { in: campaignIds } },
    });
    await prisma.coupon.updateMany({
      where: { campaignId: { in: campaignIds } },
      data: { campaignId: null },
    });
  }

  // 产品先解除对镜像活动的引用，否则删活动会撞外键
  await prisma.voucherProduct.updateMany({
    where: { businessId },
    data: { mirrorCampaignId: null },
  });
  await prisma.voucherProduct.deleteMany({ where: { businessId } });
  await prisma.campaign.deleteMany({ where: { businessId } });
}

/**
 * 完全重置：把商家退回「刚注册完」的状态。
 * 在 reset() 之上再清品牌资料、门店、会员、积分、券模版、钱包流水。
 */
async function fullReset(businessId: string) {
  await reset(businessId);

  const stores = await prisma.store.findMany({
    where: { businessId },
    select: { id: true },
  });
  const storeIds = stores.map((s) => s.id);

  await prisma.pointsLog.deleteMany({ where: { membership: { businessId } } });
  await prisma.membership.deleteMany({ where: { businessId } });
  await prisma.customerCoupon.deleteMany({ where: { coupon: { businessId } } });
  await prisma.coupon.deleteMany({ where: { businessId } });
  await prisma.membershipTierConfig.deleteMany({ where: { businessId } });

  await prisma.businessTemplate.deleteMany({ where: { businessId } });
  await prisma.businessPartner.deleteMany({
    where: { OR: [{ businessId }, { partnerId: businessId }] },
  });
  await prisma.receipt.deleteMany({ where: { businessId } });
  await prisma.receiptGroup.deleteMany({ where: { businessId } });

  // 钱包账户保留，余额随后由 upsert 重设；只清流水
  await prisma.tokenTransaction.deleteMany({
    where: { account: { userId: businessId } },
  });

  if (storeIds.length) {
    await prisma.redemptionLog.deleteMany({ where: { storeId: { in: storeIds } } });
    // 先解绑店员，否则外键挡住删门店
    await prisma.user.updateMany({
      where: { storeId: { in: storeIds } },
      data: { storeId: null },
    });
    await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
  }

  // 品牌资料回到新建状态
  await prisma.user.update({
    where: { id: businessId },
    data: {
      businessName: NAME,
      businessSlug: SLUG,
      businessCategory: "food",
      businessLogo: null,
      businessUen: null,
      status: "active",
    },
  });
}

/**
 * 补充券产品 —— 只建默认活动**没有**提供的。
 *
 * `ensureDefaultActivities` 已经建了「原价代金」(face_open)、「9折优惠卡」(discount_10)、
 * 「大奖倒计时」(exclusive_ballot) 三个产品。这里再建同类只会得到两个近似重名的产品
 * （"原价代金" vs "原价代金券"），正是后台看着乱的根源。
 *
 * 门槛储值券不在默认 slot 里，由本脚本补上，顺便演示统一折扣券模版的门槛参数。
 */
async function seedProducts(businessId: string) {
  const wanted = [
    {
      name: "门槛储值券",
      description: "单次消费满券面 ×10 才可用 · 演示统一折扣券模版的门槛参数",
      discountPercent: 0,
      enabledTiers: [10, 20, 50],
      validDays: null as number | null,
      minSpendMultiplier: 10,
      status: "draft" as const,
    },
  ];

  const created: string[] = [];
  for (const w of wanted) {
    const dup = await prisma.voucherProduct.findFirst({
      where: { businessId, name: w.name },
      select: { id: true },
    });
    if (dup) continue;
    await createVoucherProduct(businessId, {
      name: w.name,
      description: w.description,
      packKind: "discount_voucher",
      discountPercent: w.discountPercent,
      enabledTiers: w.enabledTiers,
      validDays: w.validDays,
      minSpendMultiplier: w.minSpendMultiplier,
      status: w.status,
      createShelfActivity: true,
    });
    created.push(w.name);
  }
  return created;
}

async function show(businessId: string) {
  const [products, campaigns, wallet, stores] = await Promise.all([
    prisma.voucherProduct.findMany({
      where: { businessId },
      include: {
        campaignLinks: {
          include: { campaign: { select: { name: true, role: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.campaign.findMany({
      where: { businessId },
      include: {
        catalogProducts: { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.tokenAccount.findUnique({ where: { userId: businessId } }),
    prisma.store.findMany({
      where: { businessId },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const activities = campaigns.filter((c) => c.role === "activity");
  const mirrors = campaigns.filter((c) => c.role !== "activity");

  console.log(`\n门店（${stores.length}）: ${stores.map((s) => s.name).join(" / ")}`);
  if (wallet) {
    console.log(
      `钱包: 自充 ${money(wallet.balance)} · 平台赠送 ${money(wallet.giftBalance)}（仅抵平台费）`
    );
  }

  console.log(`\n━━ 券产品（${products.length}）━━ 由券模版创建`);
  for (const p of products) {
    const snap = JSON.parse(p.rulesSnapshot || "{}");
    const bits = [
      snap.discountPercent != null ? `折扣 ${snap.discountPercent}%` : null,
      snap.minSpendMultiplier ? `门槛 ×${snap.minSpendMultiplier}` : null,
      snap.validDays ? `${snap.validDays} 天` : null,
      Array.isArray(snap.enabledTiers) ? `档 ${snap.enabledTiers.join("/")}` : null,
    ].filter(Boolean);
    console.log(`  [${p.status.padEnd(6)}] ${p.name}`);
    console.log(`            ${bits.join(" · ") || "—"}`);
    console.log(
      `            挂在活动: ${p.campaignLinks.map((l) => l.campaign.name).join(", ") || "（未挂）"}`
    );
  }

  console.log(`\n━━ 活动（${activities.length}）━━ 由活动模版创建`);
  for (const c of activities) {
    const names = c.catalogProducts.map((x) => x.product.name);
    console.log(`  [${c.status.padEnd(6)}] ${c.name}   type=${c.type}`);
    console.log(
      `            券产品: ${names.length ? names.join(", ") : "（无 — 规则型活动）"}`
    );
    if (c.type === "cashback") {
      const r = JSON.parse(c.rulesSnapshot || "{}");
      console.log(
        `            返 ${r.cashbackPercent}% + 抽奖 ${r.drawPercent}% · 即时/大奖 ${r.instantPoolRatio}/${r.grandPoolRatio} · 客单 ${money(r.avgTicketCents ?? 0)}`
      );
      console.log(
        `            负债 已发 ${money(c.cashbackIssuedCents)} / 已核销 ${money(c.cashbackRedeemedCents)} · 奖池 即时 ${money(c.instantPoolCents)} 大奖 ${money(c.grandPoolCents)}`
      );
    }
  }

  console.log(
    `\n━━ 产品镜像（${mirrors.length}）━━ 每个券产品的同名影子，兼容旧购券路径，不是活动`
  );
  for (const c of mirrors) console.log(`  [${c.status.padEnd(6)}] ${c.name}`);
}

/**
 * 会员等级：试点商家把「等级 × 返现加成」配起来，让联动在真实数据上看得见。
 * 平台默认值是 0（加成是商家负债，必须自己开），这里是 meowbbq 的主动选择。
 */
const TIERS = [
  { tier: "regular", name: "普通会员", pointsRequired: 0, color: "#94A3B8", bonus: 0, benefits: ["消费即返 3%"] },
  { tier: "silver", name: "银卡会员", pointsRequired: 500, color: "#64748B", bonus: 0.5, benefits: ["生日月双倍积分"] },
  { tier: "gold", name: "金卡会员", pointsRequired: 2000, color: "#F59E0B", bonus: 1, benefits: ["生日月双倍积分", "新品优先试吃"] },
  { tier: "platinum", name: "铂金会员", pointsRequired: 10000, color: "#8B5CF6", bonus: 2, benefits: ["生日月双倍积分", "新品优先试吃", "专属客服"] },
];

async function seedTiers(businessId: string) {
  for (const t of TIERS) {
    await prisma.membershipTierConfig.upsert({
      where: { businessId_tier: { businessId, tier: t.tier } },
      create: {
        businessId,
        tier: t.tier,
        name: t.name,
        pointsRequired: t.pointsRequired,
        color: t.color,
        benefits: JSON.stringify(t.benefits),
        cashbackBonusPercent: t.bonus,
      },
      update: {
        name: t.name,
        pointsRequired: t.pointsRequired,
        color: t.color,
        benefits: JSON.stringify(t.benefits),
        cashbackBonusPercent: t.bonus,
      },
    });
  }
  return TIERS.map((t) => `${t.name}(+${t.bonus}%)`);
}

async function main() {
  const args = process.argv.slice(2);
  const doFull = args.includes("--full");
  const doReset = args.includes("--reset");
  const showOnly = args.includes("--show");

  const biz = await findOrCreateBusiness();
  console.log(`商家: ${biz.businessName}  (${biz.businessSlug})  id=${biz.id}`);

  if (showOnly) {
    await show(biz.id);
    await prisma.$disconnect();
    return;
  }

  // 重置必须在建门店/钱包之前——完全重置会删门店
  if (doFull) {
    console.log("完全重置：品牌资料 / 门店 / 会员 / 积分 / 钱包流水 …");
    await fullReset(biz.id);
  } else if (doReset) {
    console.log("重置：活动 / 券产品 / 券 / 流水 …");
    await reset(biz.id);
  }

  for (const s of STORES) {
    await prisma.store.upsert({
      where: { businessId_name: { businessId: biz.id, name: s.name } },
      create: { businessId: biz.id, name: s.name, slug: s.slug },
      update: {},
    });
  }

  await prisma.tokenAccount.upsert({
    where: { userId: biz.id },
    create: {
      userId: biz.id,
      balance: WALLET_CENTS,
      giftBalance: GIFT_CENTS,
      totalEarned: WALLET_CENTS + GIFT_CENTS,
    },
    update: { balance: WALLET_CENTS, giftBalance: GIFT_CENTS },
  });

  const acts = await ensureDefaultActivities(biz.id, { lang: "zh" });
  const prods = await seedProducts(biz.id);
  const tiers = await seedTiers(biz.id);

  console.log(
    `\n默认活动: 新建 ${acts.created.length} · 已存 ${acts.existing.length}`
  );
  if (prods.length) console.log(`默认券产品: 新建 ${prods.join(", ")}`);
  console.log(`会员等级: ${tiers.join(" · ")}`);

  // cashback 活动补默认客单价（默认活动可能是旧版本建的）
  const cb = await prisma.campaign.findFirst({
    where: { businessId: biz.id, type: "cashback" },
    select: { id: true, rulesSnapshot: true },
  });
  if (cb) {
    const r = JSON.parse(cb.rulesSnapshot || "{}");
    if (!r.avgTicketCents) {
      r.avgTicketCents = DEFAULT_CASHBACK_RULES.avgTicketCents;
      await prisma.campaign.update({
        where: { id: cb.id },
        data: { rulesSnapshot: JSON.stringify(r) },
      });
    }
  }

  await show(biz.id);
  console.log("\n完成。");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

/**
 * Meow BBQ 独享抽奖线上活动（扫码购 + 实体印刷关联）
 * node scripts/seed-meow-exclusive-online.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SLUG = "meow-bbq-exclusive-draw";
const GIFT = 30000; // S$300

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
    console.error("Meow not found");
    process.exit(1);
  }

  // 默认赠送额度（若 gift 为 0）
  let acct = await prisma.tokenAccount.findUnique({ where: { userId: meow.id } });
  if (!acct) {
    acct = await prisma.tokenAccount.create({
      data: {
        userId: meow.id,
        balance: 0,
        giftBalance: GIFT,
        totalEarned: GIFT,
        totalSpent: 0,
        frozenBalance: 0,
      },
    });
    await prisma.tokenTransaction.create({
      data: {
        accountId: acct.id,
        amount: GIFT,
        type: "platform_gift",
        description: "平台赠送额度 S$300（不可提现）",
        balanceAfter: 0,
      },
    });
    console.log("Created token account + gift S$300");
  } else if ((acct.giftBalance || 0) < GIFT) {
    const need = GIFT - (acct.giftBalance || 0);
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
        description: `平台补足赠送额度至 S$300（不可提现）`,
        balanceAfter: acct.balance,
      },
    });
    console.log("Topped gift to S$300, +", need);
  }

  const stores = await prisma.store.findMany({
    where: { businessId: meow.id },
    select: { id: true, name: true },
  });

  const start = new Date();
  const end = new Date();
  end.setFullYear(end.getFullYear() + 1);

  const rulesSnapshot = JSON.stringify({
    kind: "draw",
    templateId: "draw_standard",
    campaignType: "lucky_draw_v2",
    allowDiscount: false,
    discountPercent: 0,
    sellerCommissionPercent: 0,
    platformFeePercent: 2,
    prizePoolPercent: 0,
    shareSellingEnabled: false,
    enabledTiers: [50, 100, 200],
    instantPoolRatio: 20,
    grandPoolRatio: 80,
    exclusiveFee: {
      totalPercent: 15,
      smallPercent: 3,
      platformPercent: 2,
      grandPercent: 10,
    },
  });

  let camp = await prisma.campaign.findFirst({
    where: {
      OR: [
        { slug: SLUG },
        {
          businessId: meow.id,
          productKind: "self_use",
          type: "lucky_draw_v2",
          status: "active",
        },
      ],
    },
  });

  if (camp) {
    camp = await prisma.campaign.update({
      where: { id: camp.id },
      data: {
        name: "Meow BBQ 独享抽奖",
        description:
          "先收款 · 付款扣15%（小奖3%+服务费2%+大奖10%平台兑）· 无卖券奖励 · 集团可核",
        productKind: "self_use",
        type: "lucky_draw_v2",
        slug: SLUG,
        status: "active",
        startDate: start,
        endDate: end,
        drawDate: end,
        storeIds: JSON.stringify(stores.map((s) => s.id)),
        rulesSnapshot,
        voucherTiers: JSON.stringify([
          { min: 50, max: 50, tier: "small", instantPrizeCap: 2 },
          { min: 100, max: 100, tier: "medium", instantPrizeCap: 5 },
          { min: 200, max: 200, tier: "large", instantPrizeCap: 10 },
        ]),
        tags: JSON.stringify(["self_use", "exclusive_draw", "online", "physical"]),
        templateId: "draw_standard",
        budgetPercent: 15,
        allowCollaboration: false,
        joinable: false,
      },
    });
    console.log("Updated exclusive", camp.id, camp.slug);
  } else {
    camp = await prisma.campaign.create({
      data: {
        businessId: meow.id,
        name: "Meow BBQ 独享抽奖",
        description:
          "先收款 · 付款扣15%（小奖3%+服务费2%+大奖10%平台兑）· 无卖券奖励 · 集团可核",
        type: "lucky_draw_v2",
        productKind: "self_use",
        slug: SLUG,
        color: "#64748B",
        startDate: start,
        endDate: end,
        drawDate: end,
        status: "active",
        budgetPercent: 15,
        storeIds: JSON.stringify(stores.map((s) => s.id)),
        allowCollaboration: false,
        joinable: false,
        templateId: "draw_standard",
        voucherTiers: JSON.stringify([
          { min: 50, max: 50, tier: "small", instantPrizeCap: 2 },
          { min: 100, max: 100, tier: "medium", instantPrizeCap: 5 },
          { min: 200, max: 200, tier: "large", instantPrizeCap: 10 },
        ]),
        tags: JSON.stringify(["self_use", "exclusive_draw", "online", "physical"]),
        entryMethod: "auto",
        rulesSnapshot,
      },
    });
    console.log("Created exclusive", camp.id, camp.slug);
  }

  console.log(
    JSON.stringify(
      {
        campaignId: camp.id,
        slug: camp.slug,
        buyUrl: `https://wemembers.store/voucher/${SLUG}`,
        printHint: "功能仓→实体印刷→独享抽奖·面值100",
        giftBalance: GIFT,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

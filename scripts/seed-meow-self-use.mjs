/**
 * Production one-shot: ensure Meow BBQ has an active self_use campaign.
 * Run on server: node scripts/seed-meow-self-use.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
  if (stores.length === 0) {
    console.error("No stores");
    process.exit(1);
  }

  let camp = await prisma.campaign.findFirst({
    where: { businessId: meow.id, productKind: "self_use", status: "active" },
  });

  if (!camp) {
    const start = new Date();
    const end = new Date();
    end.setFullYear(end.getFullYear() + 1);
    camp = await prisma.campaign.create({
      data: {
        businessId: meow.id,
        name: "Meow BBQ 自用券（现金/柜台）",
        description:
          "集团门店可核 · 售出即收款 · 核销不入平台钱包。柜台现金发券用。",
        type: "voucher_sale",
        productKind: "self_use",
        color: "#64748B",
        startDate: start,
        endDate: end,
        status: "active",
        budgetPercent: 0,
        storeIds: JSON.stringify(stores.map((s) => s.id)),
        allowCollaboration: false,
        joinable: false,
        templateId: "voucher_discount",
        voucherTiers: JSON.stringify([
          { min: 10, max: 10, tier: "small" },
          { min: 20, max: 20, tier: "medium" },
          { min: 50, max: 50, tier: "medium" },
          { min: 100, max: 100, tier: "large" },
        ]),
        tags: JSON.stringify(["self_use", "counter"]),
        entryMethod: "auto",
        rulesSnapshot: JSON.stringify({
          kind: "voucher",
          templateId: "voucher_discount",
          campaignType: "voucher_sale",
          allowDiscount: false,
          discountPercent: 0,
          sellerCommissionPercent: 0,
          platformFeePercent: 0,
          prizePoolPercent: 0,
          shareSellingEnabled: false,
          enabledTiers: [10, 20, 50, 100],
        }),
      },
    });
    console.log("Created self_use campaign", camp.id, camp.name);
  } else {
    console.log("Already have", camp.id, camp.name);
  }

  // Exclusive draw (独享券) for counter cash + instant prize
  let drawEx = await prisma.campaign.findFirst({
    where: {
      businessId: meow.id,
      productKind: "self_use",
      type: "lucky_draw_v2",
      status: "active",
    },
  });
  if (!drawEx) {
    const start = new Date();
    const end = new Date();
    end.setFullYear(end.getFullYear() + 1);
    drawEx = await prisma.campaign.create({
      data: {
        businessId: meow.id,
        name: "Meow BBQ 独享抽奖（现金/柜台）",
        description:
          "先收款再核销 · 即时小奖本店兑 · 不进平台奖池/不提现链路",
        type: "lucky_draw_v2",
        productKind: "self_use",
        color: "#64748B",
        startDate: start,
        endDate: end,
        drawDate: end,
        status: "active",
        budgetPercent: 0,
        storeIds: JSON.stringify(stores.map((s) => s.id)),
        allowCollaboration: false,
        joinable: false,
        templateId: "draw_standard",
        voucherTiers: JSON.stringify([
          { min: 50, max: 50, tier: "small", instantPrizeCap: 2 },
          { min: 100, max: 100, tier: "medium", instantPrizeCap: 5 },
          { min: 200, max: 200, tier: "large", instantPrizeCap: 10 },
        ]),
        tags: JSON.stringify(["self_use", "exclusive_draw", "counter"]),
        entryMethod: "auto",
        rulesSnapshot: JSON.stringify({
          kind: "draw",
          templateId: "draw_standard",
          campaignType: "lucky_draw_v2",
          allowDiscount: false,
          discountPercent: 0,
          sellerCommissionPercent: 0,
          platformFeePercent: 0,
          prizePoolPercent: 0,
          shareSellingEnabled: false,
          enabledTiers: [50, 100, 200],
          instantPoolRatio: 20,
          grandPoolRatio: 80,
        }),
      },
    });
    console.log("Created exclusive draw", drawEx.id, drawEx.name);
  } else {
    console.log("Already have exclusive draw", drawEx.id);
  }

  console.log(
    JSON.stringify(
      {
        businessId: meow.id,
        selfUseCampaignId: camp.id,
        exclusiveDrawCampaignId: drawEx.id,
        stores,
        issueUrl: "https://wemembers.store/business/issue-self",
        scanUrl: "https://wemembers.store/business/scan",
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

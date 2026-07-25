/**
 * Production: Meow BBQ online self-use voucher (scan → PayNow → pay 90 get 100).
 * Run on server: node scripts/seed-meow-self-use-online.mjs
 *
 * URL: https://wemembers.store/voucher/meow-bbq-self-use
 * Shop: https://wemembers.store/shop/meow-bbq
 * QR:   https://wemembers.store/api/campaign/qr?slug=meow-bbq-self-use&format=png
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SLUG = "meow-bbq-self-use";

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

  const start = new Date();
  const end = new Date();
  end.setFullYear(end.getFullYear() + 1);

  const rulesSnapshot = JSON.stringify({
    kind: "voucher",
    templateId: "voucher_discount",
    campaignType: "voucher_sale",
    allowDiscount: true,
    discountPercent: 10,
    sellerCommissionPercent: 0,
    platformFeePercent: 0,
    prizePoolPercent: 0,
    shareSellingEnabled: false,
    enabledTiers: [10, 20, 50, 100],
  });

  const data = {
    businessId: meow.id,
    name: "Meow BBQ 自用代金券",
    description:
      "扫码 PayNow · 付 90 得 100 · 仅本企业集团门店核销 · 可拆券 · 用了即核销",
    type: "voucher_sale",
    productKind: "self_use",
    slug: SLUG,
    color: "#475569",
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
    tags: JSON.stringify(["self_use", "online", "paynow", "scan"]),
    entryMethod: "auto",
    rulesSnapshot,
  };

  let camp = await prisma.campaign.findFirst({
    where: {
      OR: [
        { slug: SLUG },
        {
          businessId: meow.id,
          productKind: "self_use",
          type: "voucher_sale",
          tags: { contains: "online" },
        },
      ],
    },
  });

  if (camp) {
    camp = await prisma.campaign.update({
      where: { id: camp.id },
      data: {
        name: data.name,
        description: data.description,
        productKind: "self_use",
        slug: SLUG,
        status: "active",
        startDate: start,
        endDate: end,
        storeIds: data.storeIds,
        rulesSnapshot,
        voucherTiers: data.voucherTiers,
        tags: data.tags,
        templateId: "voucher_discount",
        budgetPercent: 0,
        allowCollaboration: false,
        joinable: false,
      },
    });
    console.log("Updated online self_use", camp.id, camp.slug);
  } else {
    camp = await prisma.campaign.create({ data });
    console.log("Created online self_use", camp.id, camp.slug);
  }

  console.log(
    JSON.stringify(
      {
        campaignId: camp.id,
        slug: camp.slug,
        productKind: camp.productKind,
        buyUrl: `https://wemembers.store/voucher/${SLUG}`,
        shopUrl: `https://wemembers.store/shop/${meow.businessSlug || "meow-bbq"}`,
        qrPng: `https://wemembers.store/api/campaign/qr?slug=${SLUG}&format=png&download=1`,
        example: "face S$100 · paid S$90 (10% off)",
        stores,
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

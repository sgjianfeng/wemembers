/**
 * 将现有「可售 Campaign」升级为：券产品 + 常驻活动（勾选该产品）
 * 跳过已有 mirror 的；role=product_mirror 的跳过二次。
 *
 * node scripts/migrate-to-catalog.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ensure columns exist (caller should db push first)
  const sellable = await prisma.campaign.findMany({
    where: {
      type: { in: ["voucher_sale", "lucky_draw_v2"] },
      OR: [{ role: "activity" }, { role: null }, { role: { equals: undefined } }],
    },
  });

  // Prisma may not like role null if field required with default - use raw filter
  const all = await prisma.campaign.findMany({
    where: { type: { in: ["voucher_sale", "lucky_draw_v2"] } },
  });

  let n = 0;
  for (const c of all) {
    if (c.role === "product_mirror") continue;
    const existing = await prisma.voucherProduct.findFirst({
      where: { mirrorCampaignId: c.id },
    });
    if (existing) {
      console.log("skip already product", c.slug || c.name);
      // ensure activity role
      if (c.role !== "activity") {
        await prisma.campaign.update({
          where: { id: c.id },
          data: { role: "activity" },
        });
      }
      // ensure link
      const link = await prisma.campaignProduct.findFirst({
        where: { campaignId: c.id, productId: existing.id },
      });
      if (!link) {
        await prisma.campaignProduct.create({
          data: { campaignId: c.id, productId: existing.id, sortOrder: 0 },
        });
      }
      // vouchers backfill productId
      await prisma.voucher.updateMany({
        where: { campaignId: c.id, productId: null },
        data: { productId: existing.id },
      });
      continue;
    }

    // 当前 Campaign 升级为活动；新建镜像 Campaign + 产品
    const slugBase =
      (c.slug || c.name || "product")
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .slice(0, 40) || "product";

    let productSlug = slugBase;
    for (let i = 0; i < 5; i++) {
      const taken = await prisma.voucherProduct.findUnique({
        where: { slug: productSlug },
      });
      if (!taken) break;
      productSlug = `${slugBase}-${i + 1}`;
    }

    const mirror = await prisma.campaign.create({
      data: {
        businessId: c.businessId,
        name: c.name,
        description: c.description,
        type: c.type,
        role: "product_mirror",
        color: c.color,
        startDate: c.startDate,
        endDate: c.endDate,
        drawDate: c.drawDate,
        status: c.status === "active" ? "active" : c.status,
        productKind: c.productKind,
        templateId: c.templateId,
        rulesSnapshot: c.rulesSnapshot,
        voucherTiers: c.voucherTiers,
        slug: `m-${productSlug}`,
        storeIds: null,
        budgetPercent: c.budgetPercent,
        instantPoolRatio: c.instantPoolRatio,
        grandPoolRatio: c.grandPoolRatio,
        instantPoolCents: c.instantPoolCents,
        grandPoolCents: c.grandPoolCents,
        entryCount: c.entryCount,
        totalTicketCount: c.totalTicketCount,
        tags: JSON.stringify(["product_mirror", "migrated"]),
      },
    });

    const product = await prisma.voucherProduct.create({
      data: {
        businessId: c.businessId,
        name: c.name,
        description: c.description,
        type: c.type,
        productKind: c.productKind,
        status: c.status === "active" ? "active" : "draft",
        slug: productSlug,
        templateId: c.templateId,
        rulesSnapshot: c.rulesSnapshot,
        voucherTiers: c.voucherTiers,
        color: c.color,
        mirrorCampaignId: mirror.id,
      },
    });

    await prisma.campaign.update({
      where: { id: c.id },
      data: {
        role: "activity",
        // 活动本身不再作为购券 slug 主入口时，可保留原 slug 给兼容
      },
    });

    await prisma.campaignProduct.create({
      data: {
        campaignId: c.id,
        productId: product.id,
        sortOrder: 0,
      },
    });

    // 购券改走产品 slug：把公开 slug 让给产品，活动改 a- 前缀
    if (c.slug && c.slug === productSlug) {
      // product took same slug - campaign already different
    } else if (c.slug) {
      // 产品使用原 slug（购券链接不断）
      try {
        await prisma.voucherProduct.update({
          where: { id: product.id },
          data: { slug: c.slug },
        });
        await prisma.campaign.update({
          where: { id: c.id },
          data: { slug: `a-${c.slug}`.slice(0, 60) },
        });
      } catch {
        /* slug conflict ok */
      }
    }

    await prisma.voucher.updateMany({
      where: { campaignId: c.id, productId: null },
      data: { productId: product.id },
    });

    // 售卖/奖池在镜像上；把池数据已在 mirror 创建时拷贝。新购走 product slug → mirror.
    // 旧券仍挂 activity campaignId，核销仍可用。
    console.log("migrated", c.name, "→ product", product.slug, "activity", c.id);
    n++;
  }
  console.log("done", n);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

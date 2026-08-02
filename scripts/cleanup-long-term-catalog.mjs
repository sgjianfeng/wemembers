/**
 * 清理「活动券」目录：
 * 1) 9折优惠卡 → 挂入「长期券」活动
 * 2) 有历史售出券的旧产品也可挂入长期券（保留历史）
 * 3) 其余冗余产品 archive + 从活动摘除
 * 4) 旧活动打 archived_cleanup，不再出现在活动券列表
 *
 * 用法:
 *   # 本地镜像（先 pull-prod-db restore）
 *   DATABASE_URL=postgresql://wemembers:localmirror@127.0.0.1:5433/wemembers \
 *     node scripts/cleanup-long-term-catalog.mjs
 *
 *   # 生产（务必确认）
 *   DATABASE_URL=... node scripts/cleanup-long-term-catalog.mjs --apply
 *
 * 默认 dry-run；加 --apply 才写库。
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const LONG_TERM_PACKS = new Set(["face_open", "face_threshold", "discount_10"]);

function parseSnap(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function parseTags(raw) {
  try {
    const t = JSON.parse(raw || "[]");
    return Array.isArray(t) ? t.map(String) : [];
  } catch {
    return [];
  }
}

function withTags(raw, extra) {
  return JSON.stringify([...new Set([...parseTags(raw), ...extra])]);
}

function packOf(productOrCamp) {
  const snap = parseSnap(productOrCamp.rulesSnapshot);
  if (snap.packKind) return String(snap.packKind);
  const tags = parseTags(productOrCamp.tags);
  for (const p of LONG_TERM_PACKS) {
    if (tags.includes(p) || tags.some((t) => t.includes(p))) return p;
  }
  if (
    productOrCamp.name?.includes("9折") ||
    productOrCamp.slug?.includes("discount")
  ) {
    return "discount_10";
  }
  if (
    productOrCamp.name?.includes("门槛") ||
    productOrCamp.slug?.includes("threshold")
  ) {
    return "face_threshold";
  }
  if (
    productOrCamp.name?.includes("原价") ||
    productOrCamp.slug?.includes("face-open")
  ) {
    return "face_open";
  }
  return snap.packKind || null;
}

async function ensureLink(campaignId, productId, sortOrder) {
  const existing = await prisma.campaignProduct.findFirst({
    where: { campaignId, productId },
  });
  if (existing) {
    if (existing.sortOrder !== sortOrder) {
      if (APPLY) {
        await prisma.campaignProduct.update({
          where: { id: existing.id },
          data: { sortOrder },
        });
      }
      console.log("  link sort", productId, "→", sortOrder);
    } else {
      console.log("  link ok", productId);
    }
    return;
  }
  if (APPLY) {
    await prisma.campaignProduct.create({
      data: { campaignId, productId, sortOrder },
    });
  }
  console.log("  +link", productId, "sort", sortOrder);
}

async function unlinkOthers(productId, keepCampaignId) {
  const links = await prisma.campaignProduct.findMany({
    where: { productId, campaignId: { not: keepCampaignId } },
  });
  for (const l of links) {
    if (APPLY) {
      await prisma.campaignProduct.delete({ where: { id: l.id } });
    }
    console.log("  -link from", l.campaignId, "product", productId);
  }
}

async function markActivityCleanup(camp, reason) {
  const tags = withTags(camp.tags, [
    "archived_cleanup",
    "merged_to_long_term",
    reason,
  ]);
  if (APPLY) {
    await prisma.campaign.update({
      where: { id: camp.id },
      data: {
        status: camp.status === "active" ? "ended" : camp.status,
        tags,
      },
    });
  }
  console.log("  cleanup activity", camp.name, camp.slug || camp.id, reason);
}

async function archiveProduct(product, reason) {
  if (product.status === "archived") {
    console.log("  product already archived", product.name);
    return;
  }
  // 有历史 Voucher 的不能丢，只挂长期券，不 archive 售卖线时再 archive
  const voucherCount = await prisma.voucher.count({
    where: { productId: product.id },
  });
  if (voucherCount > 0) {
    console.log(
      "  keep product (has vouchers)",
      product.name,
      "vouchers=",
      voucherCount
    );
    return { keep: true, voucherCount };
  }
  if (APPLY) {
    await prisma.voucherProduct.update({
      where: { id: product.id },
      data: { status: "archived" },
    });
    if (product.mirrorCampaignId) {
      await prisma.campaign.update({
        where: { id: product.mirrorCampaignId },
        data: {
          status: "ended",
          tags: withTags(
            (
              await prisma.campaign.findUnique({
                where: { id: product.mirrorCampaignId },
                select: { tags: true },
              })
            )?.tags,
            ["archived_cleanup", reason]
          ),
        },
      });
    }
  }
  console.log("  archive product", product.name, reason);
  return { keep: false, voucherCount: 0 };
}

async function cleanupBusiness(businessId, businessName) {
  console.log("\n→", businessName || businessId);

  const activities = await prisma.campaign.findMany({
    where: { businessId, role: { not: "product_mirror" } },
    include: {
      catalogProducts: { include: { product: true } },
      _count: { select: { vouchers: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const products = await prisma.voucherProduct.findMany({
    where: { businessId },
    orderBy: { createdAt: "asc" },
  });

  // 找长期券容器：优先 name=长期券 / category:long_term / face_open shelf
  let longTerm =
    activities.find((a) => a.name === "长期券" || a.name.startsWith("长期券")) ||
    activities.find((a) => parseTags(a.tags).includes("category:long_term")) ||
    activities.find((a) => packOf(a) === "face_open" && a.status === "active") ||
    activities.find((a) => packOf(a) === "face_open");

  if (!longTerm) {
    console.log("  ! no long-term activity — skip business");
    return;
  }

  console.log("  long-term container:", longTerm.id, longTerm.name, longTerm.slug);

  // 规范化长期券 tags / name
  if (APPLY) {
    await prisma.campaign.update({
      where: { id: longTerm.id },
      data: {
        name: "长期券",
        status: "active",
        type: "voucher_sale",
        role: "activity",
        tags: withTags(longTerm.tags, [
          "category:long_term",
          "long_term",
          "shelf",
          "default_activity",
        ]),
      },
    });
  } else {
    console.log("  would rename/normalize → 长期券 active");
  }

  // 分类产品
  const faceOpen = products.filter((p) => packOf(p) === "face_open");
  const discount10 = products.filter((p) => packOf(p) === "discount_10");
  const threshold = products.filter((p) => packOf(p) === "face_threshold");
  const exclusive = products.filter(
    (p) =>
      packOf(p) === "exclusive_ballot" ||
      p.type === "lucky_draw_v2" ||
      p.name.includes("独享") ||
      p.name.includes("抽奖")
  );

  // 有历史券、且不是大奖/已归类的 → 可挂长期券
  const historicalKeep = [];
  for (const p of products) {
    if (faceOpen.includes(p) || discount10.includes(p) || exclusive.includes(p))
      continue;
    if (threshold.includes(p)) continue;
    const vc = await prisma.voucher.count({ where: { productId: p.id } });
    if (vc > 0) historicalKeep.push({ product: p, voucherCount: vc });
  }

  let sort = 0;

  // 1) 原价 face_open 挂长期券（保留 active 的）
  for (const p of faceOpen) {
    if (p.status === "archived") {
      console.log("  skip archived face_open", p.name);
      continue;
    }
    await ensureLink(longTerm.id, p.id, sort++);
    await unlinkOthers(p.id, longTerm.id);
    // listScope store
    const snap = { ...parseSnap(p.rulesSnapshot), packKind: "face_open", listScope: "store" };
    if (APPLY) {
      await prisma.voucherProduct.update({
        where: { id: p.id },
        data: {
          status: "active",
          rulesSnapshot: JSON.stringify(snap),
        },
      });
      if (p.mirrorCampaignId) {
        await prisma.campaign.update({
          where: { id: p.mirrorCampaignId },
          data: { status: "active", rulesSnapshot: JSON.stringify(snap) },
        });
      }
    }
    console.log("  long-term product face_open", p.name, p.slug);
  }

  // 2) 9折卡挂长期券
  for (const p of discount10) {
    if (p.status === "archived") continue;
    await ensureLink(longTerm.id, p.id, sort++);
    await unlinkOthers(p.id, longTerm.id);
    const snap = {
      ...parseSnap(p.rulesSnapshot),
      packKind: "discount_10",
      discountPercent: 10,
      listScope: "store",
    };
    if (APPLY) {
      await prisma.voucherProduct.update({
        where: { id: p.id },
        data: {
          status: "active",
          name: p.name.includes("9折") ? p.name : "9折优惠卡",
          rulesSnapshot: JSON.stringify(snap),
        },
      });
      if (p.mirrorCampaignId) {
        await prisma.campaign.update({
          where: { id: p.mirrorCampaignId },
          data: {
            status: "active",
            name: p.name.includes("9折") ? p.name : "9折优惠卡",
            rulesSnapshot: JSON.stringify(snap),
          },
        });
      }
    }
    console.log("  long-term product discount_10", p.name, p.slug);
  }

  // 3) 有历史券的挂长期券（如 S$2 试点），产品保持 draft/不主推
  for (const { product: p, voucherCount } of historicalKeep) {
    await ensureLink(longTerm.id, p.id, sort++);
    await unlinkOthers(p.id, longTerm.id);
    if (APPLY && p.status === "active") {
      // 历史线：不主推售卖，降为 draft（仍可查历史）
      await prisma.voucherProduct.update({
        where: { id: p.id },
        data: { status: "draft" },
      });
    }
    console.log(
      "  long-term historical",
      p.name,
      "vouchers=",
      voucherCount,
      "status→draft"
    );
  }

  // 4) 门槛 / 无历史的其它产品：摘除并 archive
  const keepIds = new Set([
    ...faceOpen.filter((p) => p.status !== "archived").map((p) => p.id),
    ...discount10.filter((p) => p.status !== "archived").map((p) => p.id),
    ...historicalKeep.map((h) => h.product.id),
    ...exclusive.map((p) => p.id),
  ]);

  for (const p of products) {
    if (keepIds.has(p.id)) continue;
    if (exclusive.some((e) => e.id === p.id)) continue;
    // 摘除所有活动链接
    const links = await prisma.campaignProduct.findMany({
      where: { productId: p.id },
    });
    for (const l of links) {
      if (APPLY) await prisma.campaignProduct.delete({ where: { id: l.id } });
      console.log("  -unlink junk", p.name, "from", l.campaignId);
    }
    await archiveProduct(p, "not_long_term_pack");
  }

  // 5) 旧长期类活动（非 longTerm 容器）：cleanup
  for (const a of activities) {
    if (a.id === longTerm.id) continue;
    if (a.type === "holiday" || a.type === "lucky_draw_v2" || a.type === "lucky_draw")
      continue;
    if (parseTags(a.tags).includes("category:ndp") || /国庆|ndp/i.test(a.name))
      continue;
    if (
      parseTags(a.tags).includes("category:grand_countdown") ||
      /独享|抽奖|倒计时/.test(a.name)
    )
      continue;

    // voucher_sale 等旧活动
    const isLongPack =
      LONG_TERM_PACKS.has(packOf(a) || "") ||
      /9折|原价|赠送|face|discount|自用|S\$2|代金/.test(a.name || "");

    if (!isLongPack && a.status === "active") continue;

    // 把挂在本活动上的实体票批次挪到长期券（保留打印历史入口）
    const batches = await prisma.physicalBatch.findMany({
      where: { campaignId: a.id },
      select: { id: true, title: true },
    });
    for (const b of batches) {
      if (APPLY) {
        await prisma.physicalBatch.update({
          where: { id: b.id },
          data: { campaignId: longTerm.id },
        });
      }
      console.log("  move batch", b.title || b.id, "→ 长期券");
    }

    await markActivityCleanup(a, `from:${a.slug || a.id}`);
  }

  // 6) 大奖活动保持不动（仅确认未误伤）
  for (const p of exclusive) {
    console.log("  keep exclusive", p.name, p.status);
  }

  console.log(APPLY ? "  applied." : "  dry-run only (pass --apply to write)");
}

async function main() {
  console.log(APPLY ? "MODE: APPLY" : "MODE: dry-run");
  const businesses = await prisma.user.findMany({
    where: { role: "business", status: "active" },
    select: { id: true, businessName: true },
  });
  for (const b of businesses) {
    await cleanupBusiness(b.id, b.businessName);
  }
  console.log("\ndone");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

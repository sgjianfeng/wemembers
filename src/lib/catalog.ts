/**
 * 券产品目录：模版 → 产品（+ 镜像 Campaign 兼容购券）→ 活动勾选 → 门店参与活动
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { serializeStoreIds } from "@/lib/utils";
import {
  buildDiscount10Snapshot,
  buildExclusiveBallotSnapshot,
  buildFaceOpenSnapshot,
  buildFaceThresholdSnapshot,
  tiersToVoucherTiersJson,
  type DefaultPackKind,
} from "@/lib/store-defaults";
import {
  buildRulesSnapshot,
  type TemplateId,
} from "@/lib/templates";

type Tx = Prisma.TransactionClient;

export type ProductStatus = "draft" | "active" | "archived";

function slugify(base: string): string {
  const s = base
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${s || "product"}-${Date.now().toString(36)}`;
}

export async function uniqueProductSlug(
  tx: Tx,
  preferred: string
): Promise<string> {
  let slug = preferred.slice(0, 48);
  for (let i = 0; i < 8; i++) {
    const taken =
      (await tx.voucherProduct.findUnique({ where: { slug } })) ||
      (await tx.campaign.findUnique({ where: { slug } }));
    if (!taken) return slug;
    slug = `${preferred.slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return slugify(preferred);
}

/** 从平台/默认包创建券产品 + 镜像 Campaign */
export async function createVoucherProduct(
  businessId: string,
  input: {
    name: string;
    description?: string | null;
    packKind?: DefaultPackKind | string | null;
    templateId?: string | null;
    businessTemplateId?: string | null;
    rulesSnapshot?: Record<string, unknown> | null;
    enabledTiers?: number[];
    status?: ProductStatus;
    color?: string | null;
    slug?: string | null;
    /** 创建后是否自动挂一个「常驻」活动并启用全部门店 */
    createShelfActivity?: boolean;
  }
) {
  const name = input.name.trim();
  if (!name) throw new Error("NAME_REQUIRED");

  let snapshot: Record<string, unknown>;
  let type: string;
  let productKind: string;
  let templateId: string | null = input.templateId || null;
  let voucherTiers: ReturnType<typeof tiersToVoucherTiersJson> | null = null;

  if (input.packKind === "face_open") {
    snapshot = buildFaceOpenSnapshot(input.enabledTiers);
    type = "voucher_sale";
    productKind = "self_use";
    templateId = "self_use_voucher";
    voucherTiers = tiersToVoucherTiersJson(
      (snapshot.enabledTiers as number[]) || [10, 20, 50, 100]
    );
  } else if (input.packKind === "face_threshold") {
    snapshot = buildFaceThresholdSnapshot(input.enabledTiers);
    type = "voucher_sale";
    productKind = "self_use";
    templateId = "self_use_voucher";
    voucherTiers = tiersToVoucherTiersJson(
      (snapshot.enabledTiers as number[]) || [10, 20, 50, 100]
    );
  } else if (input.packKind === "discount_10") {
    snapshot = buildDiscount10Snapshot(input.enabledTiers);
    type = "voucher_sale";
    productKind = "self_use";
    templateId = "self_use_voucher";
    voucherTiers = tiersToVoucherTiersJson(
      (snapshot.enabledTiers as number[]) || [10, 20, 50, 100, 200],
      { instantCap: () => 0 }
    );
  } else if (input.packKind === "exclusive_ballot") {
    snapshot = buildExclusiveBallotSnapshot(input.enabledTiers);
    type = "lucky_draw_v2";
    productKind = "self_use";
    templateId = "exclusive_draw_15";
    voucherTiers = tiersToVoucherTiersJson(
      (snapshot.enabledTiers as number[]) || [50, 100],
      { instantCap: (sgd) => (sgd >= 100 ? 20 : 8) }
    );
  } else if (input.rulesSnapshot) {
    snapshot = { ...input.rulesSnapshot };
    type =
      snapshot.campaignType === "lucky_draw_v2" || snapshot.kind === "draw"
        ? "lucky_draw_v2"
        : "voucher_sale";
    productKind =
      (snapshot.productKind as string) === "distribution"
        ? "distribution"
        : "self_use";
    const tiers = (snapshot.enabledTiers as number[]) || input.enabledTiers || [];
    voucherTiers = tiers.length
      ? tiersToVoucherTiersJson(tiers, {
          instantCap: (sgd) =>
            type === "lucky_draw_v2" ? (sgd >= 100 ? 20 : 8) : 0,
        })
      : null;
  } else if (input.templateId) {
    const built = buildRulesSnapshot({
      templateId: input.templateId as TemplateId,
      enabledTiers: input.enabledTiers,
    });
    snapshot = { ...built };
    type =
      built.campaignType === "lucky_draw_v2" || built.kind === "draw"
        ? "lucky_draw_v2"
        : "voucher_sale";
    productKind = built.productKind || "self_use";
    voucherTiers = tiersToVoucherTiersJson(built.enabledTiers, {
      instantCap: (sgd) =>
        type === "lucky_draw_v2" ? (sgd >= 100 ? 20 : 8) : 0,
    });
  } else {
    throw new Error("TEMPLATE_OR_PACK_REQUIRED");
  }

  const status: ProductStatus = input.status || "active";
  const now = new Date();
  const end = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const slug = await uniqueProductSlug(
      tx,
      input.slug || slugify(name)
    );

    const mirror = await tx.campaign.create({
      data: {
        businessId,
        name: name,
        description: input.description || null,
        type,
        role: "product_mirror",
        color: input.color || (type === "lucky_draw_v2" ? "#FF6B35" : "#64748B"),
        startDate: now,
        endDate: end,
        drawDate: type === "lucky_draw_v2" ? end : null,
        status: status === "active" ? "active" : "draft",
        productKind,
        templateId,
        rulesSnapshot: JSON.stringify(snapshot),
        voucherTiers: voucherTiers ? JSON.stringify(voucherTiers) : null,
        slug: `m-${slug}`,
        storeIds: null,
        joinable: false,
        allowCollaboration: false,
        budgetPercent: 0,
        instantPoolRatio: Number(snapshot.instantPoolRatio) || 0,
        grandPoolRatio: Number(snapshot.grandPoolRatio) || 0,
        tags: JSON.stringify([
          "product_mirror",
          templateId || "",
          productKind,
          String(snapshot.packKind || ""),
        ]),
      },
    });

    const product = await tx.voucherProduct.create({
      data: {
        businessId,
        name,
        description: input.description || null,
        type,
        productKind,
        status,
        slug,
        templateId,
        rulesSnapshot: JSON.stringify(snapshot),
        voucherTiers: voucherTiers ? JSON.stringify(voucherTiers) : null,
        color: input.color || null,
        mirrorCampaignId: mirror.id,
      },
    });

    if (input.createShelfActivity !== false) {
      const stores = await tx.store.findMany({
        where: { businessId },
        select: { id: true },
      });
      const packKind = String(snapshot.packKind || "");
      const listScope = String(snapshot.listScope || "hot");
      const activity = await tx.campaign.create({
        data: {
          businessId,
          name,
          description:
            input.description ||
            `常驻上架 · 含券产品「${name}」· 门店可选用`,
          // 与产品同型，避免抽奖/代金在客户端判反（勿用 promotion）
          type: type === "lucky_draw_v2" ? "lucky_draw_v2" : "voucher_sale",
          role: "activity",
          color:
            input.color ||
            (type === "lucky_draw_v2" ? "#FF6B35" : "#1A6EFF"),
          startDate: now,
          endDate: end,
          drawDate: type === "lucky_draw_v2" ? end : null,
          status: status === "active" ? "active" : "draft",
          productKind,
          templateId,
          rulesSnapshot: JSON.stringify(snapshot),
          voucherTiers: voucherTiers ? JSON.stringify(voucherTiers) : null,
          slug: `a-${slug}`,
          storeIds: serializeStoreIds(stores.map((s) => s.id)),
          joinable: false,
          allowCollaboration: false,
          budgetPercent: 0,
          instantPoolRatio: Number(snapshot.instantPoolRatio) || 0,
          grandPoolRatio: Number(snapshot.grandPoolRatio) || 0,
          tags: JSON.stringify([
            "activity",
            "shelf",
            product.id,
            packKind,
            `scope:${listScope}`,
          ]),
        },
      });
      await tx.campaignProduct.create({
        data: {
          campaignId: activity.id,
          productId: product.id,
          sortOrder: 0,
        },
      });
    }

    return product;
  });
}

export async function setProductStatus(
  businessId: string,
  productId: string,
  status: ProductStatus
) {
  const product = await prisma.voucherProduct.findFirst({
    where: { id: productId, businessId },
  });
  if (!product) throw new Error("NOT_FOUND");

  await prisma.$transaction(async (tx) => {
    await tx.voucherProduct.update({
      where: { id: productId },
      data: { status },
    });
    if (product.mirrorCampaignId) {
      await tx.campaign.update({
        where: { id: product.mirrorCampaignId },
        data: {
          status:
            status === "active"
              ? "active"
              : status === "archived"
                ? "ended"
                : "draft",
        },
      });
    }
  });
  return prisma.voucherProduct.findUnique({ where: { id: productId } });
}

/** Normalize face amounts (SGD): unique, sorted, min S$2, max 20 tiers */
export function normalizeEnabledTiers(raw: unknown): number[] {
  if (!Array.isArray(raw)) throw new Error("TIERS_REQUIRED");
  const nums = raw
    .map((x) => Math.round(Number(x)))
    .filter((n) => Number.isFinite(n) && n >= 2 && n <= 100_000);
  const unique = [...new Set(nums)].sort((a, b) => a - b);
  if (unique.length === 0) throw new Error("TIERS_REQUIRED");
  if (unique.length > 20) throw new Error("TIERS_TOO_MANY");
  return unique;
}

function parseSnapshotJson(
  raw: string | null | undefined
): Record<string, unknown> {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

/**
 * Update product name / description / face-value tiers.
 * Syncs rulesSnapshot.enabledTiers + voucherTiers to:
 *  - VoucherProduct
 *  - product_mirror Campaign
 *  - all activity campaigns linked via CampaignProduct
 */
export async function updateVoucherProduct(
  businessId: string,
  productId: string,
  input: {
    name?: string;
    description?: string | null;
    enabledTiers?: number[];
  }
) {
  const product = await prisma.voucherProduct.findFirst({
    where: { id: productId, businessId },
  });
  if (!product) throw new Error("NOT_FOUND");

  const data: {
    name?: string;
    description?: string | null;
    rulesSnapshot?: string;
    voucherTiers?: string | null;
  } = {};

  if (typeof input.name === "string" && input.name.trim()) {
    data.name = input.name.trim();
  }
  if (input.description !== undefined) {
    data.description =
      typeof input.description === "string" ? input.description : null;
  }

  let snap = parseSnapshotJson(product.rulesSnapshot);
  let voucherTiersJson: string | null = product.voucherTiers;

  if (input.enabledTiers !== undefined) {
    const tiers = normalizeEnabledTiers(input.enabledTiers);
    snap = {
      ...snap,
      enabledTiers: tiers,
      snapshottedAt: new Date().toISOString(),
    };
    const isDraw =
      product.type === "lucky_draw_v2" ||
      snap.campaignType === "lucky_draw_v2" ||
      snap.kind === "draw" ||
      snap.packKind === "exclusive_ballot";
    const tiersArr = tiersToVoucherTiersJson(tiers, {
      instantCap: (sgd) =>
        isDraw ? (sgd >= 100 ? 20 : sgd >= 50 ? 8 : 0) : 0,
    });
    data.rulesSnapshot = JSON.stringify(snap);
    data.voucherTiers = JSON.stringify(tiersArr);
    voucherTiersJson = data.voucherTiers;
  }

  if (
    !data.name &&
    data.description === undefined &&
    !data.rulesSnapshot
  ) {
    return product;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.voucherProduct.update({
      where: { id: productId },
      data,
    });

    const campaignPatch: {
      name?: string;
      description?: string | null;
      rulesSnapshot?: string;
      voucherTiers?: string | null;
    } = {};
    if (data.name) campaignPatch.name = data.name;
    if (data.description !== undefined) {
      campaignPatch.description = data.description;
    }
    if (data.rulesSnapshot) {
      campaignPatch.rulesSnapshot = data.rulesSnapshot;
      campaignPatch.voucherTiers = voucherTiersJson;
    }

    if (Object.keys(campaignPatch).length > 0) {
      if (product.mirrorCampaignId) {
        await tx.campaign.update({
          where: { id: product.mirrorCampaignId },
          data: campaignPatch,
        });
      }

      // Activities that include this product — keep tier/rules in sync
      // so store catalog + purchase paths stay consistent.
      const links = await tx.campaignProduct.findMany({
        where: { productId },
        select: { campaignId: true },
      });
      for (const link of links) {
        const camp = await tx.campaign.findUnique({
          where: { id: link.campaignId },
          select: {
            id: true,
            role: true,
            rulesSnapshot: true,
          },
        });
        if (!camp || camp.role === "product_mirror") continue;

        // Only rewrite tiers on single-product shelf activities, or when
        // the activity snapshot already matches this product's pack (name sync always).
        const campSnap = parseSnapshotJson(camp.rulesSnapshot);
        const onlyName = !data.rulesSnapshot;
        if (onlyName) {
          if (data.name || data.description !== undefined) {
            await tx.campaign.update({
              where: { id: camp.id },
              data: {
                ...(data.name ? { name: data.name } : {}),
                ...(data.description !== undefined
                  ? { description: data.description }
                  : {}),
              },
            });
          }
          continue;
        }

        // Multi-product activities: still update tiers if this is the sole product
        const siblingCount = await tx.campaignProduct.count({
          where: { campaignId: camp.id },
        });
        if (siblingCount > 1) {
          // Don't overwrite multi-product activity rules; product has own mirror for buy.
          continue;
        }

        await tx.campaign.update({
          where: { id: camp.id },
          data: {
            ...campaignPatch,
            // Prefer product name only when activity was a 1:1 shelf clone
            ...(data.name &&
            (campSnap.packKind === snap.packKind || siblingCount === 1)
              ? { name: data.name }
              : {}),
          },
        });
      }
    }

    return updated;
  });
}

/** 购券：slug → 可用的镜像 campaignId + productId */
export async function resolveSellableBySlug(slug: string): Promise<{
  productId: string | null;
  campaignId: string;
  product: {
    id: string;
    name: string;
    status: string;
    type: string;
    productKind: string;
    rulesSnapshot: string | null;
    voucherTiers: string | null;
    mirrorCampaignId: string | null;
    slug: string | null;
  } | null;
  campaign: {
    id: string;
    name: string;
    status: string;
    type: string;
    productKind: string;
    rulesSnapshot: string | null;
    voucherTiers: string | null;
    slug: string | null;
    businessId: string;
    storeIds: string | null;
    role: string;
  };
} | null> {
  const product = await prisma.voucherProduct.findFirst({
    where: { slug, status: "active" },
  });
  if (product?.mirrorCampaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: product.mirrorCampaignId },
    });
    if (campaign && campaign.status === "active") {
      return {
        productId: product.id,
        campaignId: campaign.id,
        product,
        campaign,
      };
    }
  }

  const campaign = await prisma.campaign.findFirst({
    where: {
      slug,
      status: "active",
      type: { in: ["lucky_draw_v2", "voucher_sale"] },
    },
  });
  if (!campaign) return null;

  // 若有产品指向此镜像
  const linked = await prisma.voucherProduct.findFirst({
    where: { mirrorCampaignId: campaign.id },
  });

  return {
    productId: linked?.id || null,
    campaignId: campaign.id,
    product: linked,
    campaign,
  };
}

/** 门店可见：参与的活动里挂着的 active 产品 */
export async function listProductsForStore(
  businessId: string,
  storeId: string
) {
  const activities = await prisma.campaign.findMany({
    where: {
      businessId,
      role: "activity",
      status: "active",
    },
    include: {
      catalogProducts: {
        include: { product: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  const { storeIdsAllows } = await import("@/lib/utils");
  const out: {
    activityId: string;
    activityName: string;
    product: (typeof activities)[0]["catalogProducts"][0]["product"];
  }[] = [];

  for (const a of activities) {
    if (!storeIdsAllows(a.storeIds, storeId)) continue;
    for (const link of a.catalogProducts) {
      if (link.product.status !== "active") continue;
      out.push({
        activityId: a.id,
        activityName: a.name,
        product: link.product,
      });
    }
  }
  return out;
}

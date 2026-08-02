import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { storeIdsAllows } from "@/lib/utils";
import { parseRulesSnapshot } from "@/lib/templates";
import { activityToneFromType } from "@/lib/activity-entitlements";

function isArchivedCleanup(tags: string | null | undefined): boolean {
  if (!tags) return false;
  try {
    const arr = JSON.parse(tags) as unknown;
    if (Array.isArray(arr)) {
      return arr.some(
        (t) => t === "archived_cleanup" || t === "merged_to_long_term"
      );
    }
  } catch {
    /* ignore */
  }
  return /archived_cleanup|merged_to_long_term/.test(tags);
}

/**
 * GET /api/business/stores/[id]/catalog
 * 门店视角：本公司活动列表 + 本店是否参与 + 活动挂载的可售产品
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (
      !session ||
      (session.role !== "business" && session.role !== "staff")
    ) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { id: storeId } = await params;

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, businessId: true, slug: true },
    });
    if (!store) {
      return NextResponse.json({ error: "门店不存在" }, { status: 404 });
    }

    if (session.role === "business" && store.businessId !== session.userId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    if (session.role === "staff") {
      if (session.storeId !== store.id && store.businessId !== session.userId) {
        const staff = await prisma.user.findUnique({
          where: { id: session.userId },
          select: { storeId: true },
        });
        if (staff?.storeId !== store.id) {
          return NextResponse.json({ error: "无权限" }, { status: 403 });
        }
      }
    }

    // 活动容器：可售代金/抽奖 + 国庆等；排除产品镜像与清理归档
    const campaigns = await prisma.campaign.findMany({
      where: {
        businessId: store.businessId,
        type: { in: ["voucher_sale", "lucky_draw_v2", "holiday"] },
        status: { in: ["active", "draft"] },
        role: { not: "product_mirror" },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        productKind: true,
        templateId: true,
        rulesSnapshot: true,
        storeIds: true,
        slug: true,
        tags: true,
        endDate: true,
        catalogProducts: {
          orderBy: { sortOrder: "asc" },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                status: true,
                slug: true,
                type: true,
              },
            },
          },
        },
      },
    });

    const activities = campaigns
      .filter((c) => !isArchivedCleanup(c.tags))
      .map((c) => {
        const snap = parseRulesSnapshot(c.rulesSnapshot);
        const tone = activityToneFromType(
          c.type,
          c.name,
          c.tags,
          c.rulesSnapshot
        );
        const products = c.catalogProducts
          .map((link) => link.product)
          .filter((p) => p.status !== "archived")
          .map((p) => ({
            id: p.id,
            name: p.name,
            status: p.status,
            slug: p.slug,
            type: p.type,
          }));
        return {
          id: c.id,
          name: c.name,
          type: c.type,
          status: c.status,
          productKind: c.productKind,
          templateId: c.templateId,
          slug: c.slug,
          endDate: c.endDate,
          tone,
          discountPercent: snap?.discountPercent ?? 0,
          exclusiveFeeTotalPercent: snap?.exclusiveFeeTotalPercent ?? null,
          enabledTiers: snap?.enabledTiers ?? [],
          enabled: storeIdsAllows(c.storeIds, store.id),
          products,
        };
      });

    // 兼容旧字段 products（与 activities 同形，id=campaignId）
    return NextResponse.json({
      data: {
        store: { id: store.id, name: store.name, slug: store.slug },
        activities,
        products: activities,
      },
    });
  } catch (error) {
    console.error("store catalog GET:", error);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

/**
 * PATCH /api/business/stores/[id]/catalog
 * body: { campaignId: string, enabled: boolean }
 * 门店开关某一活动参与
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json(
        { error: "请使用企业账号管理门店活动参与" },
        { status: 403 }
      );
    }

    const { id: storeId } = await params;
    const body = await request.json();
    const campaignId = body.campaignId as string;
    const enabled = Boolean(body.enabled);

    if (!campaignId) {
      return NextResponse.json({ error: "缺少 campaignId" }, { status: 400 });
    }

    const store = await prisma.store.findFirst({
      where: { id: storeId, businessId: session.userId },
    });
    if (!store) {
      return NextResponse.json({ error: "门店不存在" }, { status: 404 });
    }

    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        businessId: session.userId,
        role: { not: "product_mirror" },
      },
      select: { id: true, storeIds: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "活动不存在" }, { status: 404 });
    }

    const allStores = await prisma.store.findMany({
      where: { businessId: session.userId },
      select: { id: true },
    });
    const { setStoreListingEnabled } = await import("@/lib/utils");
    const next = setStoreListingEnabled(
      campaign.storeIds,
      storeId,
      enabled,
      allStores.map((s) => s.id)
    );

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { storeIds: next },
    });

    return NextResponse.json({
      data: { campaignId, storeId, enabled },
    });
  } catch (error) {
    console.error("store catalog PATCH:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

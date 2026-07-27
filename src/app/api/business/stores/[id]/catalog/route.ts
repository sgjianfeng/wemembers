import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { storeIdsAllows } from "@/lib/utils";
import { parseRulesSnapshot } from "@/lib/templates";

/**
 * GET /api/business/stores/[id]/catalog
 * 门店视角：本公司可上架的代金/抽奖产品 + 本店是否已启用
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
        // staff only own store
        const staff = await prisma.user.findUnique({
          where: { id: session.userId },
          select: { storeId: true },
        });
        if (staff?.storeId !== store.id) {
          return NextResponse.json({ error: "无权限" }, { status: 403 });
        }
      }
    }

    // Only activity campaigns — product_mirror is a purchase ledger twin of the
    // catalog product and would double every row in this store shelf UI.
    const campaigns = await prisma.campaign.findMany({
      where: {
        businessId: store.businessId,
        type: { in: ["voucher_sale", "lucky_draw_v2"] },
        status: { in: ["active", "draft"] },
        role: { not: "product_mirror" },
      },
      orderBy: { createdAt: "desc" },
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
        endDate: true,
      },
    });

    const data = campaigns.map((c) => {
      const snap = parseRulesSnapshot(c.rulesSnapshot);
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        productKind: c.productKind,
        templateId: c.templateId,
        slug: c.slug,
        endDate: c.endDate,
        discountPercent: snap?.discountPercent ?? 0,
        exclusiveFeeTotalPercent: snap?.exclusiveFeeTotalPercent ?? null,
        enabledTiers: snap?.enabledTiers ?? [],
        enabled: storeIdsAllows(c.storeIds, store.id),
      };
    });

    return NextResponse.json({
      data: {
        store: { id: store.id, name: store.name, slug: store.slug },
        products: data,
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
 * 门店开关某一产品
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      // 门店选用由企业账号操作；staff 如需可后续开放
      return NextResponse.json(
        { error: "请使用企业账号管理门店上架" },
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
      return NextResponse.json({ error: "产品不存在" }, { status: 404 });
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

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  parseStoreIdsScope,
  serializeStoreIds,
  setStoreListingEnabled,
  storeIdsAllows,
} from "@/lib/utils";

/**
 * GET /api/business/campaigns/[id]/stores
 * 活动门店上架列表
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    const { id } = await params;
    const campaign = await prisma.campaign.findFirst({
      where: { id, businessId: session.userId },
      select: {
        id: true,
        name: true,
        productKind: true,
        storeIds: true,
        status: true,
      },
    });
    if (!campaign) {
      return NextResponse.json({ error: "活动不存在" }, { status: 404 });
    }

    const stores = await prisma.store.findMany({
      where: { businessId: session.userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, slug: true, address: true },
    });

    const scope = parseStoreIdsScope(campaign.storeIds);
    const listings = stores.map((s) => ({
      ...s,
      enabled: storeIdsAllows(campaign.storeIds, s.id),
    }));

    return NextResponse.json({
      data: {
        campaignId: campaign.id,
        campaignName: campaign.name,
        productKind: campaign.productKind,
        mode: scope.mode,
        listings,
      },
    });
  } catch (error) {
    console.error("campaign stores GET:", error);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

/**
 * PATCH /api/business/campaigns/[id]/stores
 * body: { storeId: string, enabled: boolean }
 * 或 { storeIds: string[] }  bulk 覆盖启用列表（仅本公司门店）
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    const { id } = await params;
    const body = await request.json();

    const campaign = await prisma.campaign.findFirst({
      where: { id, businessId: session.userId },
      select: { id: true, storeIds: true, productKind: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "活动不存在" }, { status: 404 });
    }

    const allStores = await prisma.store.findMany({
      where: { businessId: session.userId },
      select: { id: true },
    });
    const allIds = allStores.map((s) => s.id);
    const allowed = new Set(allIds);

    let nextJson: string;

    if (Array.isArray(body.storeIds)) {
      const ids = (body.storeIds as unknown[]).filter(
        (x): x is string => typeof x === "string" && allowed.has(x)
      );
      nextJson = serializeStoreIds(ids);
    } else if (
      typeof body.storeId === "string" &&
      typeof body.enabled === "boolean"
    ) {
      if (!allowed.has(body.storeId)) {
        return NextResponse.json({ error: "门店不属于本企业" }, { status: 400 });
      }
      nextJson = setStoreListingEnabled(
        campaign.storeIds,
        body.storeId,
        body.enabled,
        allIds
      );
    } else {
      return NextResponse.json(
        { error: "请提供 storeId+enabled 或 storeIds[]" },
        { status: 400 }
      );
    }

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { storeIds: nextJson },
      select: { id: true, storeIds: true },
    });

    return NextResponse.json({
      data: {
        campaignId: updated.id,
        storeIds: parseStoreIdsScope(updated.storeIds),
        listings: allStores.map((s) => ({
          storeId: s.id,
          enabled: storeIdsAllows(updated.storeIds, s.id),
        })),
      },
    });
  } catch (error) {
    console.error("campaign stores PATCH:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

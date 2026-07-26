import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** GET 活动已挂券产品 */
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
      where: { id, businessId: session.userId, role: "activity" },
    });
    if (!campaign) {
      return NextResponse.json({ error: "活动不存在" }, { status: 404 });
    }
    const links = await prisma.campaignProduct.findMany({
      where: { campaignId: id },
      orderBy: { sortOrder: "asc" },
      include: { product: true },
    });
    return NextResponse.json({ data: links });
  } catch (e) {
    console.error("campaign products GET", e);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

/**
 * PUT 覆盖活动的券产品列表
 * body: { productIds: string[] }
 */
export async function PUT(
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
    const productIds = Array.isArray(body.productIds)
      ? (body.productIds as unknown[]).filter(
          (x): x is string => typeof x === "string"
        )
      : [];

    const campaign = await prisma.campaign.findFirst({
      where: { id, businessId: session.userId, role: "activity" },
    });
    if (!campaign) {
      return NextResponse.json({ error: "活动不存在" }, { status: 404 });
    }

    if (productIds.length) {
      const owned = await prisma.voucherProduct.count({
        where: {
          businessId: session.userId,
          id: { in: productIds },
        },
      });
      if (owned !== productIds.length) {
        return NextResponse.json(
          { error: "含有不属于本企业的券产品" },
          { status: 400 }
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.campaignProduct.deleteMany({ where: { campaignId: id } });
      if (productIds.length) {
        await tx.campaignProduct.createMany({
          data: productIds.map((productId, i) => ({
            campaignId: id,
            productId,
            sortOrder: i,
          })),
        });
      }
    });

    const links = await prisma.campaignProduct.findMany({
      where: { campaignId: id },
      orderBy: { sortOrder: "asc" },
      include: { product: true },
    });
    return NextResponse.json({ data: links });
  } catch (e) {
    console.error("campaign products PUT", e);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

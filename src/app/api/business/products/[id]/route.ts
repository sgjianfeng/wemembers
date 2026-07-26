import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { setProductStatus } from "@/lib/catalog";

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
    const product = await prisma.voucherProduct.findFirst({
      where: { id, businessId: session.userId },
      include: {
        campaignLinks: {
          include: {
            campaign: {
              select: {
                id: true,
                name: true,
                role: true,
                status: true,
                storeIds: true,
              },
            },
          },
        },
      },
    });
    if (!product) {
      return NextResponse.json({ error: "产品不存在" }, { status: 404 });
    }
    return NextResponse.json({ data: product });
  } catch (e) {
    console.error("product GET", e);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

/** PATCH 改名/说明/状态 active|archived|draft */
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

    const existing = await prisma.voucherProduct.findFirst({
      where: { id, businessId: session.userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "产品不存在" }, { status: 404 });
    }

    if (body.status === "active" || body.status === "archived" || body.status === "draft") {
      await setProductStatus(session.userId, id, body.status);
    }

    const data: { name?: string; description?: string | null; color?: string | null } =
      {};
    if (typeof body.name === "string" && body.name.trim()) {
      data.name = body.name.trim();
    }
    if (body.description !== undefined) {
      data.description =
        typeof body.description === "string" ? body.description : null;
    }
    if (body.color !== undefined) {
      data.color = typeof body.color === "string" ? body.color : null;
    }

    if (Object.keys(data).length) {
      await prisma.voucherProduct.update({ where: { id }, data });
      if (existing.mirrorCampaignId && data.name) {
        await prisma.campaign.update({
          where: { id: existing.mirrorCampaignId },
          data: { name: data.name, description: data.description },
        });
      }
    }

    const product = await prisma.voucherProduct.findUnique({ where: { id } });
    return NextResponse.json({ data: product });
  } catch (e) {
    console.error("product PATCH", e);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

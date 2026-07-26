import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  feeErrorMessage,
  normalizeBusinessTemplateInput,
  parseEnabledTiersJson,
} from "@/lib/business-templates";
import { getTemplate } from "@/lib/templates";
import { FEE_PLATFORM_PERCENT } from "@/lib/activity-fees";

function serializeRow(row: {
  id: string;
  name: string;
  baseTemplateId: string;
  kind: string;
  productKind: string;
  discountPercent: number | null;
  exclusiveTotalPercent: number | null;
  exclusiveSmallPrizePercent: number | null;
  exclusivePlatformFeePercent: number;
  exclusiveGrandPoolPercent: number | null;
  enabledTiers: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  const base = getTemplate(row.baseTemplateId);
  return {
    id: row.id,
    name: row.name,
    baseTemplateId: row.baseTemplateId,
    baseNameZh: base?.nameZh ?? row.baseTemplateId,
    kind: row.kind,
    productKind: row.productKind,
    discountPercent: row.discountPercent,
    exclusiveTotalPercent: row.exclusiveTotalPercent,
    exclusiveSmallPrizePercent: row.exclusiveSmallPrizePercent,
    exclusivePlatformFeePercent:
      row.exclusivePlatformFeePercent || FEE_PLATFORM_PERCENT,
    exclusiveGrandPoolPercent: row.exclusiveGrandPoolPercent,
    enabledTiers: parseEnabledTiersJson(row.enabledTiers),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

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
    const row = await prisma.businessTemplate.findFirst({
      where: { id, businessId: session.userId },
    });
    if (!row) return NextResponse.json({ error: "模版不存在" }, { status: 404 });
    return NextResponse.json({ data: serializeRow(row) });
  } catch (error) {
    console.error("business template GET:", error);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

/** PATCH 修改企业模版参数 */
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
    const existing = await prisma.businessTemplate.findFirst({
      where: { id, businessId: session.userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "模版不存在" }, { status: 404 });
    }

    const body = await request.json();
    let normalized;
    try {
      normalized = normalizeBusinessTemplateInput({
        baseTemplateId: existing.baseTemplateId,
        name: body.name ?? existing.name,
        discountPercent:
          body.discountPercent !== undefined
            ? body.discountPercent
            : existing.discountPercent,
        exclusiveTotalPercent:
          body.exclusiveTotalPercent !== undefined
            ? body.exclusiveTotalPercent
            : existing.exclusiveTotalPercent,
        exclusiveSmallPrizePercent:
          body.exclusiveSmallPrizePercent !== undefined
            ? body.exclusiveSmallPrizePercent
            : existing.exclusiveSmallPrizePercent,
        exclusiveGrandPoolPercent:
          body.exclusiveGrandPoolPercent !== undefined
            ? body.exclusiveGrandPoolPercent
            : existing.exclusiveGrandPoolPercent,
        enabledTiers:
          body.enabledTiers !== undefined
            ? body.enabledTiers
            : parseEnabledTiersJson(existing.enabledTiers),
      });
    } catch (e) {
      const code = e instanceof Error ? e.message : "INVALID";
      return NextResponse.json(
        { error: feeErrorMessage(code), code },
        { status: 400 }
      );
    }

    const row = await prisma.businessTemplate.update({
      where: { id: existing.id },
      data: {
        name: normalized.name,
        discountPercent: normalized.discountPercent,
        exclusiveTotalPercent: normalized.exclusiveTotalPercent,
        exclusiveSmallPrizePercent: normalized.exclusiveSmallPrizePercent,
        exclusivePlatformFeePercent: FEE_PLATFORM_PERCENT,
        exclusiveGrandPoolPercent: normalized.exclusiveGrandPoolPercent,
        enabledTiers: normalized.enabledTiersJson,
        ...(body.status === "archived" || body.status === "active"
          ? { status: body.status }
          : {}),
      },
    });

    return NextResponse.json({ data: serializeRow(row) });
  } catch (error) {
    console.error("business template PATCH:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

/** DELETE 归档（软删） */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    const { id } = await params;
    const existing = await prisma.businessTemplate.findFirst({
      where: { id, businessId: session.userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "模版不存在" }, { status: 404 });
    }
    await prisma.businessTemplate.update({
      where: { id },
      data: { status: "archived" },
    });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("business template DELETE:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}

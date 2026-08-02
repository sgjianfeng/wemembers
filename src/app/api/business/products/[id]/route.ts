import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { setProductStatus, updateVoucherProduct } from "@/lib/catalog";
import { parseRulesSnapshot } from "@/lib/templates";

function parseEnabledTiersFromProduct(product: {
  rulesSnapshot: string | null;
  voucherTiers: string | null;
}): number[] {
  const snap = parseRulesSnapshot(product.rulesSnapshot);
  if (Array.isArray(snap?.enabledTiers) && snap!.enabledTiers!.length) {
    return snap!.enabledTiers as number[];
  }
  if (product.voucherTiers) {
    try {
      const tiers = JSON.parse(product.voucherTiers) as { min?: number }[];
      if (Array.isArray(tiers)) {
        return tiers
          .map((t) => Number(t.min))
          .filter((n) => Number.isFinite(n) && n > 0)
          .sort((a, b) => a - b);
      }
    } catch {
      /* ignore */
    }
  }
  return [];
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
    const snap = parseRulesSnapshot(product.rulesSnapshot);
    return NextResponse.json({
      data: {
        ...product,
        enabledTiers: parseEnabledTiersFromProduct(product),
        packKind: (snap as { packKind?: string } | null)?.packKind || null,
        discountPercent: snap?.discountPercent ?? 0,
        exclusiveFeeTotalPercent:
          (snap as { exclusiveFeeTotalPercent?: number } | null)
            ?.exclusiveFeeTotalPercent ?? null,
        // 默认关：仅显式 true
        allowCustomerSplit: snap?.allowCustomerSplit === true,
        buyPath: product.slug ? `/voucher/${product.slug}` : null,
      },
    });
  } catch (e) {
    console.error("product GET", e);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

/** PATCH 改名/说明/面额档位/状态 active|archived|draft */
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

    try {
      if (
        body.name !== undefined ||
        body.description !== undefined ||
        body.enabledTiers !== undefined ||
        body.allowCustomerSplit !== undefined
      ) {
        await updateVoucherProduct(session.userId, id, {
          name: body.name,
          description: body.description,
          enabledTiers: body.enabledTiers,
          allowCustomerSplit:
            body.allowCustomerSplit === undefined
              ? undefined
              : body.allowCustomerSplit === true,
        });
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : "INVALID";
      const map: Record<string, string> = {
        TIERS_REQUIRED: "请至少选择一个面额（≥ S$2）",
        TIERS_TOO_MANY: "面额档位最多 20 个",
        NOT_FOUND: "产品不存在",
      };
      return NextResponse.json(
        { error: map[code] || code, code },
        { status: 400 }
      );
    }

    // color only (optional)
    if (body.color !== undefined) {
      await prisma.voucherProduct.update({
        where: { id },
        data: { color: typeof body.color === "string" ? body.color : null },
      });
    }

    const product = await prisma.voucherProduct.findUnique({ where: { id } });
    if (!product) {
      return NextResponse.json({ error: "产品不存在" }, { status: 404 });
    }
    return NextResponse.json({
      data: {
        ...product,
        enabledTiers: parseEnabledTiersFromProduct(product),
        buyPath: product.slug ? `/voucher/${product.slug}` : null,
      },
    });
  } catch (e) {
    console.error("product PATCH", e);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

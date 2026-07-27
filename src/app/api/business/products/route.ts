import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createVoucherProduct } from "@/lib/catalog";
import { feeErrorMessage } from "@/lib/business-templates";
import { parseRulesSnapshot } from "@/lib/templates";

/** GET 券产品列表 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const products = await prisma.voucherProduct.findMany({
      where: { businessId: session.userId },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { campaignLinks: true, vouchers: true } },
        campaignLinks: {
          include: {
            campaign: {
              select: { id: true, name: true, role: true, status: true },
            },
          },
        },
      },
    });

    return NextResponse.json({
      data: products.map((p) => {
        const snap = parseRulesSnapshot(p.rulesSnapshot);
        let enabledTiers: number[] = Array.isArray(snap?.enabledTiers)
          ? (snap!.enabledTiers as number[])
          : [];
        if (!enabledTiers.length && p.voucherTiers) {
          try {
            const tiers = JSON.parse(p.voucherTiers) as { min?: number }[];
            enabledTiers = tiers
              .map((t) => Number(t.min))
              .filter((n) => Number.isFinite(n) && n > 0)
              .sort((a, b) => a - b);
          } catch {
            /* ignore */
          }
        }
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          type: p.type,
          productKind: p.productKind,
          status: p.status,
          slug: p.slug,
          templateId: p.templateId,
          color: p.color,
          mirrorCampaignId: p.mirrorCampaignId,
          buyPath: p.slug ? `/voucher/${p.slug}` : null,
          activityCount: p.campaignLinks.filter(
            (l) => l.campaign.role === "activity"
          ).length,
          voucherCount: p._count.vouchers,
          enabledTiers,
          rulesSnapshot: p.rulesSnapshot,
          voucherTiers: p.voucherTiers,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
      }),
    });
  } catch (e) {
    console.error("products GET", e);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

/** POST 创建券产品 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const body = await request.json();
    try {
      const product = await createVoucherProduct(session.userId, {
        name: body.name,
        description: body.description,
        packKind: body.packKind,
        templateId: body.templateId,
        businessTemplateId: body.businessTemplateId,
        enabledTiers: body.enabledTiers,
        status: body.status === "draft" ? "draft" : "active",
        color: body.color,
        slug: body.slug,
        createShelfActivity: body.createShelfActivity !== false,
      });
      return NextResponse.json({ data: product });
    } catch (e) {
      const code = e instanceof Error ? e.message : "INVALID";
      const map: Record<string, string> = {
        NAME_REQUIRED: "请填写产品名称",
        TEMPLATE_OR_PACK_REQUIRED: "请选择默认包或模版",
      };
      return NextResponse.json(
        {
          error: map[code] || feeErrorMessage(code) || code,
          code,
        },
        { status: 400 }
      );
    }
  } catch (e) {
    console.error("products POST", e);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}

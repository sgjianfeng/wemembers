import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  feeErrorMessage,
  normalizeBusinessTemplateInput,
  parseEnabledTiersJson,
} from "@/lib/business-templates";
import { getTemplate, listTemplates } from "@/lib/templates";
import { FEE_PLATFORM_PERCENT } from "@/lib/activity-fees";

function serializeRow(row: {
  id: string;
  businessId: string;
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
    baseNameEn: base?.nameEn ?? row.baseTemplateId,
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
    isExclusive: row.kind === "draw",
    isVoucher: row.kind === "voucher_discount",
  };
}

/** GET 企业自定义模版 + 可拷贝的平台模版摘要 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const mine = await prisma.businessTemplate.findMany({
      where: { businessId: session.userId, status: "active" },
      orderBy: { updatedAt: "desc" },
    });

    const copyable = listTemplates()
      .filter(
        (t) =>
          t.id === "self_use_voucher" ||
          t.id === "exclusive_draw_15" ||
          t.id === "exclusive_draw_10"
      )
      .map((t) => ({
        id: t.id,
        nameZh: t.nameZh,
        nameEn: t.nameEn,
        icon: t.icon,
        taglineZh: t.taglineZh,
        taglineEn: t.taglineEn,
        kind: t.rules.kind,
        discountPercentDefault: t.rules.discountPercentDefault,
        discountPercentMin: t.rules.discountPercentMin,
        discountPercentMax: t.rules.discountPercentMax,
        exclusiveFeeTotalPercent: t.rules.exclusiveFeeTotalPercent,
        exclusiveSmallDefault:
          t.rules.exclusiveFeeTotalPercent === 10 ? 3 : t.rules.exclusiveFeeTotalPercent === 15 ? 3 : null,
        exclusiveGrandDefault:
          t.rules.exclusiveFeeTotalPercent === 10
            ? 5
            : t.rules.exclusiveFeeTotalPercent === 15
              ? 10
              : null,
        platformFeeLocked: FEE_PLATFORM_PERCENT,
        tiers: t.rules.tiers
          .filter((x) => x.enabledByDefault)
          .map((x) => x.amountSgd),
      }));

    return NextResponse.json({
      data: {
        mine: mine.map(serializeRow),
        copyable,
      },
    });
  } catch (error) {
    console.error("business templates GET:", error);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

/** POST 从平台模版拷贝为企业模版 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const body = await request.json();
    let normalized;
    try {
      normalized = normalizeBusinessTemplateInput({
        baseTemplateId: body.baseTemplateId,
        name: body.name,
        discountPercent: body.discountPercent,
        exclusiveTotalPercent: body.exclusiveTotalPercent,
        exclusiveSmallPrizePercent: body.exclusiveSmallPrizePercent,
        exclusiveGrandPoolPercent: body.exclusiveGrandPoolPercent,
        enabledTiers: body.enabledTiers,
      });
    } catch (e) {
      const code = e instanceof Error ? e.message : "INVALID";
      return NextResponse.json(
        { error: feeErrorMessage(code), code },
        { status: 400 }
      );
    }

    const row = await prisma.businessTemplate.create({
      data: {
        businessId: session.userId,
        name: normalized.name,
        baseTemplateId: normalized.baseTemplateId,
        kind: normalized.kind,
        productKind: normalized.productKind,
        discountPercent: normalized.discountPercent,
        exclusiveTotalPercent: normalized.exclusiveTotalPercent,
        exclusiveSmallPrizePercent: normalized.exclusiveSmallPrizePercent,
        exclusivePlatformFeePercent: normalized.exclusivePlatformFeePercent,
        exclusiveGrandPoolPercent: normalized.exclusiveGrandPoolPercent,
        enabledTiers: normalized.enabledTiersJson,
        status: "active",
      },
    });

    return NextResponse.json({ data: serializeRow(row) });
  } catch (error) {
    console.error("business templates POST:", error);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}

/**
 * 满赠活动参数：商家自己填「满多少、送多少、几天有效」。
 *
 * 以前这三个数写死在 ndp-promo.ts 里（满 120 送 61 / 30 天），满赠之外的商家
 * 想做满赠只能照抄满赠的数字。这里把它们交回给商家。
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  parseSpendGetRules,
  validateSpendGetRules,
  nominalCostPercent,
  businessOutstandingLiabilityCents,
} from "@/lib/spend-and-get";
import { buildSpendGetRulesSnapshot, parseSpendGetMetaFromCampaign } from "@/lib/spend-get-issue";
import { detectActivityCategory } from "@/lib/default-activities";

/** 找到该商家的满赠活动（满赠是它的一个预设） */
async function findSpendGetCampaign(businessId: string) {
  const campaigns = await prisma.campaign.findMany({
    where: { businessId, role: { not: "product_mirror" } },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      tags: true,
      status: true,
      rulesSnapshot: true,
      startDate: true,
      endDate: true,
      maxOutstandingCents: true,
      cashbackIssuedCents: true,
      cashbackRedeemedCents: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return campaigns.find((c) => detectActivityCategory(c) === "spend_get") || null;
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const campaign = await findSpendGetCampaign(session.userId);
  if (!campaign) {
    return NextResponse.json({ data: { campaign: null } });
  }

  const rules = parseSpendGetRules(campaign.rulesSnapshot);
  const meta = parseSpendGetMetaFromCampaign(campaign);
  const outstanding = await businessOutstandingLiabilityCents(
    prisma,
    session.userId
  );

  return NextResponse.json({
    data: {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        slug: campaign.slug,
        status: campaign.status,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
      },
      rules: {
        minSpendCents: rules.minSpendCents,
        giftCouponCents: rules.giftCouponCents,
        validDays: rules.validDays,
        dualProtection: rules.dualProtection,
      },
      enabled: meta.enabled,
      /** 赠额 / 门槛，用于和 cashback 的百分比费率对齐比较 */
      nominalCostPercent: Number(nominalCostPercent(rules).toFixed(1)),
      liability: {
        issuedCents: campaign.cashbackIssuedCents,
        redeemedCents: campaign.cashbackRedeemedCents,
        /** 全商家未核销额度（满赠 + cashback 合计） */
        businessOutstandingCents: outstanding,
        maxOutstandingCents: campaign.maxOutstandingCents,
      },
    },
  });
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "无权操作" }, { status: 403 });
    }

    const campaign = await findSpendGetCampaign(session.userId);
    if (!campaign) {
      return NextResponse.json({ error: "尚未创建满赠活动" }, { status: 404 });
    }

    const body = await request.json();
    const current = parseSpendGetRules(campaign.rulesSnapshot);

    const next = {
      minSpendCents:
        typeof body.minSpendCents === "number"
          ? Math.round(body.minSpendCents)
          : current.minSpendCents,
      giftCouponCents:
        typeof body.giftCouponCents === "number"
          ? Math.round(body.giftCouponCents)
          : current.giftCouponCents,
      validDays:
        typeof body.validDays === "number"
          ? Math.round(body.validDays)
          : current.validDays,
    };

    const check = validateSpendGetRules(next);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const meta = parseSpendGetMetaFromCampaign(campaign);
    const snapshot = buildSpendGetRulesSnapshot({
      buyVoucherSlug: meta.buyVoucherSlug,
      enabled: typeof body.enabled === "boolean" ? body.enabled : meta.enabled,
      dualProtection:
        typeof body.dualProtection === "boolean"
          ? body.dualProtection
          : current.dualProtection,
      ...next,
    });

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { rulesSnapshot: snapshot },
    });

    return NextResponse.json({
      data: {
        rules: next,
        nominalCostPercent: Number(nominalCostPercent(next).toFixed(1)),
        // 已发出的券按发放当时的规则执行，改参数不追溯
        note: "已发出的赠券按发放当时的面额与有效期执行，本次修改只影响之后的发放",
      },
    });
  } catch (e) {
    console.error("spend-get rules", e);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}

// POST /api/business/promo/ndp/setup — 一键创建/刷新国庆活动（今日上线）
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  buildNdpRulesSnapshot,
  NDP_GIFT_COUPON_CENTS,
  NDP_MIN_SPEND_CENTS,
  NDP_VALID_DAYS,
  ensureNdpGiftCoupon,
} from "@/lib/ndp-promo";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json(
        { error: "仅企业主可配置国庆活动" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const buyVoucherSlug =
      typeof body.buyVoucherSlug === "string"
        ? body.buyVoucherSlug.trim() || null
        : null;
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : "国庆满赠 · Spend S$120 Get S$61";

    // 若已有国庆活动则刷新
    let campaign = await prisma.campaign.findFirst({
      where: {
        businessId: session.userId,
        OR: [
          { type: "holiday" },
          { tags: { contains: "ndp" } },
          { slug: { startsWith: "ndp-" } },
          { name: { contains: "国庆" } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 2); // 活动窗 2 个月，足够国庆季

    const rulesSnapshot = buildNdpRulesSnapshot({
      buyVoucherSlug,
      enabled: true,
    });

    const baseSlug = `ndp-${session.userId.slice(-6)}-${new Date().getFullYear()}`;

    if (campaign) {
      campaign = await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          name,
          type: "holiday",
          status: "active",
          role: "activity",
          tags: JSON.stringify(["ndp", "national-day", "国庆"]),
          rulesSnapshot,
          minSpendCents: NDP_MIN_SPEND_CENTS,
          startDate: campaign.startDate < start ? campaign.startDate : start,
          endDate: end,
          description:
            typeof body.description === "string"
              ? body.description
              : `消费满 S$${NDP_MIN_SPEND_CENTS / 100} 送 S$${NDP_GIFT_COUPON_CENTS / 100} 下次用，并获大奖抽奖机会。购券机会约 5 倍。自领取起 ${NDP_VALID_DAYS} 天有效。`,
          ...(campaign.slug ? {} : { slug: baseSlug }),
        },
      });
    } else {
      // 保证 slug 唯一
      let slug = baseSlug;
      for (let i = 0; i < 5; i++) {
        const exists = await prisma.campaign.findUnique({
          where: { slug },
          select: { id: true },
        });
        if (!exists) break;
        slug = `${baseSlug}-${i + 1}`;
      }

      campaign = await prisma.campaign.create({
        data: {
          businessId: session.userId,
          name,
          type: "holiday",
          status: "active",
          role: "activity",
          slug,
          tags: JSON.stringify(["ndp", "national-day", "国庆"]),
          rulesSnapshot,
          minSpendCents: NDP_MIN_SPEND_CENTS,
          startDate: start,
          endDate: end,
          productKind: "self_use",
          description: `消费满 S$${NDP_MIN_SPEND_CENTS / 100} 送 S$${NDP_GIFT_COUPON_CENTS / 100} 下次用，并获大奖抽奖机会。购券机会约 5 倍。自领取起 ${NDP_VALID_DAYS} 天有效。`,
        },
      });
    }

    // 确保 61 券模版
    const templateUntil = new Date(end);
    templateUntil.setFullYear(templateUntil.getFullYear() + 1);
    await prisma.$transaction((tx) =>
      ensureNdpGiftCoupon(tx, {
        businessId: session.userId,
        campaignId: campaign!.id,
        giftCouponCents: NDP_GIFT_COUPON_CENTS,
        templateValidUntil: templateUntil,
      })
    );

    // 若未指定购券 slug，尝试挂上企业最新抽奖活动
    let resolvedBuy = buyVoucherSlug;
    if (!resolvedBuy) {
      const draw = await prisma.campaign.findFirst({
        where: {
          businessId: session.userId,
          type: { in: ["lucky_draw_v2", "voucher_sale"] },
          status: { in: ["active", "draft"] },
          slug: { not: null },
          id: { not: campaign.id },
        },
        orderBy: { createdAt: "desc" },
        select: { slug: true, id: true },
      });
      if (draw?.slug) {
        resolvedBuy = draw.slug;
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            rulesSnapshot: buildNdpRulesSnapshot({
              buyVoucherSlug: draw.slug,
              enabled: true,
            }),
          },
        });
      }
    }

    // 购券活动也写入 ndp 标记，便于核销自动发 61
    if (resolvedBuy) {
      await prisma.campaign.updateMany({
        where: {
          businessId: session.userId,
          slug: resolvedBuy,
        },
        data: {
          // 合并困难：直接 append 一段 ndp 到 snapshot 若为空则新建
        },
      });
      const buyCamp = await prisma.campaign.findFirst({
        where: { businessId: session.userId, slug: resolvedBuy },
      });
      if (buyCamp) {
        let snap: Record<string, unknown> = {};
        try {
          snap = buyCamp.rulesSnapshot
            ? (JSON.parse(buyCamp.rulesSnapshot) as Record<string, unknown>)
            : {};
        } catch {
          snap = {};
        }
        snap.ndp = {
          enabled: true,
          minSpendCents: NDP_MIN_SPEND_CENTS,
          giftCouponCents: NDP_GIFT_COUPON_CENTS,
          validDays: NDP_VALID_DAYS,
          giftWeightFactor: 0.2,
          buyVoucherSlug: resolvedBuy,
        };
        await prisma.campaign.update({
          where: { id: buyCamp.id },
          data: { rulesSnapshot: JSON.stringify(snap) },
        });
      }
    }

    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get("origin") ||
      "https://wemembers.store";
    const slug = campaign.slug || campaign.id;
    const tableUrl = `${origin}/ndp/${encodeURIComponent(slug)}?from=table`;
    const counterUrl = `${origin}/ndp/${encodeURIComponent(slug)}?from=counter`;

    return NextResponse.json({
      data: {
        campaignId: campaign.id,
        slug,
        name: campaign.name,
        tableUrl,
        counterUrl,
        buyVoucherSlug: resolvedBuy,
        qrTable: `/api/campaign/qr?slug=${encodeURIComponent(slug)}&ndp=1&from=table&size=400&format=png`,
        qrCounter: `/api/campaign/qr?slug=${encodeURIComponent(slug)}&ndp=1&from=counter&size=400&format=png`,
        minSpendSgd: NDP_MIN_SPEND_CENTS / 100,
        giftSgd: NDP_GIFT_COUPON_CENTS / 100,
        validDays: NDP_VALID_DAYS,
        staffIssuePath: "/business/ndp-issue",
        scanPath: "/business/scan",
      },
    });
  } catch (e) {
    console.error("ndp setup", e);
    return NextResponse.json({ error: "配置失败" }, { status: 500 });
  }
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const campaign = await prisma.campaign.findFirst({
    where: {
      businessId: session.userId,
      OR: [
        { type: "holiday" },
        { tags: { contains: "ndp" } },
        { slug: { startsWith: "ndp-" } },
        { name: { contains: "国庆" } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  if (!campaign) {
    return NextResponse.json({ data: null });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || "https://wemembers.store";
  const slug = campaign.slug || campaign.id;

  return NextResponse.json({
    data: {
      campaignId: campaign.id,
      slug,
      name: campaign.name,
      status: campaign.status,
      tableUrl: `${origin}/ndp/${encodeURIComponent(slug)}?from=table`,
      counterUrl: `${origin}/ndp/${encodeURIComponent(slug)}?from=counter`,
    },
  });
}

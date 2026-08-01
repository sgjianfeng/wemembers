// POST /api/business/promo/ndp/setup — 一键补齐默认活动（长期 + 大奖倒计时 + 国庆）
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ensureDefaultActivities,
  categoryLabel,
  type DefaultActivityCategory,
} from "@/lib/default-activities";
import {
  NDP_GIFT_COUPON_CENTS,
  NDP_MIN_SPEND_CENTS,
  NDP_VALID_DAYS,
} from "@/lib/ndp-promo";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json(
        { error: "仅企业主可配置默认活动" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const forceNdpRefresh = body.forceNdpRefresh === true;
    const lang = body.lang === "en" ? "en" : "zh";

    const result = await ensureDefaultActivities(session.userId, {
      lang,
      forceNdpRefresh,
    });

    const ndp = result.ndpCampaignId
      ? await prisma.campaign.findUnique({
          where: { id: result.ndpCampaignId },
          select: { id: true, slug: true, name: true, status: true },
        })
      : null;

    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get("origin") ||
      "https://wemembers.store";
    const slug = ndp?.slug || ndp?.id || "";
    const tableUrl = slug
      ? `${origin}/ndp/${encodeURIComponent(slug)}?from=table`
      : null;
    const counterUrl = slug
      ? `${origin}/ndp/${encodeURIComponent(slug)}?from=counter`
      : null;

    const byCategory = {
      long_term: result.slots.filter((s) => s.category === "long_term"),
      grand_countdown: result.slots.filter(
        (s) => s.category === "grand_countdown"
      ),
      ndp: result.slots.filter((s) => s.category === "ndp"),
    };

    return NextResponse.json({
      data: {
        created: result.created,
        existing: result.existing,
        slots: result.slots,
        byCategory,
        categories: (["long_term", "grand_countdown", "ndp"] as const).map(
          (c: DefaultActivityCategory) => ({
            id: c,
            label: categoryLabel(c, lang),
            count: byCategory[c].length,
          })
        ),
        campaignId: ndp?.id || null,
        slug: slug || null,
        name: ndp?.name || null,
        tableUrl,
        counterUrl,
        buyVoucherSlug: result.grandCampaignSlug,
        qrTable: slug
          ? `/api/campaign/qr?slug=${encodeURIComponent(slug)}&ndp=1&from=table&size=400&format=png`
          : null,
        qrCounter: slug
          ? `/api/campaign/qr?slug=${encodeURIComponent(slug)}&ndp=1&from=counter&size=400&format=png`
          : null,
        minSpendSgd: NDP_MIN_SPEND_CENTS / 100,
        giftSgd: NDP_GIFT_COUPON_CENTS / 100,
        validDays: NDP_VALID_DAYS,
        staffIssuePath: "/business/ndp-issue",
        offersPath: "/business/offers",
        scanPath: "/business/scan",
        message:
          lang === "en"
            ? "Defaults ready: evergreen · grand countdown · National Day"
            : "默认活动已就绪：长期 · 大奖倒计时 · 国庆满赠",
      },
    });
  } catch (e) {
    console.error("default activities setup", e);
    return NextResponse.json({ error: "配置失败" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const origin = (
    process.env.NEXT_PUBLIC_APP_URL || "https://wemembers.store"
  ).replace(/\/$/, "");

  // 不自动创建，只读现状
  const campaigns = await prisma.campaign.findMany({
    where: {
      businessId: session.userId,
      role: { not: "product_mirror" },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      tags: true,
      rulesSnapshot: true,
      status: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const { detectActivityCategory } = await import("@/lib/default-activities");
  const ndp = campaigns.find((c) => detectActivityCategory(c) === "ndp");
  const grand = campaigns.find(
    (c) => detectActivityCategory(c) === "grand_countdown"
  );
  const longTerm = campaigns.filter(
    (c) => detectActivityCategory(c) === "long_term"
  );

  const slug = ndp?.slug || ndp?.id;
  return NextResponse.json({
    data: ndp
      ? {
          campaignId: ndp.id,
          slug,
          name: ndp.name,
          status: ndp.status,
          tableUrl: slug
            ? `${origin.replace(/\/$/, "")}/ndp/${encodeURIComponent(slug)}?from=table`
            : null,
          counterUrl: slug
            ? `${origin.replace(/\/$/, "")}/ndp/${encodeURIComponent(slug)}?from=counter`
            : null,
          buyVoucherSlug: grand?.slug || null,
          defaults: {
            long_term: longTerm.length,
            grand_countdown: grand ? 1 : 0,
            ndp: 1,
          },
        }
      : {
          campaignId: null,
          defaults: {
            long_term: longTerm.length,
            grand_countdown: grand ? 1 : 0,
            ndp: 0,
          },
        },
  });
}

// GET /api/join/context?storeId=xxx
// 结账参加大奖：门店 + 本店抽奖活动 + 档位 +（登录时）本企业可核余额

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseRulesSnapshot } from "@/lib/templates";

function storeIdsIncludes(storeIdsJson: string | null | undefined, storeId: string): boolean {
  if (storeIdsJson == null || storeIdsJson === "" || storeIdsJson === "null") {
    return true; // 不限门店
  }
  try {
    const arr = JSON.parse(storeIdsJson) as unknown;
    if (!Array.isArray(arr) || arr.length === 0) return true;
    return arr.map(String).includes(storeId);
  } catch {
    return true;
  }
}

export async function GET(request: NextRequest) {
  try {
    const storeId = request.nextUrl.searchParams.get("storeId")?.trim();
    if (!storeId) {
      return NextResponse.json({ error: "缺少 storeId" }, { status: 400 });
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        slug: true,
        address: true,
        businessId: true,
        business: {
          select: {
            id: true,
            businessName: true,
            businessSlug: true,
            businessLogo: true,
          },
        },
      },
    });
    if (!store) {
      return NextResponse.json({ error: "门店不存在" }, { status: 404 });
    }

    const campaigns = await prisma.campaign.findMany({
      where: {
        businessId: store.businessId,
        status: "active",
        type: { in: ["lucky_draw", "lucky_draw_v2"] },
        role: { not: "product_mirror" }, // 优先真实活动；镜像作后备
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    // 含 product_mirror 的抽奖（券产品镜像）作后备
    const mirrors = await prisma.campaign.findMany({
      where: {
        businessId: store.businessId,
        status: "active",
        type: { in: ["lucky_draw", "lucky_draw_v2"] },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    const pool = [...campaigns, ...mirrors];
    const atStore = pool.filter((c) => storeIdsIncludes(c.storeIds, store.id));

    // 优先独享/self_use 抽奖，再任意抽奖
    const pick =
      atStore.find(
        (c) =>
          c.productKind === "self_use" ||
          (parseRulesSnapshot(c.rulesSnapshot)?.packKind === "exclusive_ballot")
      ) ||
      atStore.find((c) => c.role !== "product_mirror") ||
      atStore[0] ||
      null;

    if (!pick) {
      return NextResponse.json({
        data: {
          store: {
            id: store.id,
            name: store.name,
            slug: store.slug,
            address: store.address,
            businessName: store.business.businessName,
            businessSlug: store.business.businessSlug,
            businessLogo: store.business.businessLogo,
          },
          campaign: null,
          tiers: [] as number[],
          loggedIn: false,
          balanceSgd: 0,
          balanceCents: 0,
        },
      });
    }

    const snap = parseRulesSnapshot(pick.rulesSnapshot);
    let tiers = (snap?.enabledTiers || [])
      .map((n) => Math.round(Number(n)))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (tiers.length === 0) {
      try {
        const vt = JSON.parse(pick.voucherTiers || "[]") as Array<{ min?: number }>;
        tiers = vt
          .map((x) => Math.round(Number(x.min)))
          .filter((n) => Number.isFinite(n) && n > 0);
      } catch {
        tiers = [50, 100];
      }
    }
    tiers = [...new Set(tiers)].sort((a, b) => a - b);

    // 公开 slug：优先关联券产品
    let publicSlug = pick.slug || pick.id;
    const product = await prisma.voucherProduct.findFirst({
      where: {
        businessId: store.businessId,
        OR: [
          { mirrorCampaignId: pick.id },
          { slug: pick.slug || undefined },
        ],
        status: { in: ["active", "draft"] },
      },
      select: { slug: true, name: true },
    });
    if (product?.slug) publicSlug = product.slug;

    const session = await getSession();
    let balanceCents = 0;
    let loggedIn = false;
    if (session?.role === "customer") {
      loggedIn = true;
      const vouchers = await prisma.voucher.findMany({
        where: {
          customerId: session.userId,
          status: "active",
          campaign: { businessId: store.businessId },
        },
        select: { balanceCents: true },
      });
      balanceCents = vouchers.reduce((s, v) => s + v.balanceCents, 0);
    }

    return NextResponse.json({
      data: {
        store: {
          id: store.id,
          name: store.name,
          slug: store.slug,
          address: store.address,
          businessName: store.business.businessName,
          businessSlug: store.business.businessSlug,
          businessLogo: store.business.businessLogo,
        },
        campaign: {
          id: pick.id,
          name: product?.name || pick.name,
          slug: publicSlug,
          type: pick.type,
          productKind: pick.productKind,
        },
        tiers,
        loggedIn,
        balanceCents,
        balanceSgd: Math.round(balanceCents) / 100,
      },
    });
  } catch (error) {
    console.error("join/context error:", error);
    return NextResponse.json({ error: "加载失败" }, { status: 500 });
  }
}

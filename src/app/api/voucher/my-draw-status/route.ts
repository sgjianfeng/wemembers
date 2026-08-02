// GET /api/voucher/my-draw-status?slug=xxx
// 登录顾客：本活动下的抽奖资格、待转即时奖、大奖权重

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveTier } from "@/lib/draw-v2";
import {
  isDrawSnapshot,
  legacyDrawSnapshot,
  parseRulesSnapshot,
} from "@/lib/templates";

async function resolveCampaignId(slug: string): Promise<{
  campaignId: string;
  name: string;
  type: string;
} | null> {
  const product = await prisma.voucherProduct.findFirst({
    where: { slug, status: { in: ["active", "draft", "archived"] } },
    select: {
      name: true,
      type: true,
      mirrorCampaignId: true,
    },
  });
  if (product?.mirrorCampaignId) {
    return {
      campaignId: product.mirrorCampaignId,
      name: product.name,
      type: product.type,
    };
  }

  const campaign = await prisma.campaign.findFirst({
    where: {
      OR: [{ slug }, { id: slug }],
      type: { in: ["lucky_draw", "lucky_draw_v2", "voucher_sale"] },
    },
    select: { id: true, name: true, type: true },
  });
  if (!campaign) return null;
  return {
    campaignId: campaign.id,
    name: campaign.name,
    type: campaign.type,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "customer") {
      return NextResponse.json({
        data: {
          loggedIn: false,
          hasEntries: false,
          pendingInstant: [],
          claimedInstant: [],
          totalWeight: 0,
          entryCount: 0,
          balanceTotalSgd: "0.00",
        },
      });
    }

    const slug = request.nextUrl.searchParams.get("slug")?.trim();
    if (!slug) {
      return NextResponse.json({ error: "缺少 slug" }, { status: 400 });
    }

    const resolved = await resolveCampaignId(slug);
    if (!resolved) {
      return NextResponse.json({ error: "活动不存在" }, { status: 404 });
    }

    const vouchers = await prisma.voucher.findMany({
      where: {
        customerId: session.userId,
        campaignId: resolved.campaignId,
        status: { in: ["active", "exhausted", "withdrawn"] },
      },
      include: {
        draws: {
          where: { drawType: "instant" },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    });

    const campaign = await prisma.campaign.findUnique({
      where: { id: resolved.campaignId },
      select: {
        type: true,
        budgetPercent: true,
        rulesSnapshot: true,
      },
    });

    const snapshot =
      parseRulesSnapshot(campaign?.rulesSnapshot) ||
      legacyDrawSnapshot(campaign?.budgetPercent || 20);
    const isDraw =
      isDrawSnapshot(snapshot) ||
      campaign?.type === "lucky_draw" ||
      campaign?.type === "lucky_draw_v2";

    type Pending = {
      voucherId: string;
      faceSgd: number;
      balanceSgd: string;
      shortCode: string | null;
      tier: string;
      drawWeight: number;
      instantCapSgd: number;
    };

    const pendingInstant: Pending[] = [];
    const claimedInstant: Array<{
      voucherId: string;
      name: string;
      icon: string;
      valueSgd: string;
      at: string;
    }> = [];
    let totalWeight = 0;
    let balanceTotal = 0;

    for (const v of vouchers) {
      totalWeight += Math.max(0, v.drawWeight || 0);
      balanceTotal += Math.max(0, v.balanceCents || 0);

      const faceSgd = Math.round(v.amountCents / 100);
      const tier = resolveTier(faceSgd);
      const instantCap = tier?.instantPrizeCap ?? 0;
      const instantDraw = v.draws[0];

      if (instantDraw) {
        claimedInstant.push({
          voucherId: v.id,
          name: instantDraw.prizeName || "",
          icon: instantDraw.prizeIcon || "🎁",
          valueSgd: ((instantDraw.valueCents || 0) / 100).toFixed(2),
          at: instantDraw.createdAt.toISOString(),
        });
      } else if (isDraw && instantCap > 0 && v.status === "active") {
        pendingInstant.push({
          voucherId: v.id,
          faceSgd,
          balanceSgd: (v.balanceCents / 100).toFixed(2),
          shortCode: v.shortCode,
          tier: v.tier,
          drawWeight: v.drawWeight,
          instantCapSgd: instantCap,
        });
      }
    }

    return NextResponse.json({
      data: {
        loggedIn: true,
        hasEntries: vouchers.length > 0,
        campaignId: resolved.campaignId,
        campaignName: resolved.name,
        isDraw,
        entryCount: vouchers.length,
        totalWeight,
        balanceTotalSgd: (balanceTotal / 100).toFixed(2),
        pendingInstant,
        claimedInstant,
        entries: vouchers.map((v) => ({
          voucherId: v.id,
          shortCode: v.shortCode,
          faceSgd: (v.amountCents / 100).toFixed(2),
          balanceSgd: (v.balanceCents / 100).toFixed(2),
          drawWeight: v.drawWeight,
          status: v.status,
          hasInstant: Boolean(v.draws[0]),
        })),
      },
    });
  } catch (error) {
    console.error("my-draw-status error:", error);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

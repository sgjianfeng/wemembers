// POST /api/voucher/claim-instant
// 购券后点转盘才抽即时小奖（若购券时已抽过则幂等返回）

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveTier } from "@/lib/draw-v2";
import { awardInstantPrizeToVoucher } from "@/lib/instant-prize";
import {
  isDrawSnapshot,
  legacyDrawSnapshot,
  parseRulesSnapshot,
} from "@/lib/templates";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "customer") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const voucherId =
      typeof body.voucherId === "string" ? body.voucherId.trim() : "";
    if (!voucherId) {
      return NextResponse.json({ error: "缺少 voucherId" }, { status: 400 });
    }

    const voucher = await prisma.voucher.findFirst({
      where: { id: voucherId, customerId: session.userId },
      include: {
        campaign: {
          select: {
            id: true,
            type: true,
            budgetPercent: true,
            rulesSnapshot: true,
            instantPoolCents: true,
          },
        },
        draws: {
          where: { drawType: "instant" },
          take: 1,
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!voucher) {
      return NextResponse.json({ error: "券不存在" }, { status: 404 });
    }

    const campaign = voucher.campaign;
    if (!campaign) {
      return NextResponse.json({ error: "活动不存在" }, { status: 404 });
    }

    const snapshot =
      parseRulesSnapshot(campaign.rulesSnapshot) ||
      legacyDrawSnapshot(campaign.budgetPercent || 20);
    const isDraw =
      isDrawSnapshot(snapshot) ||
      campaign.type === "lucky_draw" ||
      campaign.type === "lucky_draw_v2";

    if (!isDraw) {
      return NextResponse.json(
        { error: "本券无即时抽奖" },
        { status: 400 }
      );
    }

    // 已抽过：幂等返回
    const existing = voucher.draws[0];
    if (existing) {
      return NextResponse.json({
        data: {
          alreadyClaimed: true,
          instantPrize: {
            name: existing.prizeName || "",
            icon: existing.prizeIcon || "🎁",
            valueSgd: ((existing.valueCents || 0) / 100).toFixed(2),
          },
          balanceSgd: (voucher.balanceCents / 100).toFixed(2),
        },
      });
    }

    const faceSgd = Math.round(voucher.amountCents / 100);
    const tier = resolveTier(faceSgd);
    if (!tier || tier.instantPrizeCap <= 0) {
      return NextResponse.json({
        data: {
          alreadyClaimed: false,
          instantPrize: null,
          balanceSgd: (voucher.balanceCents / 100).toFixed(2),
          message: "本档无即时小奖",
        },
      });
    }

    const awarded = await awardInstantPrizeToVoucher(prisma, {
      voucherId: voucher.id,
      campaignId: campaign.id,
      tier,
      weightAtTime: voucher.drawWeight,
      instantPoolCents: campaign.instantPoolCents || 0,
      recomputeWeight: true,
    });

    return NextResponse.json({
      data: {
        alreadyClaimed: false,
        instantPrize: {
          name: awarded.prize.name,
          icon: awarded.prize.icon,
          valueSgd: (awarded.prize.valueCents / 100).toFixed(2),
        },
        balanceSgd: (awarded.balanceAfterCents / 100).toFixed(2),
      },
    });
  } catch (error) {
    console.error("claim-instant error:", error);
    return NextResponse.json({ error: "领取失败" }, { status: 500 });
  }
}

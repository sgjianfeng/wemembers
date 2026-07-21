// POST /api/voucher/split
// 将一张有效券的剩余余额拆成多张小券（金额之和必须等于余额）
// Body: { voucherId: string, partsSgd: number[] }  e.g. [50, 25, 25]
// 最多 3 档：常见「一半一张 + 另一半再拆两张」

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calculateTierWeight, resolveTier } from "@/lib/draw-v2";

const MAX_PARTS = 3;
const MIN_PART_CENTS = 100; // S$1

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "customer") {
      return NextResponse.json({ error: "请先登录顾客账号" }, { status: 401 });
    }

    const body = await request.json();
    const voucherId =
      typeof body.voucherId === "string" ? body.voucherId.trim() : "";
    const partsRaw = body.partsSgd;

    if (!voucherId || !Array.isArray(partsRaw) || partsRaw.length < 2) {
      return NextResponse.json(
        { error: "请至少拆成 2 张券，并指定每张金额" },
        { status: 400 }
      );
    }
    if (partsRaw.length > MAX_PARTS) {
      return NextResponse.json(
        { error: "最多拆成 3 张券" },
        { status: 400 }
      );
    }

    const partsCents: number[] = [];
    for (const p of partsRaw) {
      const sgd = Number(p);
      if (!Number.isFinite(sgd) || sgd <= 0) {
        return NextResponse.json({ error: "拆分金额无效" }, { status: 400 });
      }
      // 支持一位小数 S$（分）
      const cents = Math.round(sgd * 100);
      if (cents < MIN_PART_CENTS) {
        return NextResponse.json(
          { error: "每张至少 S$1" },
          { status: 400 }
        );
      }
      partsCents.push(cents);
    }

    const parent = await prisma.voucher.findFirst({
      where: {
        id: voucherId,
        customerId: session.userId,
        status: "active",
      },
      include: {
        campaign: { select: { type: true } },
      },
    });

    if (!parent) {
      return NextResponse.json({ error: "券不存在或不可用" }, { status: 404 });
    }
    if (parent.balanceCents <= 0) {
      return NextResponse.json({ error: "余额为 0，无法拆分" }, { status: 400 });
    }

    const sum = partsCents.reduce((a, b) => a + b, 0);
    if (sum !== parent.balanceCents) {
      return NextResponse.json(
        {
          error: `拆分金额合计须等于余额 S$${(parent.balanceCents / 100).toFixed(2)}（当前合计 S$${(sum / 100).toFixed(2)}）`,
        },
        { status: 400 }
      );
    }

    const isDraw = parent.campaign?.type === "lucky_draw_v2";
    const totalBal = parent.balanceCents;

    // 按余额占比分摊 paidCents，余数落到最后一张
    let paidAllocated = 0;
    const childrenPaid: number[] = partsCents.map((c, i) => {
      if (i === partsCents.length - 1) {
        return Math.max(0, parent.paidCents - paidAllocated);
      }
      const share =
        totalBal > 0
          ? Math.floor((parent.paidCents * c) / totalBal)
          : 0;
      paidAllocated += share;
      return share;
    });

    const created = await prisma.$transaction(async (tx) => {
      // 锁住母券
      const locked = await tx.voucher.findFirst({
        where: {
          id: voucherId,
          customerId: session.userId,
          status: "active",
          balanceCents: parent.balanceCents,
        },
      });
      if (!locked) {
        throw new Error("CONFLICT");
      }

      await tx.voucher.update({
        where: { id: voucherId },
        data: {
          balanceCents: 0,
          status: "exhausted",
          // 标记已拆：used 不增加（不是消费）
        },
      });

      const kids = [];
      for (let i = 0; i < partsCents.length; i++) {
        const amountCents = partsCents[i];
        const paidCents = childrenPaid[i];
        const tierResolved = resolveTier(amountCents / 100);
        const tier = tierResolved?.tier || parent.tier || "small";
        const drawWeight = isDraw
          ? calculateTierWeight(amountCents, tier as "small" | "medium" | "large", amountCents, 0, 0)
          : 0;

        const child = await tx.voucher.create({
          data: {
            customerId: parent.customerId,
            campaignId: parent.campaignId,
            storeId: parent.storeId,
            sellerId: parent.sellerId,
            stripeSessionId: null,
            amountCents,
            paidCents,
            sellerCommissionCents: 0,
            platformFeeCents: 0,
            usedCents: 0,
            balanceCents: amountCents,
            withdrawnCents: 0,
            instantPrizeClawedCents: 0,
            prizePoolContribution: 0,
            drawWeight,
            tier,
            status: "active",
          },
        });
        kids.push(child);
      }
      return kids;
    });

    return NextResponse.json({
      data: {
        parentId: voucherId,
        count: created.length,
        vouchers: created.map((v) => ({
          id: v.id,
          balanceSgd: (v.balanceCents / 100).toFixed(2),
          amountSgd: (v.amountCents / 100).toFixed(2),
        })),
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "CONFLICT") {
      return NextResponse.json(
        { error: "券状态已变化，请刷新后重试" },
        { status: 409 }
      );
    }
    console.error("voucher split error:", e);
    return NextResponse.json({ error: "拆券失败" }, { status: 500 });
  }
}

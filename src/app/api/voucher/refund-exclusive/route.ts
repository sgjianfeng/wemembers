import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { exclusiveRefundMaxCents } from "@/lib/activity-fees";

/**
 * POST /api/voucher/refund-exclusive
 * 独享退款：最多退面值 10%（小奖已抽心智）
 * Body: { voucherId }
 * 顾客申请或企业代退均可（须券主或发券企业）
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    const voucherId =
      typeof body.voucherId === "string" ? body.voucherId.trim() : "";
    if (!voucherId) {
      return NextResponse.json({ error: "缺少券 ID" }, { status: 400 });
    }

    const voucher = await prisma.voucher.findUnique({
      where: { id: voucherId },
      include: {
        campaign: {
          select: { businessId: true, productKind: true, type: true, name: true },
        },
        physicalTicket: { select: { id: true, code: true } },
      },
    });

    if (!voucher) {
      return NextResponse.json({ error: "券不存在" }, { status: 404 });
    }

    const isExclusive =
      voucher.productKind === "self_use" &&
      (voucher.campaign?.type === "lucky_draw_v2" ||
        voucher.campaign?.type === "lucky_draw" ||
        voucher.drawWeight > 0);

    if (!isExclusive && voucher.productKind === "self_use") {
      // 纯自用也可按 10% 上限？定稿仅独享；自用暂拒绝
      if (voucher.campaign?.type === "voucher_sale") {
        return NextResponse.json(
          { error: "自用代金退款请联系门店处理" },
          { status: 400 }
        );
      }
    }

    if (voucher.productKind !== "self_use") {
      return NextResponse.json(
        { error: "仅独享/自用路径支持此退款接口" },
        { status: 400 }
      );
    }

    const isOwner = session.userId === voucher.customerId;
    const isBiz =
      session.role === "business" &&
      session.userId === voucher.campaign?.businessId;
    if (!isOwner && !isBiz) {
      return NextResponse.json({ error: "无权退款此券" }, { status: 403 });
    }

    if (voucher.status === "withdrawn" || voucher.status === "expired") {
      return NextResponse.json({ error: "券状态不可退" }, { status: 400 });
    }
    if (voucher.usedCents > 0) {
      return NextResponse.json(
        { error: "已有消费记录，无法退款" },
        { status: 400 }
      );
    }

    const maxRefund = exclusiveRefundMaxCents(voucher.amountCents);
    const refundCents = Math.min(maxRefund, voucher.paidCents || maxRefund);

    await prisma.$transaction(async (tx) => {
      await tx.voucher.update({
        where: { id: voucher.id },
        data: {
          status: "exhausted",
          balanceCents: 0,
          // 标记退款占用 used 说明
        },
      });
      if (voucher.physicalTicket) {
        await tx.physicalTicket.update({
          where: { id: voucher.physicalTicket.id },
          data: { status: "void" },
        });
      }
      // 企业侧：大奖 10% 可退回 gift 优先？定稿：退回可提 balance 作为「退款应付」简化
      // 顾客线上退款由 Stripe 人工/后续对接；此处记流水
      if (voucher.campaign?.businessId && refundCents > 0) {
        const acct = await tx.tokenAccount.findUnique({
          where: { userId: voucher.campaign.businessId },
        });
        if (acct) {
          // 大奖池进度回退（最多面值 10%）
          const camp = await tx.campaign.findUnique({
            where: { id: voucher.campaignId },
            select: { grandPoolCents: true },
          });
          const dec = Math.min(refundCents, camp?.grandPoolCents ?? 0);
          if (dec > 0) {
            await tx.campaign.update({
              where: { id: voucher.campaignId },
              data: { grandPoolCents: { decrement: dec } },
            });
          }
          await tx.tokenTransaction.create({
            data: {
              accountId: acct.id,
              amount: 0,
              type: "exclusive_refund_note",
              description: `独享退款（最多面值10%）应付顾客 S$${(refundCents / 100).toFixed(2)} · 券 ${voucher.shortCode || voucher.id.slice(0, 8)} · 小奖已抽不可全退`,
              referenceId: voucher.id,
              balanceAfter: acct.balance,
            },
          });
        }
      }
    });

    return NextResponse.json({
      data: {
        voucherId: voucher.id,
        refundCents,
        refundSgd: (refundCents / 100).toFixed(2),
        maxPercent: 10,
        message:
          "独享退款上限为面值 10%（小奖已抽）。请向顾客退还上述金额；券已作废。",
      },
    });
  } catch (error) {
    console.error("exclusive refund error:", error);
    return NextResponse.json({ error: "退款失败" }, { status: 500 });
  }
}

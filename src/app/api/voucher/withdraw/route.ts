// POST /api/voucher/withdraw — customer withdraws unused balance
// Draw: 5% fee + claw back unpaid instant prize face value
// Promo voucher: 2% fee, no pool

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { splitWithdrawAmount } from "@/lib/withdraw-economics";
import { calculateTierWeight } from "@/lib/draw-v2";
import { grantBusinessIncomeHold, releaseMaturedHolds } from "@/lib/tokens";
import { stripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "customer") {
      return NextResponse.json({ error: "请使用顾客账号提现" }, { status: 403 });
    }

    const body = await request.json();
    const voucherId = body.voucherId as string;
    if (!voucherId) {
      return NextResponse.json({ error: "缺少券 ID" }, { status: 400 });
    }

    const voucher = await prisma.voucher.findFirst({
      where: { id: voucherId, customerId: session.userId },
      include: {
        campaign: { select: { id: true, name: true, type: true } },
        draws: {
          where: { drawType: "instant", won: true },
          select: { valueCents: true },
        },
      },
    });

    if (!voucher) {
      return NextResponse.json({ error: "券不存在" }, { status: 404 });
    }
    if (voucher.status !== "active" || voucher.balanceCents <= 0) {
      return NextResponse.json({ error: "无可提现余额" }, { status: 400 });
    }

    let amount =
      body.amountCents != null ? Math.round(Number(body.amountCents)) : voucher.balanceCents;
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "提现金额无效" }, { status: 400 });
    }
    if (amount > voucher.balanceCents) {
      return NextResponse.json({ error: "超过可用余额" }, { status: 400 });
    }

    const productMode =
      voucher.campaign?.type === "lucky_draw_v2" ? "draw" : "voucher";

    const split = splitWithdrawAmount({
      amountCents: amount,
      hasSeller: Boolean(voucher.sellerId),
      mode: productMode,
    });

    // Instant prize clawback (anti free-ride on withdraw)
    const prizeTotal = voucher.draws.reduce((s, d) => s + (d.valueCents || 0), 0);
    const alreadyClawed = voucher.instantPrizeClawedCents || 0;
    const remainingClaw = Math.max(0, prizeTotal - alreadyClawed);
    const clawbackCents = Math.min(remainingClaw, split.customerNetCents);
    const customerNetCents = split.customerNetCents - clawbackCents;

    const newBalance = voucher.balanceCents - amount;
    const newWithdrawn = (voucher.withdrawnCents || 0) + amount;
    const tier = (voucher.tier as "small" | "medium" | "large") || "medium";
    const newWeight =
      productMode !== "draw" || newBalance <= 0
        ? 0
        : calculateTierWeight(
            voucher.amountCents,
            tier,
            newBalance,
            0,
            voucher.usedCents
          );
    const newStatus =
      newBalance <= 0
        ? voucher.usedCents > 0
          ? "exhausted"
          : "withdrawn"
        : "active";

    await prisma.voucher.update({
      where: { id: voucher.id },
      data: {
        balanceCents: newBalance,
        withdrawnCents: newWithdrawn,
        drawWeight: newWeight,
        status: newStatus,
        instantPrizeClawedCents: { increment: clawbackCents },
        platformFeeCents: { increment: split.platformFeeCents },
        sellerCommissionCents: { increment: split.sellerCommissionCents },
        prizePoolContribution: { increment: split.smallPoolCents + clawbackCents },
      },
    });

    // Fee small pool + clawback → small pool (draw) or platform (voucher clawback)
    if (split.smallPoolCents > 0 || (productMode === "draw" && clawbackCents > 0)) {
      const toSmall =
        split.smallPoolCents + (productMode === "draw" ? clawbackCents : 0);
      if (toSmall > 0) {
        await prisma.campaign.update({
          where: { id: voucher.campaignId },
          data: { instantPoolCents: { increment: toSmall } },
        });
      }
    }

    if (productMode === "voucher" && clawbackCents > 0) {
      const platformEmail = process.env.PLATFORM_ACCOUNT_EMAIL?.trim();
      if (platformEmail) {
        const platform = await prisma.user.findFirst({
          where: { email: platformEmail },
          select: { id: true },
        });
        if (platform) {
          await grantBusinessIncomeHold(
            platform.id,
            clawbackCents,
            "platform_fee",
            `提现扣回即时奖 · S$${(clawbackCents / 100).toFixed(2)}`,
            voucher.id
          );
        }
      }
    }

    if (voucher.sellerId && split.sellerCommissionCents > 0) {
      await grantBusinessIncomeHold(
        voucher.sellerId,
        split.sellerCommissionCents,
        "seller_commission",
        `提现分润 · S$${(split.sellerCommissionCents / 100).toFixed(2)}`,
        voucher.id
      );
    }

    if (split.platformFeeCents > 0) {
      const platformEmail = process.env.PLATFORM_ACCOUNT_EMAIL?.trim();
      if (platformEmail) {
        const platform = await prisma.user.findFirst({
          where: { email: platformEmail },
          select: { id: true },
        });
        if (platform) {
          await grantBusinessIncomeHold(
            platform.id,
            split.platformFeeCents,
            "platform_fee",
            `提现平台费 · S$${(split.platformFeeCents / 100).toFixed(2)}`,
            voucher.id
          );
        }
      }
    }

    let refundId: string | null = null;
    let payoutMethod: "stripe_refund" | "balance_credit" | "none" = "none";

    if (customerNetCents > 0 && voucher.stripeSessionId && process.env.STRIPE_SECRET_KEY) {
      try {
        const sess = await stripe.checkout.sessions.retrieve(voucher.stripeSessionId);
        const pi =
          typeof sess.payment_intent === "string"
            ? sess.payment_intent
            : sess.payment_intent?.id;
        if (pi) {
          const refund = await stripe.refunds.create({
            payment_intent: pi,
            amount: customerNetCents,
            reason: "requested_by_customer",
            metadata: {
              voucherId: voucher.id,
              type: "voucher_balance_withdraw",
            },
          });
          refundId = refund.id;
          payoutMethod = "stripe_refund";
        }
      } catch (e) {
        console.error("stripe refund on withdraw failed, falling back to credit:", e);
      }
    }

    if (customerNetCents > 0 && payoutMethod !== "stripe_refund") {
      await grantBusinessIncomeHold(
        session.userId,
        customerNetCents,
        "voucher_withdraw",
        `余额提现 · 券 ${voucher.id.slice(0, 8)} · 实得 S$${(customerNetCents / 100).toFixed(2)}`,
        voucher.id,
        new Date(Date.now() - 1000)
      );
      await releaseMaturedHolds(session.userId);
      payoutMethod = "balance_credit";
    }

    return NextResponse.json({
      data: {
        voucherId: voucher.id,
        withdrawnSgd: (amount / 100).toFixed(2),
        feeSgd: (split.feeCents / 100).toFixed(2),
        clawbackSgd: (clawbackCents / 100).toFixed(2),
        netSgd: (customerNetCents / 100).toFixed(2),
        split: {
          platformSgd: (split.platformFeeCents / 100).toFixed(2),
          sellerSgd: (split.sellerCommissionCents / 100).toFixed(2),
          smallPoolSgd: (split.smallPoolCents / 100).toFixed(2),
        },
        remainingBalanceSgd: (newBalance / 100).toFixed(2),
        status: newStatus,
        drawWeight: newWeight,
        payoutMethod,
        refundId,
        note:
          clawbackCents > 0
            ? `已扣回即时奖面值 S$${(clawbackCents / 100).toFixed(2)}；` +
              (newBalance <= 0 ? "已退出抽奖" : "剩余余额仍可消费")
            : newBalance <= 0
              ? "已退出抽奖（余额为 0）"
              : "部分提现完成",
      },
    });
  } catch (error) {
    console.error("voucher withdraw error:", error);
    return NextResponse.json({ error: "提现失败" }, { status: 500 });
  }
}

// src/app/api/voucher/redeem/route.ts
// Model A: fee only on redeemed amount.
// pot (default 20%) → seller commission + platform fee + prize pool
// store → 80% (T+1). No spend ⇒ no seller bonus.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { applyRedeemSplit } from "@/lib/apply-redeem-split";
import { parseRulesSnapshot, legacyDrawSnapshot } from "@/lib/templates";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "business" && session.role !== "staff")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { voucherId, amountCents } = body;
    const bodyStoreId =
      typeof body.storeId === "string" ? body.storeId.trim() : "";

    if (!voucherId || !amountCents || amountCents <= 0) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const amount = Math.round(Number(amountCents));
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const voucher = await prisma.voucher.findUnique({
      where: { id: voucherId, status: "active" },
      include: {
        campaign: {
          select: {
            id: true,
            type: true,
            budgetPercent: true,
            businessId: true,
            rulesSnapshot: true,
          },
        },
      },
    });

    if (!voucher) {
      return NextResponse.json({ error: "Voucher not found or exhausted" }, { status: 404 });
    }

    if (amount > voucher.balanceCents) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
    }

    let redeemerStore: { id: string; businessId: string; name?: string | null } | null = null;
    let redeemerBusinessId: string;

    // 门店：店员固定 JWT storeId；企业必须传 body.storeId（从具体门店进入核销）
    if (session.role === "staff") {
      if (!session.storeId) {
        return NextResponse.json(
          { error: "店员未绑定门店，无法核销" },
          { status: 403 }
        );
      }
      redeemerStore = await prisma.store.findUnique({
        where: { id: session.storeId },
        select: { id: true, businessId: true, name: true },
      });
      if (!redeemerStore) {
        return NextResponse.json({ error: "Store not found" }, { status: 404 });
      }
      redeemerBusinessId = redeemerStore.businessId;
    } else if (session.role === "business") {
      redeemerBusinessId = session.userId;
      if (!bodyStoreId) {
        return NextResponse.json(
          { error: "请选择本次核销的门店" },
          { status: 400 }
        );
      }
      redeemerStore = await prisma.store.findFirst({
        where: { id: bodyStoreId, businessId: session.userId },
        select: { id: true, businessId: true, name: true },
      });
      if (!redeemerStore) {
        return NextResponse.json(
          { error: "门店无效或不属于本企业" },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    /**
     * Open spend network (product decision: better for customers).
     * Any store whose business runs lucky_draw_v2 or voucher_sale may redeem
     * any active prepaid voucher — partnership is NOT required.
     * Money still goes to the *redeeming* store; seller commission to attribution.
     */
    const inNetwork = await prisma.campaign.findFirst({
      where: {
        businessId: redeemerBusinessId,
        type: { in: ["lucky_draw_v2", "voucher_sale"] },
        status: { in: ["active", "draft"] },
      },
      select: { id: true },
    });
    if (!inNetwork) {
      return NextResponse.json(
        {
          error:
            "本店尚未加入 WeMembers 消费网络。创建任意抽奖券或代金券活动即可入网互核。",
        },
        { status: 403 }
      );
    }

    if (!redeemerStore) {
      return NextResponse.json({ error: "请先创建门店后再核销" }, { status: 400 });
    }

    const snapshot =
      parseRulesSnapshot(voucher.campaign?.rulesSnapshot) ||
      legacyDrawSnapshot(voucher.campaign?.budgetPercent || 20);

    const productMode =
      voucher.campaign?.type === "lucky_draw_v2" || snapshot.kind === "draw"
        ? "draw"
        : "voucher";

    const budgetPercent =
      voucher.campaign?.budgetPercent && voucher.campaign.budgetPercent > 0
        ? voucher.campaign.budgetPercent
        : 20;
    const newBalance = voucher.balanceCents - amount;
    const newUsed = voucher.usedCents + amount;
    const newStatus = newBalance <= 0 ? "exhausted" : "active";
    const tier = (voucher.tier as "small" | "medium" | "large") || "medium";

    const applied = await applyRedeemSplit({
      voucherId: voucher.id,
      campaignId: voucher.campaignId,
      amountCents: amount,
      storeId: redeemerStore.id,
      redeemerBusinessId,
      issuerBusinessId: voucher.campaign?.businessId || redeemerBusinessId,
      budgetPercent,
      sellerCommissionPercent: snapshot.sellerCommissionPercent,
      platformFeePercent: snapshot.platformFeePercent,
      sellerId: voucher.sellerId,
      label: productMode === "draw" ? "核销抽奖券" : "核销代金券",
      mode: productMode,
      faceCents: voucher.amountCents,
      paidCents: voucher.paidCents || voucher.amountCents,
      recomputeWeight:
        productMode === "draw"
          ? {
              amountCents: voucher.amountCents,
              tier,
              balanceCents: newBalance,
              usedCents: newUsed,
            }
          : undefined,
    });

    await prisma.voucher.update({
      where: { id: voucher.id },
      data: {
        balanceCents: newBalance,
        usedCents: newUsed,
        status: newStatus,
      },
    });

    const s = applied.split;
    return NextResponse.json({
      data: {
        usage: {
          id: applied.usageId,
          amountSgd: (s.amountCents / 100).toFixed(2),
          feeSgd: (s.potCents / 100).toFixed(2),
          storeIncomeSgd: (s.storeIncomeCents / 100).toFixed(2),
          sellerCommissionSgd: (s.sellerCommissionCents / 100).toFixed(2),
          platformFeeSgd: (s.platformFeeCents / 100).toFixed(2),
          prizePoolSgd: (s.prizePoolCents / 100).toFixed(2),
          storeName: redeemerStore.name || null,
        },
        voucher: {
          id: voucher.id,
          remainingBalanceSgd: (newBalance / 100).toFixed(2),
          status: newStatus,
        },
        wallet: {
          availableSgd: (applied.storeWallet.balanceAfter / 100).toFixed(2),
          frozenSgd: (applied.storeWallet.frozenAfter / 100).toFixed(2),
          note: "核销收入 T+1 解冻后可提现；卖券佣金随核销从 20% 中发放",
        },
      },
    });
  } catch (error) {
    console.error("voucher redeem error:", error);
    return NextResponse.json({ error: "核销失败" }, { status: 500 });
  }
}

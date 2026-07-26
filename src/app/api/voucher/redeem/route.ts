// POST /api/voucher/redeem
// distribution: applyRedeemSplit + T+1 freeze
// self_use: same-business stores only; usage record only; no wallet credit

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { applyRedeemSplit } from "@/lib/apply-redeem-split";
import { parseRulesSnapshot, legacyDrawSnapshot } from "@/lib/templates";
import { isSelfUse, resolveProductKind } from "@/lib/product-kind";

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
            productKind: true,
            storeIds: true,
          },
        },
      },
    });

    if (!voucher) {
      return NextResponse.json(
        { error: "Voucher not found or exhausted" },
        { status: 404 }
      );
    }

    if (amount > voucher.balanceCents) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
    }

    // A2 原价门槛券：账单金额 ≥ 券面 × minSpendMultiplier（默认 10）
    {
      const snap = parseRulesSnapshot(voucher.campaign?.rulesSnapshot);
      const mult = Math.max(0, Math.round(Number(snap?.minSpendMultiplier) || 0));
      if (mult > 0) {
        const minSpend = Math.max(0, Math.round(voucher.amountCents) * mult);
        const billRaw = body.billCents ?? body.orderCents;
        const bill =
          billRaw != null && Number.isFinite(Number(billRaw))
            ? Math.round(Number(billRaw))
            : null;
        if (bill == null) {
          return NextResponse.json(
            {
              error: `本券最低消费 S$${(minSpend / 100).toFixed(0)}，请填写账单金额 billCents`,
              code: "BILL_REQUIRED",
              minSpendCents: minSpend,
            },
            { status: 400 }
          );
        }
        if (bill < minSpend) {
          return NextResponse.json(
            {
              error: `本券最低消费 S$${(minSpend / 100).toFixed(0)}，当前账单 S$${(bill / 100).toFixed(2)}`,
              code: "MIN_SPEND",
              minSpendCents: minSpend,
              billCents: bill,
            },
            { status: 400 }
          );
        }
      }
    }

    let redeemerStore: {
      id: string;
      businessId: string;
      name?: string | null;
    } | null = null;
    let redeemerBusinessId: string;

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

    if (!redeemerStore) {
      return NextResponse.json({ error: "请先创建门店后再核销" }, { status: 400 });
    }

    const productKind = resolveProductKind({
      productKind: voucher.productKind,
      campaignProductKind: voucher.campaign?.productKind,
      campaignType: voucher.campaign?.type,
    });

    const issuerBusinessId =
      voucher.campaign?.businessId || redeemerBusinessId;

    // ── 自用券：仅同企业门店；不入平台钱包 ──
    if (isSelfUse(productKind)) {
      if (redeemerBusinessId !== issuerBusinessId) {
        return NextResponse.json(
          { error: "自用券仅限发券企业集团门店核销" },
          { status: 403 }
        );
      }

      // Optional store allow-list on campaign
      if (voucher.campaign?.storeIds) {
        try {
          const allowed = JSON.parse(voucher.campaign.storeIds) as string[];
          if (
            Array.isArray(allowed) &&
            allowed.length > 0 &&
            !allowed.includes(redeemerStore.id)
          ) {
            return NextResponse.json(
              { error: "本券不适用于此门店" },
              { status: 403 }
            );
          }
        } catch {
          /* ignore bad JSON */
        }
      }

      const newBalance = voucher.balanceCents - amount;
      const newUsed = voucher.usedCents + amount;
      const newStatus = newBalance <= 0 ? "exhausted" : "active";

      const usage = await prisma.voucherUsage.create({
        data: {
          voucherId: voucher.id,
          storeId: redeemerStore.id,
          amountCents: amount,
          feeCents: 0,
          storeIncome: 0, // 售出时已收款；核销不计二次入账
        },
      });

      await prisma.voucher.update({
        where: { id: voucher.id },
        data: {
          balanceCents: newBalance,
          usedCents: newUsed,
          status: newStatus,
        },
      });

      // 实体打印版：余额用尽时同步纸码 redeemed
      if (newBalance <= 0) {
        await prisma.physicalTicket.updateMany({
          where: { voucherId: voucher.id, status: { not: "redeemed" } },
          data: {
            status: "redeemed",
            redeemedAt: new Date(),
            redeemedById: session.userId,
            redeemedStoreId: redeemerStore.id,
          },
        });
      }

      return NextResponse.json({
        data: {
          productKind: "self_use",
          usage: {
            id: usage.id,
            amountSgd: (amount / 100).toFixed(2),
            feeSgd: "0.00",
            storeIncomeSgd: "0.00",
            sellerCommissionSgd: "0.00",
            platformFeeSgd: "0.00",
            prizePoolSgd: "0.00",
            storeName: redeemerStore.name || null,
          },
          voucher: {
            id: voucher.id,
            remainingBalanceSgd: (newBalance / 100).toFixed(2),
            status: newStatus,
          },
          wallet: {
            availableSgd: null,
            frozenSgd: null,
            note: "自用券：售出时已收款，核销仅记门店履约，无平台入账",
          },
        },
      });
    }

    // ── 分发券：入网 + 分账 ──
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

    const snapshot =
      parseRulesSnapshot(voucher.campaign?.rulesSnapshot) ||
      legacyDrawSnapshot(voucher.campaign?.budgetPercent || 20);

    const productMode =
      voucher.campaign?.type === "lucky_draw_v2" || snapshot.kind === "draw"
        ? "draw"
        : "voucher";

    // 共赢：卖家必有（人或店）；无归因拒绝核销分账
    if (productMode === "draw" && !voucher.sellerId) {
      return NextResponse.json(
        { error: "共赢券缺少卖家归因，无法核销分账" },
        { status: 400 }
      );
    }

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
      issuerBusinessId,
      budgetPercent,
      sellerCommissionPercent: snapshot.sellerCommissionPercent,
      platformFeePercent: snapshot.platformFeePercent,
      sellerId: voucher.sellerId,
      label: productMode === "draw" ? "核销抽奖券" : "核销分发券",
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
        productKind: "distribution",
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
          note: "分发券：核销收入 T+1 解冻后可提现",
        },
      },
    });
  } catch (error) {
    console.error("voucher redeem error:", error);
    return NextResponse.json({ error: "核销失败" }, { status: 500 });
  }
}

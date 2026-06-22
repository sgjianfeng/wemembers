import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { spendTokens } from "@/lib/tokens";
import { TOKEN_COSTS } from "@/types";

// POST /api/business/redeem — 扫码核销
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  try {
    const { qrCode } = await request.json();
    if (!qrCode) return NextResponse.json({ error: "缺少核销码" }, { status: 400 });

    // 查找券
    const claim = await prisma.customerCoupon.findUnique({
      where: { qrCode },
      include: { coupon: true },
    });

    if (!claim) return NextResponse.json({ error: "无效的核销码" }, { status: 404 });
    if (claim.status !== "available") return NextResponse.json({ error: `该券已${claim.status === "used" ? "使用" : "过期"}` }, { status: 400 });

    // 跨商家核销判断
    const isCrossStore = claim.coupon.businessId !== session.userId;
    let settlementMessage = "";
    let settlementId: string | null = null;

    if (isCrossStore) {
      // 检查是否有合作关系
      const partnership = await prisma.businessPartner.findFirst({
        where: {
          status: "active",
          OR: [
            { businessId: session.userId, partnerId: claim.coupon.businessId },
            { businessId: claim.coupon.businessId, partnerId: session.userId },
          ],
        },
      });

      // 检查券本身是否允许跨商家核销
      if (!partnership) {
        return NextResponse.json({ error: "该券不属于本店，且双方未建立合作关系" }, { status: 403 });
      }
      if (!claim.coupon.allowCollaboration) {
        return NextResponse.json({ error: "该券不支持跨商家核销" }, { status: 403 });
      }
    }

    // 扣 Token
    const tokenResult = await spendTokens(session.userId, TOKEN_COSTS.redeem_verify, "redeem_verify", `核销「${claim.coupon.title}」`);

    // 更新状态
    await prisma.customerCoupon.update({
      where: { id: claim.id },
      data: { status: "used", usedAt: new Date() },
    });

    // 更新券计数
    await prisma.coupon.update({
      where: { id: claim.couponId },
      data: { usedCount: { increment: 1 } },
    });

    // 记录核销
    const log = await prisma.redemptionLog.create({
      data: {
        businessId: session.userId,
        customerId: claim.customerId,
        couponId: claim.couponId,
        customerCouponId: claim.id,
        amountSaved: claim.coupon.valueCents / 100,
        staffUserId: session.userId,
        storeId: session.storeId || null,
        isCrossStore,
        issuerBusinessId: isCrossStore ? claim.coupon.businessId : null,
      },
    });

    // 跨商家结算
    if (isCrossStore) {
      const totalAmount = claim.coupon.valueCents;
      const feeRate = claim.coupon.promotionFeeRate ?? 20;
      const platformFeeRate = 10;
      const issuerFeeRate = feeRate;
      const redeemerRate = 100 - platformFeeRate - issuerFeeRate;

      const platformFee = Math.round(totalAmount * platformFeeRate / 100);
      const issuerFee = Math.round(totalAmount * issuerFeeRate / 100);
      const redeemerIncome = totalAmount - platformFee - issuerFee;

      // 创建结算记录
      const settlement = await prisma.settlement.create({
        data: {
          redemptionId: log.id,
          totalAmount,
          platformFee,
          issuerFee,
          redeemerIncome,
          issuerBusinessId: claim.coupon.businessId,
          redeemerBusinessId: session.userId,
          status: "completed",
        },
      });
      settlementId = settlement.id;

      // 发券方：解冻 + 推广费入账
      await prisma.tokenAccount.upsert({
        where: { userId: claim.coupon.businessId },
        create: { userId: claim.coupon.businessId, balance: issuerFee, frozenBalance: 0, totalEarned: issuerFee, totalSpent: 0 },
        update: {
          frozenBalance: { decrement: totalAmount },
          balance: { increment: issuerFee },
          totalEarned: { increment: issuerFee },
        },
      });

      // 核销方：收入
      await prisma.tokenAccount.upsert({
        where: { userId: session.userId },
        create: { userId: session.userId, balance: redeemerIncome, frozenBalance: 0, totalEarned: redeemerIncome, totalSpent: 0 },
        update: {
          balance: { increment: redeemerIncome },
          totalEarned: { increment: redeemerIncome },
        },
      });

      settlementMessage = `跨店核销 · 发券方推广费 S$${(issuerFee / 100).toFixed(2)} · 本店收入 S$${(redeemerIncome / 100).toFixed(2)}`;
    }

    // 自动积分
    let pointsAwarded = 0;
    let tierUpgraded: string | undefined;
    let luckyDrawEntry: string | undefined;

    // 自动抽奖资格：检查有没有进行中的 lucky_draw 活动
    try {
      // 找活动（本公司的 + 合作商家允许我参与的活动）
      const activeDraws = await prisma.campaign.findMany({
        where: {
          type: "lucky_draw",
          status: "active",
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
          OR: [
            // 本公司的活动
            { businessId: session.userId, joinable: false, storeIds: null },
            { businessId: session.userId, joinable: true },
            // 合作商家允许我参与的活动（我已有 approved 申请）
            { joinable: true, joinRequests: { some: { businessId: session.userId, status: "approved" } } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      });

      for (const activeDraw of activeDraws) {
        // 门店检查：如果活动指定了门店，检查当前门店是否在列表中
        let storeOk = true;
        if (activeDraw.storeIds) {
          try {
            const ids: string[] = JSON.parse(activeDraw.storeIds);
            storeOk = session.storeId ? ids.includes(session.storeId) : false;
          } catch { storeOk = false; }
        }

        if (!storeOk) continue;

        const spendMet = !activeDraw.minSpendCents || claim.coupon.valueCents >= activeDraw.minSpendCents;
        let underMax = true;
        if (activeDraw.maxEntries) {
          const count = await prisma.luckyDrawEntry.count({ where: { campaignId: activeDraw.id } });
          underMax = count < activeDraw.maxEntries;
        }

        if (spendMet && underMax) {
          await prisma.luckyDrawEntry.create({
            data: {
              campaignId: activeDraw.id,
              customerId: claim.customerId,
              storeId: session.storeId || null,
              source: "auto",
              redemptionId: claim.id,
            },
          });
          await prisma.campaign.update({
            where: { id: activeDraw.id },
            data: { entryCount: { increment: 1 } },
          });
          luckyDrawEntry = activeDraw.name;
          break; // 一张券只发一个活动的抽奖资格
        }
      }
    } catch { /* 不影响核销主流程 */ }

    const membership = await prisma.membership.findUnique({
      where: { businessId_customerId: { businessId: session.userId, customerId: claim.customerId } },
    });

    if (membership) {
      const earnPoints = Math.round(claim.coupon.valueCents / 100);
      if (earnPoints > 0) {
        const { addPointsLog, checkAndUpgradeTier } = await import("@/lib/points");
        await prisma.membership.update({
          where: { id: membership.id },
          data: { points: { increment: earnPoints }, visitsCount: { increment: 1 } },
        });
        await addPointsLog({
          membershipId: membership.id,
          storeId: session.storeId,
          amount: earnPoints,
          type: "redeem_bonus",
          reason: `核销「${claim.coupon.title}」获得`,
        });
        const up = await checkAndUpgradeTier(membership.id, session.userId);
        if (up) tierUpgraded = up;
        pointsAwarded = earnPoints;
      }
    } else {
      // 还不是会员 → 自动加入
      await prisma.membership.create({
        data: {
          businessId: session.userId,
          customerId: claim.customerId,
          points: 0,
          visitsCount: 1,
        },
      });
    }

    // 推广佣金结算
    let promoterMessage = "";
    if (claim.sourceLinkId && claim.coupon.allowPromotion) {
      const link = await prisma.promoterLink.findUnique({ where: { id: claim.sourceLinkId } });
      if (link && link.promoterId !== claim.customerId) {
        // 计算推广奖励 (三种类型: cash | item | lottery)
        const rewardType = claim.coupon.rewardType || "cash";
        let rewardDesc = "";

        if (rewardType === "cash") {
          // 现金佣金
          let commission = 0;
          if (claim.coupon.commissionType === "percentage" && claim.coupon.commissionValue) {
            commission = Math.round(claim.coupon.valueCents * claim.coupon.commissionValue / 100);
          } else if (claim.coupon.commissionType === "fixed" && claim.coupon.commissionValue) {
            commission = claim.coupon.commissionValue;
          }
          if (commission > 0) {
            const platformFee = Math.round(commission * 0.2);
            const promoterAmount = commission - platformFee;
            await prisma.promoterEarning.create({
              data: { promoterId: link.promoterId, linkId: link.id, couponId: claim.couponId, type: "commission", amountCents: promoterAmount, platformFee, status: "confirmed", claimId: claim.id, confirmedAt: new Date() }
            });
            await prisma.promoterAccount.upsert({
              where: { userId: link.promoterId },
              create: { userId: link.promoterId, isActive: true, totalEarned: promoterAmount, availableBalance: promoterAmount, totalSold: 1 },
              update: { totalEarned: { increment: promoterAmount }, availableBalance: { increment: promoterAmount }, totalSold: { increment: 1 } },
            });
            rewardDesc = `💰 S$${(promoterAmount / 100).toFixed(2)} 佣金`;
          }
        } else if (rewardType === "item" && claim.coupon.itemRewardName) {
          // 实物奖励 - 检查库存
          const stockOk = !claim.coupon.itemRewardQuantity || (claim.coupon.itemRewardClaimed < claim.coupon.itemRewardQuantity);
          if (stockOk) {
            await prisma.coupon.update({ where: { id: claim.couponId }, data: { itemRewardClaimed: { increment: 1 } } });
            await prisma.promoterEarning.create({
              data: { promoterId: link.promoterId, linkId: link.id, couponId: claim.couponId, type: "commission", amountCents: 0, platformFee: 0, status: "confirmed", claimId: claim.id, confirmedAt: new Date() }
            });
            await prisma.promoterAccount.upsert({
              where: { userId: link.promoterId },
              create: { userId: link.promoterId, isActive: true, totalSold: 1 },
              update: { totalSold: { increment: 1 } },
            });
            rewardDesc = `🎁 ${claim.coupon.itemRewardName}`;
          } else {
            rewardDesc = "🎁 实物已领完";
          }
        } else if (rewardType === "lottery") {
          // 抽奖 - 奖励在 /api/promoter/lottery/draw 由推广者手动抽
          await prisma.promoterEarning.create({
            data: { promoterId: link.promoterId, linkId: link.id, couponId: claim.couponId, type: "commission", amountCents: 0, platformFee: 0, status: "confirmed", claimId: claim.id, confirmedAt: new Date() }
          });
          await prisma.promoterAccount.upsert({
            where: { userId: link.promoterId },
            create: { userId: link.promoterId, isActive: true, totalSold: 1 },
            update: { totalSold: { increment: 1 } },
          });
          rewardDesc = "🎰 获得1次抽奖机会";
        }

        // 更新推广链接计数
        await prisma.promoterLink.update({ where: { id: link.id }, data: { redemptions: { increment: 1 } } });
        promoterMessage = `${rewardDesc} 已计入推广者账户`;
      }
    }

    return NextResponse.json({
      data: {
        success: true,
        couponTitle: claim.coupon.title,
        value: claim.coupon.valueCents / 100,
        tokenBalance: tokenResult.balanceAfter,
        promoterMessage: promoterMessage || undefined,
        pointsAwarded: pointsAwarded > 0 ? pointsAwarded : undefined,
        tierUpgraded,
        luckyDrawEntry,
        isCrossStore: isCrossStore || undefined,
        settlementMessage: settlementMessage || undefined,
        settlementId: settlementId || undefined,
      },
    });
  } catch (error) {
    console.error("redeem error:", error);
    return NextResponse.json({ error: "核销失败" }, { status: 500 });
  }
}

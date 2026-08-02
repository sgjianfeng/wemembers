import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { storeIdsAllows } from "@/lib/utils";

function normalizeCouponCode(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

/** 解析当前核销门店 + 企业（与 POST 一致） */
async function resolveRedeemActor(session: {
  userId: string;
  role: string;
  storeId?: string | null;
}, bodyStoreId?: string) {
  let storeId: string | null =
    session.role === "staff" ? session.storeId || null : bodyStoreId || null;
  let businessId = session.userId;

  if (session.role === "staff") {
    if (!session.storeId) {
      return { error: "店员未绑定门店", status: 403 as const };
    }
    const st = await prisma.store.findUnique({
      where: { id: session.storeId },
      select: { id: true, businessId: true, name: true },
    });
    if (!st) return { error: "门店不存在", status: 404 as const };
    return { storeId: st.id, businessId: st.businessId, storeName: st.name };
  }

  if (!storeId) {
    return { error: "请选择本次核销的门店", status: 400 as const };
  }
  const st = await prisma.store.findFirst({
    where: { id: storeId, businessId: session.userId },
    select: { id: true, businessId: true, name: true },
  });
  if (!st) {
    return { error: "门店无效或不属于本企业", status: 400 as const };
  }
  return { storeId: st.id, businessId: st.businessId, storeName: st.name };
}

// GET /api/business/redeem?qrCode=&storeId= — 查找赠送券/优惠券（CustomerCoupon）预览
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "business" && session.role !== "staff")) {
      return NextResponse.json({ error: "无权操作" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const qrCode = normalizeCouponCode(searchParams.get("qrCode") || "");
    const bodyStoreId = searchParams.get("storeId") || "";
    if (!qrCode || qrCode.length < 6) {
      return NextResponse.json({ error: "请提供核销码" }, { status: 400 });
    }

    const actor = await resolveRedeemActor(session, bodyStoreId);
    if ("error" in actor) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }

    const claim = await prisma.customerCoupon.findUnique({
      where: { qrCode },
      include: {
        coupon: {
          select: {
            id: true,
            title: true,
            type: true,
            valueCents: true,
            minSpendCents: true,
            businessId: true,
            storeIds: true,
            validUntil: true,
            status: true,
          },
        },
        customer: {
          select: { displayName: true, phone: true },
        },
      },
    });

    if (!claim) {
      return NextResponse.json({ error: "未找到该赠送券/优惠券" }, { status: 404 });
    }

    const validUntil = claim.expiresAt ?? claim.coupon.validUntil;
    const expired = validUntil < new Date();
    const storeOk = storeIdsAllows(claim.coupon.storeIds, actor.storeId);
    const sameBusiness = claim.coupon.businessId === actor.businessId;

    return NextResponse.json({
      data: {
        kind: "customer_coupon" as const,
        id: claim.id,
        qrCode: claim.qrCode,
        status: expired && claim.status === "available" ? "expired" : claim.status,
        title: claim.coupon.title,
        type: claim.coupon.type,
        valueCents: claim.coupon.valueCents,
        valueSgd: (claim.coupon.valueCents / 100).toFixed(2),
        minSpendCents: claim.coupon.minSpendCents,
        expiresAt: validUntil.toISOString(),
        customerName: claim.customer.displayName || "",
        customerPhone: claim.customer.phone
          ? `${claim.customer.phone.slice(0, 4)}****${claim.customer.phone.slice(-2)}`
          : "",
        canRedeem:
          claim.status === "available" &&
          !expired &&
          storeOk &&
          sameBusiness,
        blockReason: !sameBusiness
          ? "该券不属于本企业"
          : !storeOk
            ? "该券不适用于当前门店"
            : expired
              ? "该券已过期"
              : claim.status !== "available"
                ? claim.status === "used"
                  ? "该券已使用"
                  : `状态：${claim.status}`
                : null,
        storeName: actor.storeName,
      },
    });
  } catch (e) {
    console.error("redeem GET", e);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

// POST /api/business/redeem — 扫码核销
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const qrCode = normalizeCouponCode(
      typeof body.qrCode === "string" ? body.qrCode : ""
    );
    const bodyStoreId =
      typeof body.storeId === "string" ? body.storeId.trim() : "";
    if (!qrCode) return NextResponse.json({ error: "缺少核销码" }, { status: 400 });

    const actor = await resolveRedeemActor(session, bodyStoreId);
    if ("error" in actor) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }
    const storeId = actor.storeId;
    const businessId = actor.businessId;

    // 查找券
    const claim = await prisma.customerCoupon.findUnique({
      where: { qrCode },
      include: { coupon: true },
    });

    if (!claim) return NextResponse.json({ error: "无效的核销码" }, { status: 404 });
    if (claim.status !== "available") return NextResponse.json({ error: `该券已${claim.status === "used" ? "使用" : "过期"}` }, { status: 400 });

    // 单张券到期（国庆满赠等）优先于模版 validUntil
    const claimExpiry = claim.expiresAt ?? claim.coupon.validUntil;
    if (claimExpiry < new Date()) {
      await prisma.customerCoupon.update({
        where: { id: claim.id },
        data: { status: "expired" },
      });
      return NextResponse.json({ error: "该券已过期" }, { status: 400 });
    }

    // 适用门店限制（实体券绑定后的线上券：仅本店）
    if (!storeIdsAllows(claim.coupon.storeIds, storeId)) {
      return NextResponse.json(
        { error: "该券不适用于当前门店" },
        { status: 403 }
      );
    }

    // 若来自实体券：再校验实体码本店 + 未作废
    const physical = await prisma.physicalTicket.findFirst({
      where: {
        OR: [
          { customerCouponId: claim.id },
          { code: qrCode },
        ],
      },
      include: { store: { select: { name: true } } },
    });
    if (physical) {
      if (physical.status === "redeemed" || physical.status === "void") {
        return NextResponse.json(
          { error: physical.status === "void" ? "该券已作废" : "该券已核销" },
          { status: 400 }
        );
      }
      // 集团门店可核：与印刷店可不同；须同企业（claim 路径已校验 business）
      // 未售出的纸码不应走到线上核销
      if (physical.status === "printed") {
        return NextResponse.json(
          { error: "该实体券尚未售出登记" },
          { status: 400 }
        );
      }
    }

    // 跨商家核销判断（按企业 businessId）
    const isCrossStore = claim.coupon.businessId !== businessId;
    let settlementMessage = "";
    let settlementId: string | null = null;

    if (isCrossStore) {
      const partnership = await prisma.businessPartner.findFirst({
        where: {
          status: "active",
          OR: [
            { businessId, partnerId: claim.coupon.businessId },
            { businessId: claim.coupon.businessId, partnerId: businessId },
          ],
        },
      });

      if (!partnership) {
        return NextResponse.json({ error: "该券不属于本店，且双方未建立合作关系" }, { status: 403 });
      }
      if (!claim.coupon.allowCollaboration) {
        return NextResponse.json({ error: "该券不支持跨商家核销" }, { status: 403 });
      }
    }

    // 以下 businessId 一律用核销企业（店员时不是 session.userId）

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

    // 实体券绑定后按线上核销：同步纸码状态，防双花
    if (physical && physical.status !== "redeemed") {
      await prisma.physicalTicket.update({
        where: { id: physical.id },
        data: {
          status: "redeemed",
          redeemedAt: new Date(),
          redeemedById: session.userId,
          redeemedStoreId: storeId,
        },
      });
    }

    // 记录核销（绑定门店）
    const log = await prisma.redemptionLog.create({
      data: {
        businessId,
        customerId: claim.customerId,
        couponId: claim.couponId,
        customerCouponId: claim.id,
        amountSaved: claim.coupon.valueCents / 100,
        staffUserId: session.userId,
        storeId,
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
          redeemerBusinessId: businessId,
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

      // 核销方企业：收入
      await prisma.tokenAccount.upsert({
        where: { userId: businessId },
        create: {
          userId: businessId,
          balance: redeemerIncome,
          frozenBalance: 0,
          totalEarned: redeemerIncome,
          totalSpent: 0,
        },
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
      where: {
        businessId_customerId: {
          businessId,
          customerId: claim.customerId,
        },
      },
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
          storeId: storeId,
          amount: earnPoints,
          type: "redeem_bonus",
          reason: `核销「${claim.coupon.title}」获得`,
        });
        const up = await checkAndUpgradeTier(membership.id, businessId);
        if (up) tierUpgraded = up;
        pointsAwarded = earnPoints;
      }
    } else {
      // 还不是会员 → 自动加入本企业
      await prisma.membership.create({
        data: {
          businessId,
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

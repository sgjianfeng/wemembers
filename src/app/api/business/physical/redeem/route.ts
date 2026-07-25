import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  canRedeemPhysicalVoucherStatus,
  normalizePhysicalCode,
} from "@/lib/physical-tickets";
import { formatMoney } from "@/lib/utils";

// POST /api/business/physical/redeem — 集团门店核销实体代金券（已售/已绑）
// 查找按 code；记 redeemedStoreId = 当前操作门店（可与售店不同）
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const code = normalizePhysicalCode(
      typeof body.code === "string" ? body.code : ""
    );
    const bodyStoreId =
      typeof body.storeId === "string" ? body.storeId.trim() : "";

    if (!code) {
      return NextResponse.json({ error: "请输入实体券码" }, { status: 400 });
    }

    let actingStoreId: string | null =
      session.role === "staff" ? session.storeId || null : bodyStoreId || null;
    let businessId = session.userId;
    let actingStoreName: string | null = null;

    if (session.role === "staff") {
      if (!session.storeId) {
        return NextResponse.json({ error: "店员未绑定门店" }, { status: 403 });
      }
      const st = await prisma.store.findUnique({
        where: { id: session.storeId },
        select: { id: true, businessId: true, name: true },
      });
      if (!st) {
        return NextResponse.json({ error: "门店不存在" }, { status: 404 });
      }
      actingStoreId = st.id;
      businessId = st.businessId;
      actingStoreName = st.name;
    } else {
      if (!actingStoreId) {
        return NextResponse.json(
          { error: "请选择本次核销的门店" },
          { status: 400 }
        );
      }
      const st = await prisma.store.findFirst({
        where: { id: actingStoreId, businessId: session.userId },
        select: { id: true, businessId: true, name: true },
      });
      if (!st) {
        return NextResponse.json({ error: "门店无效" }, { status: 400 });
      }
      businessId = st.businessId;
      actingStoreName = st.name;
    }

    const outcome = await prisma.$transaction(async (tx) => {
      const ticket = await tx.physicalTicket.findUnique({
        where: { code },
        include: {
          batch: true,
          store: { select: { name: true } },
          soldStore: { select: { name: true } },
        },
      });

      if (!ticket || ticket.batch.businessId !== businessId) {
        return { error: "无效的实体券码", status: 404 as const };
      }
      // 集团可核：仅要求同企业，不要求 = 印刷店/售店
      if (ticket.batch.type !== "voucher") {
        return {
          error: "抽奖券请引导顾客扫码绑定账号，不在此直接核销",
          status: 400 as const,
        };
      }
      if (ticket.status === "redeemed") {
        return { error: "该券已核销", status: 400 as const };
      }
      if (ticket.status === "void") {
        return { error: "该券已作废", status: 400 as const };
      }
      if (ticket.status === "printed") {
        return {
          error: "该券尚未售出登记，请先扫码登记收款后再核销",
          status: 400 as const,
        };
      }
      if (!canRedeemPhysicalVoucherStatus(ticket.status)) {
        return {
          error: `状态不可核销：${ticket.status}`,
          status: 400 as const,
        };
      }
      if (
        ticket.batch.validUntil &&
        ticket.batch.validUntil.getTime() < Date.now()
      ) {
        return { error: "该券已过期", status: 400 as const };
      }

      const wasClaimed = ticket.status === "claimed";

      // 已绑定：按线上券核销（CustomerCoupon 为真相源）
      if (wasClaimed && ticket.customerCouponId) {
        const claim = await tx.customerCoupon.findUnique({
          where: { id: ticket.customerCouponId },
          include: { coupon: true },
        });
        if (!claim) {
          return { error: "关联线上券丢失", status: 500 as const };
        }
        if (claim.status !== "available") {
          if (ticket.status !== "redeemed") {
            await tx.physicalTicket.update({
              where: { id: ticket.id },
              data: {
                status: "redeemed",
                redeemedAt: claim.usedAt || new Date(),
                redeemedById: session.userId,
                redeemedStoreId: actingStoreId,
              },
            });
          }
          return {
            error: "关联线上券不可用（可能已使用）",
            status: 400 as const,
          };
        }
        await tx.customerCoupon.update({
          where: { id: claim.id },
          data: { status: "used", usedAt: new Date() },
        });
        await tx.coupon.update({
          where: { id: claim.couponId },
          data: { usedCount: { increment: 1 } },
        });
        await tx.redemptionLog.create({
          data: {
            businessId,
            customerId: claim.customerId,
            couponId: claim.couponId,
            customerCouponId: claim.id,
            amountSaved: ticket.batch.valueCents / 100,
            staffUserId: session.userId,
            storeId: actingStoreId,
            isCrossStore: Boolean(
              ticket.soldStoreId && ticket.soldStoreId !== actingStoreId
            ),
            issuerBusinessId: businessId,
          },
        });
      }

      await tx.physicalTicket.update({
        where: { id: ticket.id },
        data: {
          status: "redeemed",
          redeemedAt: new Date(),
          redeemedById: session.userId,
          redeemedStoreId: actingStoreId,
        },
      });

      return {
        error: null,
        status: 200 as const,
        title: ticket.batch.title,
        valueCents: ticket.batch.valueCents,
        wasClaimed,
        soldStoreName: ticket.soldStore?.name || null,
        redeemStoreName: actingStoreName,
      };
    });

    if (outcome.error) {
      return NextResponse.json(
        { error: outcome.error },
        { status: outcome.status }
      );
    }

    return NextResponse.json({
      data: {
        success: true,
        title: outcome.title,
        valueSgd: formatMoney(outcome.valueCents!),
        wasClaimed: outcome.wasClaimed,
        soldStoreName: outcome.soldStoreName,
        redeemStoreName: outcome.redeemStoreName,
        message: outcome.wasClaimed
          ? `已核销（线上券同步）· 核销店 ${outcome.redeemStoreName || ""}`
          : `已核销 · 核销店 ${outcome.redeemStoreName || ""}`,
      },
    });
  } catch (error) {
    console.error("physical redeem error:", error);
    return NextResponse.json({ error: "核销失败" }, { status: 500 });
  }
}

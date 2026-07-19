import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizePhysicalCode } from "@/lib/physical-tickets";
import { formatMoney } from "@/lib/utils";

// POST /api/business/physical/redeem — 本店核销实体代金券（未绑或已绑）
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

    if (session.role === "staff") {
      if (!session.storeId) {
        return NextResponse.json({ error: "店员未绑定门店" }, { status: 403 });
      }
      const st = await prisma.store.findUnique({
        where: { id: session.storeId },
        select: { id: true, businessId: true },
      });
      if (!st) {
        return NextResponse.json({ error: "门店不存在" }, { status: 404 });
      }
      actingStoreId = st.id;
      businessId = st.businessId;
    } else {
      if (!actingStoreId) {
        return NextResponse.json(
          { error: "请选择本次核销的门店" },
          { status: 400 }
        );
      }
      const st = await prisma.store.findFirst({
        where: { id: actingStoreId, businessId: session.userId },
        select: { id: true, businessId: true },
      });
      if (!st) {
        return NextResponse.json({ error: "门店无效" }, { status: 400 });
      }
      businessId = st.businessId;
    }

    const outcome = await prisma.$transaction(async (tx) => {
      const ticket = await tx.physicalTicket.findUnique({
        where: { code },
        include: {
          batch: true,
          store: { select: { name: true } },
        },
      });

      if (!ticket || ticket.batch.businessId !== businessId) {
        return { error: "无效的实体券码", status: 404 as const };
      }
      if (ticket.storeId !== actingStoreId) {
        return {
          error: `本券仅限「${ticket.store.name}」使用`,
          status: 403 as const,
        };
      }
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
      if (
        ticket.batch.validUntil &&
        ticket.batch.validUntil.getTime() < Date.now()
      ) {
        return { error: "该券已过期", status: 400 as const };
      }

      // 已绑定：按线上券核销（CustomerCoupon 为真相源）
      if (ticket.status === "claimed" && ticket.customerCouponId) {
        const claim = await tx.customerCoupon.findUnique({
          where: { id: ticket.customerCouponId },
          include: { coupon: true },
        });
        if (!claim) {
          return { error: "关联线上券丢失", status: 500 as const };
        }
        if (claim.status !== "available") {
          // 线上已核：同步纸码状态，防双花残留
          if (ticket.status !== "redeemed") {
            await tx.physicalTicket.update({
              where: { id: ticket.id },
              data: {
                status: "redeemed",
                redeemedAt: claim.usedAt || new Date(),
                redeemedById: session.userId,
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
            isCrossStore: false,
            issuerBusinessId: businessId,
          },
        });
      }

      // 纸码 redeemed（未绑匿名核销，或已绑同步线上后）
      await tx.physicalTicket.update({
        where: { id: ticket.id },
        data: {
          status: "redeemed",
          redeemedAt: new Date(),
          redeemedById: session.userId,
        },
      });

      return {
        error: null,
        status: 200 as const,
        title: ticket.batch.title,
        valueCents: ticket.batch.valueCents,
        wasClaimed: ticket.status === "claimed",
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
        valueSgd: formatMoney(outcome.valueCents),
        wasClaimed: outcome.wasClaimed,
        message: outcome.wasClaimed
          ? "已核销（线上券同步已用）"
          : "已核销（未绑定实体券）",
      },
    });
  } catch (error) {
    console.error("physical redeem error:", error);
    return NextResponse.json({ error: "核销失败" }, { status: 500 });
  }
}

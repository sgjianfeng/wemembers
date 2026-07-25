import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  normalizePhoneLocal,
  normalizePhysicalCode,
} from "@/lib/physical-tickets";
import { formatMoney } from "@/lib/utils";

/**
 * POST /api/business/physical/sell
 * 现金/店收售出实体券：printed → sold（可选绑手机/已有顾客账号）
 * Body: { code, storeId?, paidSgd? | paidCents?, paymentMethod?, customerPhone?, bindIfRegistered? }
 */
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
    const paymentMethod =
      typeof body.paymentMethod === "string" && body.paymentMethod
        ? body.paymentMethod
        : "cash";
    const phoneRaw =
      typeof body.customerPhone === "string" ? body.customerPhone : "";
    const phone = phoneRaw ? normalizePhoneLocal(phoneRaw) : "";
    const bindIfRegistered = body.bindIfRegistered !== false;

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
        select: { id: true, businessId: true, name: true },
      });
      if (!st) {
        return NextResponse.json({ error: "门店不存在" }, { status: 404 });
      }
      actingStoreId = st.id;
      businessId = st.businessId;
    } else {
      if (!actingStoreId) {
        return NextResponse.json(
          { error: "请选择本次售出的门店" },
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
    }

    let paidCents: number;
    if (body.paidCents != null) {
      paidCents = Math.round(Number(body.paidCents));
    } else if (body.paidSgd != null && body.paidSgd !== "") {
      paidCents = Math.round(Number(body.paidSgd) * 100);
    } else {
      // 默认实收 = 面值（全价现金）；0 表示赠送出库
      paidCents = -1; // fill from face below
    }
    if (!Number.isFinite(paidCents) || (paidCents < 0 && paidCents !== -1)) {
      return NextResponse.json({ error: "实收金额无效" }, { status: 400 });
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
      if (ticket.batch.status === "void") {
        return { error: "该批次已作废", status: 400 as const };
      }
      if (ticket.status === "redeemed") {
        return { error: "该券已核销", status: 400 as const };
      }
      if (ticket.status === "void") {
        return { error: "该券已作废", status: 400 as const };
      }
      if (ticket.status === "sold" || ticket.status === "claimed") {
        return {
          error: "该券已售出或已绑定，无需重复登记",
          status: 400 as const,
        };
      }
      if (ticket.status !== "printed") {
        return { error: `状态不可售出：${ticket.status}`, status: 400 as const };
      }
      if (
        ticket.batch.validUntil &&
        ticket.batch.validUntil.getTime() < Date.now()
      ) {
        return { error: "该券已过期", status: 400 as const };
      }

      const faceCents = ticket.batch.valueCents || 0;
      const finalPaid = paidCents === -1 ? faceCents : paidCents;
      if (finalPaid < 0) {
        return { error: "实收金额无效", status: 400 as const };
      }
      // 代金允许折扣实收 ≤ 面值；抽奖面值可能为 0
      if (faceCents > 0 && finalPaid > faceCents) {
        return { error: "实收不能大于面值", status: 400 as const };
      }

      let customerId: string | null = null;
      let customerCouponId: string | null = null;
      let bound = false;
      let nextStatus: "sold" | "claimed" = "sold";

      if (phone && bindIfRegistered && ticket.batch.type === "voucher") {
        const customer =
          (await tx.user.findUnique({ where: { phone } })) ||
          (await tx.user.findUnique({ where: { phone: `+65${phone}` } }));
        if (customer && customer.role === "customer") {
          if (!ticket.batch.couponId) {
            return { error: "批次配置异常（无模板券）", status: 500 as const };
          }
          const coupon = await tx.coupon.findUnique({
            where: { id: ticket.batch.couponId },
          });
          if (!coupon || coupon.status !== "published") {
            return { error: "关联优惠券不可用", status: 400 as const };
          }
          const claim = await tx.customerCoupon.create({
            data: {
              customerId: customer.id,
              couponId: coupon.id,
              status: "available",
              qrCode: code,
              pointsSpent: 0,
            },
          });
          await tx.coupon.update({
            where: { id: coupon.id },
            data: {
              claimedCount: { increment: 1 },
              remainingQuantity:
                coupon.remainingQuantity != null
                  ? Math.max(0, coupon.remainingQuantity - 1)
                  : null,
            },
          });
          customerId = customer.id;
          customerCouponId = claim.id;
          bound = true;
          nextStatus = "claimed";
        }
      }

      const method =
        finalPaid === 0 && paymentMethod === "cash" ? "free" : paymentMethod;

      const updated = await tx.physicalTicket.update({
        where: { id: ticket.id },
        data: {
          status: nextStatus,
          soldAt: new Date(),
          soldById: session.userId,
          soldStoreId: actingStoreId,
          paidCents: finalPaid,
          paymentMethod: method,
          contactPhone: phone || null,
          ...(bound
            ? {
                customerId,
                customerCouponId,
                claimedAt: new Date(),
              }
            : {}),
        },
        include: {
          soldStore: { select: { id: true, name: true } },
        },
      });

      return {
        error: null,
        status: 200 as const,
        ticket: updated,
        title: ticket.batch.title,
        faceCents,
        bound,
      };
    });

    if (outcome.error) {
      return NextResponse.json(
        { error: outcome.error },
        { status: outcome.status }
      );
    }

    const t = outcome.ticket!;
    return NextResponse.json({
      data: {
        code: t.code,
        status: t.status,
        title: outcome.title,
        faceSgd: formatMoney(outcome.faceCents!),
        paidSgd: formatMoney(t.paidCents),
        paymentMethod: t.paymentMethod,
        soldStoreName: t.soldStore?.name || null,
        bound: outcome.bound,
        contactPhone: t.contactPhone,
        message: outcome.bound
          ? "已售出并绑定顾客账号"
          : "已登记售出（现金/店收）",
      },
    });
  } catch (error) {
    console.error("physical sell error:", error);
    return NextResponse.json({ error: "售出登记失败" }, { status: 500 });
  }
}

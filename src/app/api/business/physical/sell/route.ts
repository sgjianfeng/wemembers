import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  normalizePhoneLocal,
  normalizePhysicalCode,
} from "@/lib/physical-tickets";
import { materializePhysicalToVoucher } from "@/lib/physical-to-voucher";
import { applyExclusiveCashSaleFees } from "@/lib/exclusive-fees";
import { formatMoney } from "@/lib/utils";

/**
 * POST /api/business/physical/sell
 * 自用实体 / 独享实体：现金售出 printed→sold；独享扣企业 15%
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
      paidCents = -1;
    }
    if (!Number.isFinite(paidCents) || (paidCents < 0 && paidCents !== -1)) {
      return NextResponse.json({ error: "实收金额无效" }, { status: 400 });
    }

    const outcome = await prisma.$transaction(async (tx) => {
      const ticket = await tx.physicalTicket.findUnique({
        where: { code },
        include: {
          batch: true,
          soldStore: { select: { name: true } },
        },
      });

      if (!ticket || ticket.batch.businessId !== businessId) {
        return { error: "无效的实体券码", status: 404 as const };
      }
      if (ticket.batch.status === "void") {
        return { error: "该批次已作废", status: 400 as const };
      }
      if (ticket.batch.type !== "voucher" && ticket.batch.type !== "draw") {
        return { error: "不支持的票种", status: 400 as const };
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
      if (faceCents < 100) {
        return { error: "批次面值无效，请重新印刷", status: 400 as const };
      }
      const finalPaid = paidCents === -1 ? faceCents : paidCents;
      if (finalPaid < 0) {
        return { error: "实收金额无效", status: 400 as const };
      }
      if (finalPaid > faceCents) {
        return { error: "实收不能大于面值", status: 400 as const };
      }

      // 独享实体：服务费 2% 可 gift；自充够才扣 13% 进池，否则弱路径
      let feeNote = "";
      let realPrizeFunding = true;
      let weightFactor = 1;
      if (ticket.batch.type === "draw") {
        if (!ticket.batch.campaignId) {
          return { error: "独享实体须关联独享活动", status: 400 as const };
        }
        const camp = await tx.campaign.findUnique({
          where: { id: ticket.batch.campaignId },
          select: { productKind: true, type: true, name: true },
        });
        if (!camp || camp.productKind !== "self_use") {
          return {
            error: "仅支持独享（self_use）抽奖活动的实体售出",
            status: 400 as const,
          };
        }
        try {
          const campFull = await tx.campaign.findUnique({
            where: { id: ticket.batch.campaignId },
            select: {
              name: true,
              templateId: true,
              rulesSnapshot: true,
              productKind: true,
            },
          });
          const { exclusiveConfigFromCampaign } = await import("@/lib/templates");
          const feeConfig = exclusiveConfigFromCampaign(campFull || {});
          const fee = await applyExclusiveCashSaleFees(tx, {
            businessId,
            campaignId: ticket.batch.campaignId,
            faceCents,
            feeConfig,
            referenceId: code,
            label: `独享实体售出 · ${camp.name}`,
          });
          realPrizeFunding = fee.realPrizeFunding;
          weightFactor = fee.weightFactor;
          const charged = fee.chargedCents ?? fee.totalCents;
          const pct = fee.totalPercent || 15;
          feeNote = realPrizeFunding
            ? `已扣自充 S$${(charged / 100).toFixed(2)}（${pct}%：小奖+服务费+大奖，已进池）`
            : `已扣服务费 S$${(charged / 100).toFixed(2)}（2%）；未自充奖池：小奖门店送、不注池、权重×${weightFactor}`;
        } catch (e) {
          if (e instanceof Error && e.message === "INSUFFICIENT_TOKEN") {
            return {
              error:
                "账户不足以支付平台服务费（2%）。平台赠送额度仅可抵服务费；自充才可进奖池。有赠送额度即可开卖，不强制充值。",
              status: 402 as const,
              code: "NEED_TOPUP",
            };
          }
          throw e;
        }
      }

      const method = finalPaid === 0 ? "free" : "physical";

      let updated = await tx.physicalTicket.update({
        where: { id: ticket.id },
        data: {
          status: "sold",
          soldAt: new Date(),
          soldById: session.userId,
          soldStoreId: actingStoreId,
          paidCents: finalPaid,
          paymentMethod: method,
          contactPhone: phone || null,
          prizeFunding:
            ticket.batch.type === "draw"
              ? realPrizeFunding
                ? "paid"
                : "gift"
              : null,
        },
        include: {
          soldStore: { select: { id: true, name: true } },
        },
      });

      let bound = false;
      let voucherShort: string | null = null;
      let instantPrize: {
        name: string;
        icon: string;
        valueSgd: string;
      } | null = null;

      if (phone && bindIfRegistered) {
        const customer =
          (await tx.user.findUnique({ where: { phone } })) ||
          (await tx.user.findUnique({ where: { phone: `+65${phone}` } }));
        if (customer && customer.role === "customer") {
          try {
            const mat = await materializePhysicalToVoucher(tx, {
              ticketId: ticket.id,
              customerId: customer.id,
              paidCents: finalPaid,
              soldStoreId: actingStoreId,
              markSold: true,
              soldById: session.userId,
              contactPhone: phone,
              creditPrizeToBalance: realPrizeFunding,
              weightFactor,
            });
            bound = true;
            voucherShort = mat.voucher.shortCode;
            instantPrize = mat.instantPrize;
            updated = await tx.physicalTicket.findUniqueOrThrow({
              where: { id: ticket.id },
              include: {
                soldStore: { select: { id: true, name: true } },
              },
            });
          } catch (e) {
            console.error("materialize on sell:", e);
            return { error: "绑定顾客失败", status: 500 as const };
          }
        }
      }

      return {
        error: null,
        status: 200 as const,
        ticket: updated,
        title: ticket.batch.title,
        faceCents,
        bound,
        voucherShort,
        feeNote,
        instantPrize,
        isDraw: ticket.batch.type === "draw",
        realPrizeFunding,
      };
    });

    if (outcome.error) {
      return NextResponse.json(
        {
          error: outcome.error,
          code: "code" in outcome ? outcome.code : undefined,
        },
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
        voucherShortCode: outcome.voucherShort,
        productKind: "self_use",
        displayKind: outcome.isDraw ? "exclusive" : "self_use",
        feeNote: outcome.feeNote || undefined,
        instantPrize: outcome.instantPrize,
        message: outcome.bound
          ? outcome.isDraw
            ? "已售出并绑定为独享券（实体购买）"
            : "已售出并绑定为自用券（实体购买）"
          : outcome.isDraw
            ? "已登记售出（独享·实体）· 顾客扫码可绑到账号"
            : "已登记售出（自用·实体）· 顾客扫码可绑到账号",
      },
    });
  } catch (error) {
    console.error("physical sell error:", error);
    return NextResponse.json({ error: "售出登记失败" }, { status: 500 });
  }
}

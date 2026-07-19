import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizePhysicalCode } from "@/lib/physical-tickets";

// GET /api/physical/[code] — 公开查实体码状态（绑定页）
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code: raw } = await params;
    const code = normalizePhysicalCode(decodeURIComponent(raw));
    const ticket = await prisma.physicalTicket.findUnique({
      where: { code },
      include: {
        batch: {
          select: {
            type: true,
            title: true,
            description: true,
            valueCents: true,
            validUntil: true,
            campaignId: true,
            status: true,
            business: { select: { businessName: true } },
          },
        },
        store: { select: { id: true, name: true } },
      },
    });

    if (!ticket || ticket.batch.status === "void") {
      return NextResponse.json({ error: "无效的实体券码" }, { status: 404 });
    }

    const session = await getSession();
    const isOwner =
      session?.role === "customer" &&
      ticket.customerId === session.userId;

    return NextResponse.json({
      data: {
        code: ticket.code,
        status: ticket.status,
        type: ticket.batch.type,
        title: ticket.batch.title,
        description: ticket.batch.description,
        valueCents: ticket.batch.valueCents,
        storeName: ticket.store.name,
        storeId: ticket.store.id,
        businessName: ticket.batch.business.businessName,
        validUntil: ticket.batch.validUntil,
        campaignId: ticket.batch.campaignId,
        canClaim: ticket.status === "printed",
        canRedeemUnbound:
          ticket.status === "printed" && ticket.batch.type === "voucher",
        isOwner,
        claimedByYou: isOwner,
      },
    });
  } catch (error) {
    console.error("physical GET error:", error);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

// POST /api/physical/[code] — 顾客绑定到当前账号
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "customer") {
      return NextResponse.json(
        { error: "请先以顾客账号登录后再绑定" },
        { status: 401 }
      );
    }

    const { code: raw } = await params;
    const code = normalizePhysicalCode(decodeURIComponent(raw));

    const result = await prisma.$transaction(async (tx) => {
      const ticket = await tx.physicalTicket.findUnique({
        where: { code },
        include: {
          batch: true,
          store: { select: { name: true } },
        },
      });

      if (!ticket || ticket.batch.status === "void") {
        return { error: "无效的实体券码", status: 404 as const };
      }
      if (ticket.status === "redeemed") {
        return { error: "该券已核销，无法绑定", status: 400 as const };
      }
      if (ticket.status === "void") {
        return { error: "该券已作废", status: 400 as const };
      }
      if (ticket.status === "claimed") {
        if (ticket.customerId === session.userId) {
          return {
            error: null,
            status: 200 as const,
            already: true,
            ticket,
          };
        }
        return { error: "该券已绑定其他账号", status: 409 as const };
      }
      if (
        ticket.batch.validUntil &&
        ticket.batch.validUntil.getTime() < Date.now()
      ) {
        return { error: "该券已过期", status: 400 as const };
      }

      let customerCouponId: string | null = null;

      if (ticket.batch.type === "voucher") {
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
            customerId: session.userId,
            couponId: coupon.id,
            status: "available",
            qrCode: code,
            pointsSpent: 0,
          },
        });
        customerCouponId = claim.id;

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
      } else if (ticket.batch.type === "draw") {
        // 绑定后按线上抽奖券处理：必须关联活动
        const campaignId = ticket.batch.campaignId;
        if (!campaignId) {
          return {
            error: "该抽奖批次未关联活动，请联系门店",
            status: 400 as const,
          };
        }
        const campaign = await tx.campaign.findUnique({
          where: { id: campaignId },
          select: { id: true, status: true },
        });
        if (!campaign || campaign.status === "ended") {
          return { error: "关联活动不可用或已结束", status: 400 as const };
        }

        let entry = await tx.luckyDrawEntry.findFirst({
          where: { campaignId, customerId: session.userId },
        });
        if (!entry) {
          entry = await tx.luckyDrawEntry.create({
            data: {
              campaignId,
              customerId: session.userId,
              storeId: ticket.storeId,
              source: "manual",
              ticketCount: 1,
            },
          });
          await tx.campaign.update({
            where: { id: campaignId },
            data: {
              entryCount: { increment: 1 },
              totalTicketCount: { increment: 1 },
            },
          });
        } else {
          await tx.luckyDrawEntry.update({
            where: { id: entry.id },
            data: { ticketCount: { increment: 1 } },
          });
          await tx.campaign.update({
            where: { id: campaignId },
            data: { totalTicketCount: { increment: 1 } },
          });
        }
        const ticketNo = `PT-${code.replace(/^PT-/, "")}`;
        // ticketNo 全局唯一；冲突时加后缀
        let finalNo = ticketNo;
        for (let i = 0; i < 5; i++) {
          const exists = await tx.drawTicket.findUnique({
            where: { ticketNo: finalNo },
            select: { id: true },
          });
          if (!exists) break;
          finalNo = `${ticketNo}-${i + 1}`;
        }
        await tx.drawTicket.create({
          data: {
            campaignId,
            customerId: session.userId,
            entryId: entry.id,
            ticketNo: finalNo,
            drawMode: "deferred",
          },
        });
      }

      const updated = await tx.physicalTicket.update({
        where: { id: ticket.id },
        data: {
          status: "claimed",
          customerId: session.userId,
          customerCouponId,
          claimedAt: new Date(),
        },
      });

      return {
        error: null,
        status: 200 as const,
        already: false,
        ticket: { ...ticket, ...updated },
      };
    });

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({
      data: {
        code,
        status: "claimed",
        already: result.already,
        type: result.ticket.batch.type,
        title: result.ticket.batch.title,
        message:
          result.ticket.batch.type === "draw"
            ? "已绑定：可在活动中查看大奖进度"
            : "已绑定：券已放入你的钱包",
      },
    });
  } catch (error) {
    console.error("physical claim error:", error);
    // unique qrCode conflict
    return NextResponse.json(
      { error: "绑定失败，请稍后重试" },
      { status: 500 }
    );
  }
}

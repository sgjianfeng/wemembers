import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  canClaimPhysicalStatus,
  normalizePhysicalCode,
} from "@/lib/physical-tickets";
import { materializePhysicalToVoucher } from "@/lib/physical-to-voucher";

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
        canClaim: canClaimPhysicalStatus(ticket.status),
        // 顾客端不直接核销；未售不可核
        canRedeemUnbound: false,
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
      if (ticket.status !== "printed" && ticket.status !== "sold") {
        return {
          error: `状态不可绑定：${ticket.status}`,
          status: 400 as const,
        };
      }
      if (
        ticket.batch.validUntil &&
        ticket.batch.validUntil.getTime() < Date.now()
      ) {
        return { error: "该券已过期", status: 400 as const };
      }

      // ── 代金实体 = 自用券打印版 → 落到 Voucher ──
      if (ticket.batch.type === "voucher") {
        try {
          const mat = await materializePhysicalToVoucher(tx, {
            ticketId: ticket.id,
            customerId: session.userId,
            paidCents:
              ticket.paidCents > 0 ? ticket.paidCents : ticket.batch.valueCents,
            soldStoreId: ticket.soldStoreId || ticket.storeId,
            markSold: true,
            soldById: ticket.soldById,
          });
          return {
            error: null,
            status: 200 as const,
            already: false,
            ticket: { ...ticket, ...mat.ticket, batch: ticket.batch },
            voucher: mat.voucher,
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "BIND_FAIL";
          if (msg === "ALREADY_REDEEMED") {
            return { error: "该券已核销，无法绑定", status: 400 as const };
          }
          console.error("physical claim materialize:", e);
          return { error: "绑定失败", status: 500 as const };
        }
      }

      // ── 抽奖实体：仍进活动资格（独享/共赢由 campaign.productKind 决定）──
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

      const updated = await tx.physicalTicket.update({
        where: { id: ticket.id },
        data: {
          status: "claimed",
          customerId: session.userId,
          claimedAt: new Date(),
        },
      });

      return {
        error: null,
        status: 200 as const,
        already: false,
        ticket: { ...ticket, ...updated },
        voucher: null,
      };
    });

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    const isDraw = result.ticket.batch.type === "draw";
    const v = "voucher" in result ? result.voucher : null;

    return NextResponse.json({
      data: {
        code,
        status: "claimed",
        already: result.already,
        type: result.ticket.batch.type,
        title: result.ticket.batch.title,
        productKind: isDraw ? undefined : "self_use",
        paymentMethod: v?.paymentMethod || "physical",
        voucher: v
          ? {
              id: v.id,
              shortCode: v.shortCode,
              balanceSgd: (v.balanceCents / 100).toFixed(2),
              amountSgd: (v.amountCents / 100).toFixed(2),
              paidSgd: (v.paidCents / 100).toFixed(2),
            }
          : null,
        message: isDraw
          ? "已绑定：可在活动中查看大奖进度"
          : "已绑定：自用券已放入余额（实体券购买）",
        goBalance: !isDraw,
      },
    });
  } catch (error) {
    console.error("physical claim error:", error);
    return NextResponse.json(
      { error: "绑定失败，请稍后重试" },
      { status: 500 }
    );
  }
}

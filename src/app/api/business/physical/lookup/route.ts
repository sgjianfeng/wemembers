import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizePhysicalCode } from "@/lib/physical-tickets";
import { formatMoney } from "@/lib/utils";

// POST /api/business/physical/lookup — 店员/企业查实体码
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
          { error: "请选择本次操作的门店" },
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

    const ticket = await prisma.physicalTicket.findUnique({
      where: { code },
      include: {
        batch: {
          select: {
            businessId: true,
            type: true,
            title: true,
            valueCents: true,
            validUntil: true,
            campaignId: true,
          },
        },
        store: { select: { id: true, name: true } },
        customer: {
          select: { id: true, displayName: true, phone: true },
        },
      },
    });

    if (!ticket || ticket.batch.businessId !== businessId) {
      return NextResponse.json({ error: "无效的实体券码" }, { status: 404 });
    }

    const sameStore = ticket.storeId === actingStoreId;

    return NextResponse.json({
      data: {
        code: ticket.code,
        status: ticket.status,
        type: ticket.batch.type,
        title: ticket.batch.title,
        valueCents: ticket.batch.valueCents,
        valueSgd: formatMoney(ticket.batch.valueCents),
        ticketStoreId: ticket.storeId,
        ticketStoreName: ticket.store.name,
        actingStoreId,
        sameStore,
        storeOnlyError: sameStore
          ? null
          : `本券仅限「${ticket.store.name}」使用`,
        validUntil: ticket.batch.validUntil,
        campaignId: ticket.batch.campaignId,
        customer: ticket.customer
          ? {
              id: ticket.customer.id,
              name: ticket.customer.displayName || ticket.customer.phone,
            }
          : null,
        customerCouponId: ticket.customerCouponId,
        canRedeemUnbound:
          sameStore &&
          ticket.status === "printed" &&
          ticket.batch.type === "voucher",
        canRedeemClaimed:
          sameStore &&
          ticket.status === "claimed" &&
          ticket.batch.type === "voucher" &&
          Boolean(ticket.customerCouponId),
        suggestClaim:
          ticket.status === "printed" && ticket.batch.type === "draw",
      },
    });
  } catch (error) {
    console.error("physical lookup error:", error);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

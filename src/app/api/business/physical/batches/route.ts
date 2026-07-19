import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { uniquePhysicalCode } from "@/lib/physical-tickets";
import {
  isVisualTemplateId,
  resolveThemeHex,
} from "@/lib/visual-templates";

// GET /api/business/physical/batches
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const batches = await prisma.physicalBatch.findMany({
    where: { businessId: session.userId },
    orderBy: { createdAt: "desc" },
    include: {
      store: { select: { id: true, name: true } },
      _count: { select: { tickets: true } },
      tickets: {
        select: { status: true },
      },
    },
    take: 50,
  });

  const data = batches.map((b) => {
    const claimed = b.tickets.filter((t) => t.status === "claimed").length;
    const redeemed = b.tickets.filter((t) => t.status === "redeemed").length;
    const voided = b.tickets.filter((t) => t.status === "void").length;
    return {
      id: b.id,
      type: b.type,
      title: b.title,
      valueCents: b.valueCents,
      quantity: b.quantity,
      status: b.status,
      store: b.store,
      validUntil: b.validUntil,
      campaignId: b.campaignId,
      createdAt: b.createdAt,
      counts: {
        total: b._count.tickets,
        claimed,
        redeemed,
        voided,
        printed: b._count.tickets - claimed - redeemed - voided,
      },
    };
  });

  return NextResponse.json({ data });
}

// POST /api/business/physical/batches — 创建批次并生成码
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const storeId = typeof body.storeId === "string" ? body.storeId.trim() : "";
    const type = body.type === "draw" ? "draw" : "voucher";
    const title =
      typeof body.title === "string" ? body.title.trim().slice(0, 80) : "";
    const description =
      typeof body.description === "string"
        ? body.description.trim().slice(0, 500)
        : null;
    const valueCents = Math.max(0, Math.round(Number(body.valueCents) || 0));
    const quantity = Math.min(500, Math.max(1, Math.round(Number(body.quantity) || 0)));
    const campaignId =
      typeof body.campaignId === "string" && body.campaignId.trim()
        ? body.campaignId.trim()
        : null;
    const validUntilRaw =
      typeof body.validUntil === "string" ? body.validUntil.trim() : "";
    const rawTpl =
      typeof body.visualTemplateId === "string"
        ? body.visualTemplateId.trim()
        : "store_classic";
    const visualTemplateId = isVisualTemplateId(rawTpl)
      ? rawTpl
      : type === "draw"
        ? "store_bold"
        : "store_classic";
    const themeColor = resolveThemeHex(
      typeof body.themeColor === "string" ? body.themeColor.trim() : null,
      visualTemplateId
    );

    if (!storeId) {
      return NextResponse.json({ error: "请选择门店" }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: "请填写标题" }, { status: 400 });
    }
    if (type === "voucher" && valueCents < 100) {
      return NextResponse.json(
        { error: "代金券面值至少 S$1.00" },
        { status: 400 }
      );
    }
    if (!quantity) {
      return NextResponse.json({ error: "数量至少 1 张" }, { status: 400 });
    }

    const store = await prisma.store.findFirst({
      where: { id: storeId, businessId: session.userId },
      select: { id: true, name: true },
    });
    if (!store) {
      return NextResponse.json({ error: "门店无效" }, { status: 400 });
    }

    if (type === "draw" && !campaignId) {
      return NextResponse.json(
        { error: "抽奖券须关联线上活动（绑定后进大奖池）" },
        { status: 400 }
      );
    }

    if (campaignId) {
      const camp = await prisma.campaign.findFirst({
        where: { id: campaignId, businessId: session.userId },
        select: { id: true },
      });
      if (!camp) {
        return NextResponse.json({ error: "活动无效" }, { status: 400 });
      }
    }

    const validUntil = validUntilRaw ? new Date(validUntilRaw) : null;
    if (validUntil && Number.isNaN(validUntil.getTime())) {
      return NextResponse.json({ error: "有效期格式无效" }, { status: 400 });
    }

    const now = new Date();
    const until =
      validUntil ||
      new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    // 代金：创建模板 Coupon，claim 时发 CustomerCoupon
    let couponId: string | null = null;
    if (type === "voucher") {
      const coupon = await prisma.coupon.create({
        data: {
          businessId: session.userId,
          title,
          description:
            description ||
            `实体券 · 仅限 ${store.name} · 一次用完`,
          type: "fixed_amount",
          valueCents,
          minSpendCents: 0,
          pointsRequired: 0,
          totalQuantity: quantity,
          remainingQuantity: quantity,
          validFrom: now,
          validUntil: until,
          status: "published",
          isGiftable: false,
          perCustomerLimit: 99,
          storeIds: JSON.stringify([storeId]),
          allowCollaboration: false,
        },
      });
      couponId = coupon.id;
    }

    const batch = await prisma.physicalBatch.create({
      data: {
        businessId: session.userId,
        storeId,
        type,
        title,
        description,
        valueCents: type === "voucher" ? valueCents : 0,
        quantity,
        validUntil: until,
        campaignId,
        couponId,
        visualTemplateId,
        themeColor,
        status: "active",
      },
    });

    const codes: string[] = [];
    for (let i = 0; i < quantity; i++) {
      codes.push(await uniquePhysicalCode());
    }

    await prisma.physicalTicket.createMany({
      data: codes.map((code) => ({
        batchId: batch.id,
        storeId,
        code,
        status: "printed",
      })),
    });

    return NextResponse.json({
      data: { id: batch.id, quantity: codes.length },
    });
  } catch (error) {
    console.error("physical batch create error:", error);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}

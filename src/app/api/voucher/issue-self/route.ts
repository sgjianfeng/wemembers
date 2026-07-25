// POST /api/voucher/issue-self
// 自用 / 独享：现金（或店收）发券 — 钱已在店；抽奖独享可当场即时小奖（店兑）
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { allocateShortCode } from "@/lib/voucher-short-code";
import { isSelfUse } from "@/lib/product-kind";
import {
  calculateTierWeight,
  drawInstantV2,
  resolveTier,
} from "@/lib/draw-v2";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "business" && session.role !== "staff")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    const campaignId =
      typeof body.campaignId === "string" ? body.campaignId.trim() : "";
    const amountSgd = Number(body.amountSgd ?? body.faceSgd);
    const amountCents = Math.round(
      body.amountCents != null ? Number(body.amountCents) : amountSgd * 100
    );
    const paymentMethod =
      typeof body.paymentMethod === "string" ? body.paymentMethod : "cash";
    const customerPhone =
      typeof body.customerPhone === "string"
        ? body.customerPhone.trim()
        : "";
    const customerIdBody =
      typeof body.customerId === "string" ? body.customerId.trim() : "";
    const doInstantDraw = body.instantDraw !== false; // default true for draw

    let storeId =
      typeof body.storeId === "string" ? body.storeId.trim() : "";
    if (session.role === "staff") {
      storeId = session.storeId || "";
    }

    if (!campaignId || !amountCents || amountCents < 100) {
      return NextResponse.json(
        { error: "请选择活动且面额至少 S$1" },
        { status: 400 }
      );
    }
    if (!storeId) {
      return NextResponse.json({ error: "请选择发售门店" }, { status: 400 });
    }

    const businessId =
      session.role === "business"
        ? session.userId
        : (
            await prisma.store.findUnique({
              where: { id: storeId },
              select: { businessId: true },
            })
          )?.businessId;

    if (!businessId) {
      return NextResponse.json({ error: "门店无效" }, { status: 400 });
    }

    const store = await prisma.store.findFirst({
      where: { id: storeId, businessId },
      select: { id: true, name: true },
    });
    if (!store) {
      return NextResponse.json({ error: "门店不属于本企业" }, { status: 400 });
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, businessId },
      select: {
        id: true,
        productKind: true,
        status: true,
        type: true,
        name: true,
        instantPoolCents: true,
      },
    });
    if (!campaign) {
      return NextResponse.json({ error: "活动不存在" }, { status: 404 });
    }
    if (!isSelfUse(campaign.productKind)) {
      return NextResponse.json(
        {
          error:
            "仅「先收款」活动可柜台发券（自用/独享）；共赢/分发请走线上支付",
        },
        { status: 400 }
      );
    }
    if (campaign.status === "ended" || campaign.status === "deleted") {
      return NextResponse.json({ error: "活动已结束" }, { status: 400 });
    }
    if (campaign.status === "draft") {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "active" },
      });
    }

    const isDraw =
      campaign.type === "lucky_draw_v2" || campaign.type === "lucky_draw";
    const faceSgd = amountCents / 100;
    const tierResolved = resolveTier(faceSgd);
    const tier = (tierResolved?.tier || "medium") as "small" | "medium" | "large";

    // Resolve customer
    let customerId = customerIdBody;
    if (!customerId && customerPhone) {
      const phone = customerPhone.replace(/\s/g, "");
      let user = await prisma.user.findFirst({
        where: { phone, role: "customer" },
        select: { id: true },
      });
      if (!user) {
        user = await prisma.user.create({
          data: {
            phone,
            role: "customer",
            displayName: phone.slice(-4) ? `客户${phone.slice(-4)}` : "顾客",
          },
          select: { id: true },
        });
      }
      customerId = user.id;
    }
    if (!customerId) {
      const walkIn = await prisma.user.create({
        data: {
          role: "customer",
          displayName: `到店${new Date().toISOString().slice(5, 16)}`,
          phone: null,
        },
        select: { id: true },
      });
      customerId = walkIn.id;
    }

    const weight = isDraw
      ? calculateTierWeight(amountCents, tier, amountCents, 0, 0)
      : 0;

    const shortCode = await allocateShortCode();
    const voucher = await prisma.voucher.create({
      data: {
        customerId,
        campaignId: campaign.id,
        storeId: store.id,
        sellerId: null,
        amountCents,
        paidCents: amountCents,
        balanceCents: amountCents,
        usedCents: 0,
        prizePoolContribution: 0,
        drawWeight: weight,
        tier,
        status: "active",
        shortCode,
        productKind: "self_use",
        paymentMethod:
          paymentMethod === "paynow_store" ? "paynow_store" : "cash",
      },
    });

    let instantPrize: {
      name: string;
      icon: string;
      valueSgd: string;
    } | null = null;

    if (isDraw && doInstantDraw && tierResolved) {
      const instantResult = drawInstantV2(
        tierResolved,
        campaign.instantPoolCents || 0
      );
      await prisma.voucherDraw.create({
        data: {
          voucherId: voucher.id,
          drawType: "instant",
          won: true,
          prizeName: instantResult.prize.name,
          prizeIcon: instantResult.prize.icon,
          valueCents: instantResult.prize.valueCents,
          weightAtTime: weight,
        },
      });
      instantPrize = {
        name: instantResult.prize.name,
        icon: instantResult.prize.icon,
        valueSgd: (instantResult.prize.valueCents / 100).toFixed(2),
      };
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          entryCount: { increment: 1 },
          totalTicketCount: { increment: 1 },
        },
      });
    } else {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { totalClaims: { increment: 1 } },
      });
    }

    return NextResponse.json({
      data: {
        id: voucher.id,
        shortCode: voucher.shortCode,
        balanceSgd: (amountCents / 100).toFixed(2),
        productKind: "self_use",
        isDraw,
        displayKind: isDraw ? "exclusive" : "self_use",
        campaignName: campaign.name,
        storeName: store.name,
        paymentMethod: voucher.paymentMethod,
        instantPrize,
        note: isDraw
          ? "独享券已发出：钱已在店；即时奖由本店兑付；核销不入平台钱包"
          : "自用券已发出：钱已在店，核销时仅记履约",
      },
    });
  } catch (error) {
    console.error("issue-self error:", error);
    return NextResponse.json({ error: "发券失败" }, { status: 500 });
  }
}

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
    // Face F = spendable balance; paid P = cash actually received (P ≤ F)
    const faceSgd = Number(body.faceSgd ?? body.amountSgd);
    const faceCents = Math.round(
      body.faceCents != null
        ? Number(body.faceCents)
        : body.amountCents != null
          ? Number(body.amountCents)
          : faceSgd * 100
    );
    let paidCents: number;
    if (body.paidCents != null) {
      paidCents = Math.round(Number(body.paidCents));
    } else if (body.paidSgd != null) {
      paidCents = Math.round(Number(body.paidSgd) * 100);
    } else if (body.discountPercent != null) {
      const d = Math.min(90, Math.max(0, Number(body.discountPercent)));
      paidCents = Math.round((faceCents * (100 - d)) / 100);
    } else {
      paidCents = faceCents; // no discount
    }
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

    if (!campaignId || !faceCents || faceCents < 100) {
      return NextResponse.json(
        { error: "请选择活动且面额至少 S$1" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(paidCents) || paidCents < 1) {
      return NextResponse.json({ error: "实收金额无效" }, { status: 400 });
    }
    if (paidCents > faceCents) {
      return NextResponse.json(
        { error: "实收不能大于面值" },
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
    const faceSgdResolved = faceCents / 100;
    const tierResolved = resolveTier(faceSgdResolved);
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
      ? calculateTierWeight(faceCents, tier, faceCents, 0, 0)
      : 0;

    const shortCode = await allocateShortCode();
    const payMethod =
      paymentMethod === "paynow_store" ? "paynow_store" : "cash";

    let voucher;
    let instantPrize: {
      name: string;
      icon: string;
      valueSgd: string;
    } | null = null;
    let feeNote = "";

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 独享现金/店收：从企业充值扣 15%（优先平台赠送额度）
        if (isDraw) {
          const { applyExclusiveCashSaleFees } = await import(
            "@/lib/exclusive-fees"
          );
          try {
            const fee = await applyExclusiveCashSaleFees(tx, {
              businessId,
              campaignId: campaign.id,
              faceCents,
              referenceId: shortCode,
              label: `独享柜台发券 · ${campaign.name}`,
            });
            feeNote = `已扣企业账户 S$${(fee.totalCents / 100).toFixed(2)}（15%：小奖3%+服务费2%+大奖10%）`;
          } catch (e) {
            if (e instanceof Error && e.message === "INSUFFICIENT_TOKEN") {
              throw new Error("INSUFFICIENT_TOKEN");
            }
            throw e;
          }
        }

        const v = await tx.voucher.create({
          data: {
            customerId,
            campaignId: campaign.id,
            storeId: store.id,
            sellerId: null,
            amountCents: faceCents,
            paidCents,
            balanceCents: faceCents,
            usedCents: 0,
            prizePoolContribution: 0,
            drawWeight: weight,
            tier,
            status: "active",
            shortCode,
            productKind: "self_use",
            paymentMethod: payMethod,
          },
        });

        let prize: typeof instantPrize = null;
        if (isDraw && doInstantDraw && tierResolved) {
          const camp = await tx.campaign.findUnique({
            where: { id: campaign.id },
            select: { instantPoolCents: true },
          });
          const instantResult = drawInstantV2(
            tierResolved,
            camp?.instantPoolCents || 0
          );
          await tx.voucherDraw.create({
            data: {
              voucherId: v.id,
              drawType: "instant",
              won: true,
              prizeName: instantResult.prize.name,
              prizeIcon: instantResult.prize.icon,
              valueCents: instantResult.prize.valueCents,
              weightAtTime: weight,
            },
          });
          prize = {
            name: instantResult.prize.name,
            icon: instantResult.prize.icon,
            valueSgd: (instantResult.prize.valueCents / 100).toFixed(2),
          };
          await tx.campaign.update({
            where: { id: campaign.id },
            data: {
              entryCount: { increment: 1 },
              totalTicketCount: { increment: 1 },
            },
          });
        } else {
          await tx.campaign.update({
            where: { id: campaign.id },
            data: { totalClaims: { increment: 1 } },
          });
        }
        return { voucher: v, prize };
      });
      voucher = result.voucher;
      instantPrize = result.prize;
    } catch (e) {
      if (e instanceof Error && e.message === "INSUFFICIENT_TOKEN") {
        return NextResponse.json(
          {
            error:
              "企业账户余额不足，无法现金发独享券。请先充值（平台赠送额度可扣费用但不可提现）。",
            code: "NEED_TOPUP",
          },
          { status: 402 }
        );
      }
      throw e;
    }

    const discountPct =
      faceCents > 0
        ? Math.round(((faceCents - paidCents) / faceCents) * 1000) / 10
        : 0;

    return NextResponse.json({
      data: {
        id: voucher.id,
        shortCode: voucher.shortCode,
        balanceSgd: (faceCents / 100).toFixed(2),
        faceSgd: (faceCents / 100).toFixed(2),
        paidSgd: (paidCents / 100).toFixed(2),
        discountPercent: discountPct,
        productKind: "self_use",
        isDraw,
        displayKind: isDraw ? "exclusive" : "self_use",
        campaignName: campaign.name,
        storeName: store.name,
        paymentMethod: voucher.paymentMethod,
        instantPrize,
        feeNote: feeNote || undefined,
        note: isDraw
          ? "独享券已发出：顾客款在店；15% 已从企业账户计提（小奖+服务费+大奖池在平台）；核销不二次入账"
          : "自用券已发出：实收已在店，可花面值进余额；核销仅记履约",
      },
    });
  } catch (error) {
    console.error("issue-self error:", error);
    return NextResponse.json({ error: "发券失败" }, { status: 500 });
  }
}

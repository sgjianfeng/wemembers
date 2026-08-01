// POST /api/business/promo/ndp/issue
// 门店凭单满赠 / 管理层 Comp：绑手机后发 S$61 + 低权重大奖签
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  issueNdpGrantDual,
  ndpErrorMessage,
  NDP_MIN_SPEND_CENTS,
  parseNdpRulesFromSnapshot,
} from "@/lib/ndp-promo";
import { normalizePhoneLocal } from "@/lib/physical-tickets";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "business" && session.role !== "staff")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    let businessId = session.userId;
    if (session.role === "staff") {
      if (!session.storeId) {
        return NextResponse.json({ error: "店员未绑定门店" }, { status: 403 });
      }
      const st = await prisma.store.findUnique({
        where: { id: session.storeId },
        select: { businessId: true },
      });
      if (!st) {
        return NextResponse.json({ error: "门店不存在" }, { status: 404 });
      }
      businessId = st.businessId;
    }

    const { searchParams } = new URL(request.url);
    const take = Math.min(50, Math.max(1, Number(searchParams.get("take")) || 20));

    const grants = await prisma.promoGrant.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        campaign: { select: { name: true } },
        store: { select: { name: true } },
        customerCoupon: { select: { qrCode: true, expiresAt: true, status: true } },
        voucher: { select: { shortCode: true, drawWeight: true } },
      },
    });

    // 列出可用满赠活动（holiday 或 rules 含 ndp / minSpend 120）
    const campaigns = await prisma.campaign.findMany({
      where: {
        businessId,
        status: { in: ["active", "draft"] },
        OR: [
          { type: "holiday" },
          { tags: { contains: "ndp" } },
          { tags: { contains: "national" } },
          { name: { contains: "国庆" } },
          { name: { contains: "National" } },
        ],
      },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        startDate: true,
        endDate: true,
        rulesSnapshot: true,
        minSpendCents: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      data: {
        grants: grants.map((g) => ({
          id: g.id,
          channel: g.channel,
          phone: g.phone,
          receiptAmountCents: g.receiptAmountCents,
          status: g.status,
          issuedAt: g.issuedAt?.toISOString() ?? null,
          expiresAt: g.expiresAt?.toISOString() ?? null,
          campaignName: g.campaign.name,
          storeName: g.store?.name ?? null,
          couponQr: g.customerCoupon?.qrCode ?? null,
          couponStatus: g.customerCoupon?.status ?? null,
          drawWeight: g.voucher?.drawWeight ?? null,
          shortCode: g.voucher?.shortCode ?? null,
        })),
        campaigns: campaigns.map((c) => {
          const rules = parseNdpRulesFromSnapshot(c.rulesSnapshot);
          return {
            id: c.id,
            name: c.name,
            type: c.type,
            status: c.status,
            startDate: c.startDate.toISOString(),
            endDate: c.endDate.toISOString(),
            minSpendCents: c.minSpendCents ?? rules.minSpendCents,
            giftCouponCents: rules.giftCouponCents,
            validDays: rules.validDays,
            giftWeight: undefined as number | undefined,
          };
        }),
        defaults: {
          minSpendCents: NDP_MIN_SPEND_CENTS,
        },
      },
    });
  } catch (e) {
    console.error("ndp issue GET", e);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "business" && session.role !== "staff")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    const campaignId =
      typeof body.campaignId === "string" ? body.campaignId.trim() : "";
    const phone = normalizePhoneLocal(
      typeof body.customerPhone === "string"
        ? body.customerPhone
        : typeof body.phone === "string"
          ? body.phone
          : ""
    );
    const channelRaw =
      typeof body.channel === "string" ? body.channel.trim() : "receipt";
    const channel = channelRaw === "comp" ? "comp" : "receipt";
    const receiptNote =
      typeof body.receiptNote === "string"
        ? body.receiptNote.trim().slice(0, 200)
        : "";

    let receiptAmountCents = 0;
    if (body.receiptAmountCents != null) {
      receiptAmountCents = Math.round(Number(body.receiptAmountCents));
    } else if (body.receiptAmountSgd != null && body.receiptAmountSgd !== "") {
      receiptAmountCents = Math.round(Number(body.receiptAmountSgd) * 100);
    }

    if (!campaignId) {
      return NextResponse.json({ error: "请选择活动" }, { status: 400 });
    }
    if (!phone || phone.length < 8) {
      return NextResponse.json({ error: "请填写顾客手机号（绑定用）" }, { status: 400 });
    }

    // Comp 仅企业主
    if (channel === "comp" && session.role !== "business") {
      return NextResponse.json(
        { error: "仅企业主可无支付赠送（Comp）", code: "BUSINESS_ONLY" },
        { status: 403 }
      );
    }

    let businessId = session.userId;
    let storeId: string | null =
      typeof body.storeId === "string" ? body.storeId.trim() : null;

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
      businessId = st.businessId;
      storeId = st.id;
    } else if (storeId) {
      const st = await prisma.store.findFirst({
        where: { id: storeId, businessId: session.userId },
        select: { id: true },
      });
      if (!st) {
        return NextResponse.json({ error: "门店无效" }, { status: 400 });
      }
    }

    if (channel === "receipt" && (!Number.isFinite(receiptAmountCents) || receiptAmountCents < 1)) {
      return NextResponse.json({ error: "请确认消费金额" }, { status: 400 });
    }

    try {
      const result = await prisma.$transaction(async (tx) =>
        issueNdpGrantDual(tx, {
          campaignId,
          businessId,
          storeId,
          staffUserId: session.userId,
          phone,
          channel,
          receiptAmountCents: channel === "comp" ? receiptAmountCents || 0 : receiptAmountCents,
          receiptNote: receiptNote || (channel === "comp" ? body.compReason || "comp" : null),
          skipMinSpend: channel === "comp",
        })
      );

      return NextResponse.json({
        data: {
          ...result,
          message: `已发放 S$${(result.giftCoupon.valueCents / 100).toFixed(0)} 赠送券 + 大奖抽奖资格（权重 ${result.drawEntry.drawWeight}，约为购券的 1/${result.drawEntry.weightMultiple.toFixed(0)}）`,
        },
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "ISSUE_FAILED";
      const known = [
        "CAMPAIGN_NOT_FOUND",
        "CAMPAIGN_ENDED",
        "CAMPAIGN_OUT_OF_WINDOW",
        "BELOW_MIN_SPEND",
        "DUPLICATE_RECEIPT",
        "INVALID_PHONE",
        "PHONE_NOT_CUSTOMER",
      ];
      if (known.includes(code)) {
        return NextResponse.json(
          { error: ndpErrorMessage(code, "zh"), code },
          { status: 400 }
        );
      }
      console.error("ndp issue POST tx", err);
      return NextResponse.json({ error: "发放失败" }, { status: 500 });
    }
  } catch (e) {
    console.error("ndp issue POST", e);
    return NextResponse.json({ error: "发放失败" }, { status: 500 });
  }
}

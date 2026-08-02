import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { uniquePhysicalCode } from "@/lib/physical-tickets";
import {
  ensureSelfUseCampaignForPrint,
  isNdpGiftCampaign,
} from "@/lib/physical-to-voucher";
import {
  ensureNdpGiftCoupon,
  NDP_GIFT_COUPON_CENTS,
  parseNdpMetaFromCampaign,
} from "@/lib/ndp-promo";
import type { Prisma } from "@prisma/client";
import {
  isVisualTemplateId,
  resolveThemeHex,
} from "@/lib/visual-templates";
import { ballotGrandContributionCents } from "@/lib/store-defaults";

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
    const typeRaw = typeof body.type === "string" ? body.type.trim() : "voucher";
    const type =
      typeRaw === "draw" || typeRaw === "ballot" ? typeRaw : "voucher";
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
      : type === "draw" || type === "ballot"
        ? "store_bold"
        : "store_classic";
    const themeColor = resolveThemeHex(
      typeof body.themeColor === "string" ? body.themeColor.trim() : null,
      visualTemplateId
    );

    // ballot：大奖贡献默认 = 档面 × 10%；可 body.contributionCents 覆盖
    let contributionCents = Math.max(
      0,
      Math.round(Number(body.contributionCents) || 0)
    );
    if (type === "ballot" && contributionCents <= 0 && valueCents > 0) {
      contributionCents = ballotGrandContributionCents(valueCents);
    }

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
    // 独享实体 / 入箱票：须有面值（50/100 等）
    if ((type === "draw" || type === "ballot") && valueCents < 100) {
      return NextResponse.json(
        {
          error:
            type === "ballot"
              ? "入箱票须设置档位面值（S$50 或 S$100）"
              : "独享抽奖实体须设置面值（至少 S$1）",
        },
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

    if ((type === "draw" || type === "ballot") && !campaignId) {
      return NextResponse.json(
        {
          error:
            type === "ballot"
              ? "入箱票须关联独享抽奖活动"
              : "独享抽奖实体须关联独享活动（self_use 抽奖）",
        },
        { status: 400 }
      );
    }

    let resolvedCampaignId = campaignId;
    let isNdpPaper = false;
    let campRow: {
      id: string;
      productKind: string;
      type: string;
      name: string;
      tags: string | null;
      rulesSnapshot: string | null;
      endDate: Date;
    } | null = null;

    if (campaignId) {
      campRow = await prisma.campaign.findFirst({
        where: { id: campaignId, businessId: session.userId },
        select: {
          id: true,
          productKind: true,
          type: true,
          name: true,
          tags: true,
          rulesSnapshot: true,
          endDate: true,
        },
      });
      if (!campRow) {
        return NextResponse.json({ error: "活动无效" }, { status: 400 });
      }
      isNdpPaper = isNdpGiftCampaign(campRow);
      if (type === "voucher" && !isNdpPaper && campRow.productKind !== "self_use") {
        return NextResponse.json(
          { error: "实体代金须关联「自用券」活动（打印版）" },
          { status: 400 }
        );
      }
      if (type === "draw" || type === "ballot") {
        if (campRow.productKind !== "self_use") {
          return NextResponse.json(
            { error: "实体抽奖/入箱票请关联「独享」活动（先收款）" },
            { status: 400 }
          );
        }
        if (
          campRow.type !== "lucky_draw_v2" &&
          campRow.type !== "lucky_draw"
        ) {
          return NextResponse.json(
            { error: "请选择抽奖类型的独享活动" },
            { status: 400 }
          );
        }
      }
    }

    const validUntil = validUntilRaw ? new Date(validUntilRaw) : null;
    if (validUntil && Number.isNaN(validUntil.getTime())) {
      return NextResponse.json({ error: "有效期格式无效" }, { status: 400 });
    }

    const now = new Date();
    let until =
      validUntil ||
      new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    // 国庆满赠纸：挂 NDP 活动 + 赠送券模版；绑号后进 CustomerCoupon
    // 其它代金：挂 self_use campaign；绑号后进预付余额
    let couponId: string | null = null;
    if (type === "voucher" && isNdpPaper && campRow) {
      resolvedCampaignId = campRow.id;
      const meta = parseNdpMetaFromCampaign(campRow);
      const giftCents =
        valueCents > 0 ? valueCents : meta.giftCouponCents || NDP_GIFT_COUPON_CENTS;
      // 活动窗口内：默认有效期不短于活动结束+赠送天数缓冲
      if (!validUntilRaw) {
        const end = new Date(campRow.endDate);
        end.setDate(end.getDate() + (meta.validDays || 30) + 7);
        until = end;
      }
      couponId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const coupon = await ensureNdpGiftCoupon(tx, {
          businessId: session.userId,
          campaignId: campRow!.id,
          giftCouponCents: giftCents,
          templateValidUntil: until,
        });
        return coupon.id;
      });
    } else if (type === "voucher") {
      resolvedCampaignId = await prisma.$transaction((tx) =>
        ensureSelfUseCampaignForPrint(tx, session.userId, {
          faceSgd: valueCents / 100,
          name: "自用券（实体/线上）",
        })
      );
      if (campaignId) {
        const preferred = await prisma.campaign.findFirst({
          where: {
            id: campaignId,
            businessId: session.userId,
            productKind: "self_use",
            type: "voucher_sale",
          },
          select: { id: true },
        });
        if (preferred) {
          resolvedCampaignId = preferred.id;
          await prisma.$transaction((tx) =>
            ensureSelfUseCampaignForPrint(tx, session.userId, {
              faceSgd: valueCents / 100,
            })
          );
        }
      }
    }

    const defaultTitle =
      type === "voucher" && isNdpPaper
        ? `国庆赠送券 S$${(valueCents / 100).toFixed(0)}（实体）`
        : type === "voucher"
          ? `自用券 S$${(valueCents / 100).toFixed(0)}（实体）`
          : type === "ballot"
            ? `入箱票 S$${(valueCents / 100).toFixed(0)}（大奖贡献 S$${(contributionCents / 100).toFixed(2)}）`
            : "抽奖实体券";
    const defaultDesc =
      type === "voucher" && isNdpPaper
        ? `国庆满赠纸质版 · 扫码绑定后进券包（与线上赠送券一致）· ${store.name}`
        : type === "voucher"
          ? `自用券打印版 · ${store.name} 出库 · 集团门店可核 · 绑号后进余额`
          : type === "ballot"
            ? `仅投抽奖箱 / 表演开箱 · 不抵消费 · 对应独享 10% 大奖积累 · ${store.name}`
            : null;

    const batch = await prisma.physicalBatch.create({
      data: {
        businessId: session.userId,
        storeId,
        type,
        title: title || defaultTitle,
        description: description || defaultDesc,
        valueCents,
        contributionCents: type === "ballot" ? contributionCents : 0,
        quantity,
        validUntil: until,
        campaignId: resolvedCampaignId,
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

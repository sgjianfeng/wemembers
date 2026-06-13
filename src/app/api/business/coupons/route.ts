import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { spendTokens } from "@/lib/tokens";
import { TOKEN_COSTS } from "@/types";
import { generateQrCode } from "@/lib/utils";

// GET /api/business/coupons — 券列表
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "无权操作" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = 20;

  const where: any = { businessId: session.userId };
  if (status) where.status = status;

  const [coupons, total] = await Promise.all([
    prisma.coupon.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.coupon.count({ where }),
  ]);

  return NextResponse.json({ data: coupons, meta: { total, page, hasMore: page * limit < total } });
}

// POST /api/business/coupons — 创建代金券
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "无权操作" }, { status: 403 });

  try {
    const body = await request.json();
    const {
      title, description, type, valueCents, minSpendCents, pointsRequired,
      totalQuantity, validFrom, validUntil, isGiftable, perCustomerLimit, status: couponStatus,
      allowPromotion, rewardType, commissionType, commissionValue, allowBulkPurchase, bulkDiscount,
      itemRewardName, itemRewardQuantity, giftType, giftData, campaignId,
    } = body;

    if (!title || !type || !valueCents || !validFrom || !validUntil) {
      return NextResponse.json({ error: "请填写必要字段" }, { status: 400 });
    }

    // 扣 Token
    const result = await spendTokens(session.userId, TOKEN_COSTS.coupon_create, "coupon_create", `创建代金券「${title}」`);

    if (!result.success) {
      return NextResponse.json({ error: `Token余额不足，需要 ${TOKEN_COSTS.coupon_create} Token，当前余额 ${result.balanceAfter}` }, { status: 402 });
    }

    const coupon = await prisma.coupon.create({
      data: {
        businessId: session.userId,
        title,
        description: description || null,
        type,
        valueCents,
        minSpendCents: minSpendCents || 0,
        pointsRequired: pointsRequired || 0,
        totalQuantity: totalQuantity || null,
        remainingQuantity: totalQuantity || null,
        validFrom: new Date(validFrom),
        validUntil: new Date(validUntil),
        isGiftable: isGiftable !== false,
        perCustomerLimit: perCustomerLimit || 1,
        status: couponStatus || "published",
        allowPromotion: allowPromotion || false,
        rewardType: rewardType || "cash",
        commissionType: allowPromotion && rewardType === "cash" ? commissionType : null,
        commissionValue: allowPromotion && rewardType === "cash" ? commissionValue : null,
        itemRewardName: allowPromotion && rewardType === "item" ? itemRewardName : null,
        itemRewardQuantity: allowPromotion && rewardType === "item" && itemRewardQuantity > 0 ? itemRewardQuantity : null,
        allowBulkPurchase: allowPromotion && rewardType === "cash" ? (allowBulkPurchase || false) : false,
        bulkDiscount: allowPromotion && rewardType === "cash" && allowBulkPurchase ? bulkDiscount : null,
        giftType: giftType || "none",
        giftData: giftType && giftType !== "none" ? giftData : null,
        campaignId: campaignId || null,
      },
    });

    // 更新活动计数
    if (campaignId) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { couponCount: { increment: 1 } },
      });
    }

    return NextResponse.json({ data: coupon, meta: { tokenBalance: result.balanceAfter } });
  } catch (error) {
    console.error("create coupon error:", error);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}

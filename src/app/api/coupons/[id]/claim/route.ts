import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateQrCode } from "@/lib/utils";
import {
  getBrandPoints,
  grantBrandPoints,
  spendBrandPoints,
  PointsError,
} from "@/lib/points";

// POST /api/coupons/[id]/claim — 客户领券
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "customer") return NextResponse.json({ error: "请登录" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const refCode = searchParams.get("ref"); // 推广码

  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon || coupon.status !== "published") return NextResponse.json({ error: "券不存在或已下架" }, { status: 404 });
  if (coupon.validUntil < new Date()) return NextResponse.json({ error: "券已过期" }, { status: 400 });
  if (coupon.remainingQuantity !== null && coupon.remainingQuantity <= 0) return NextResponse.json({ error: "券已被领完" }, { status: 400 });

  // 检查积分 —— 只认**本品牌**的积分。
  // 这里以前读的是 User.pointsBalance（全平台通用余额），等于让 A 商家发的积分
  // 去兑 B 商家的券：券是 B 的真实库存，成本却没人承担。积分是谁发的就只能在谁家花。
  const brandPoints = await getBrandPoints(coupon.businessId, session.userId);
  if (brandPoints < coupon.pointsRequired) {
    return NextResponse.json(
      { error: `本店积分不足，需要 ${coupon.pointsRequired}⭐，当前 ${brandPoints}⭐` },
      { status: 400 }
    );
  }

  // 检查限领
  const claimCount = await prisma.customerCoupon.count({ where: { customerId: session.userId, couponId: id } });
  if (claimCount >= coupon.perCustomerLimit) return NextResponse.json({ error: `每人限领 ${coupon.perCustomerLimit} 张` }, { status: 400 });

  // 解析推广来源
  let promoterLink: { id: string; promoterId: string } | null = null;
  if (refCode && coupon.allowPromotion) {
    const link = await prisma.promoterLink.findFirst({
      where: { code: refCode.toUpperCase(), couponId: id, isActive: true },
      select: { id: true, promoterId: true },
    });
    // 不能自己推广给自己
    if (link && link.promoterId !== session.userId) {
      promoterLink = link;
    }
  }

  // 扣积分 + 创建领取记录
  const qrCode = generateQrCode();

  // 先开卡（下面扣积分要求会员关系存在），再扣分
  await prisma.membership.upsert({
    where: { businessId_customerId: { businessId: coupon.businessId, customerId: session.userId } },
    create: { businessId: coupon.businessId, customerId: session.userId, points: 0, lifetimePoints: 0 },
    update: {},
  });

  let pointsAfter = brandPoints;
  if (coupon.pointsRequired > 0) {
    try {
      const spent = await spendBrandPoints({
        businessId: coupon.businessId,
        customerId: session.userId,
        amount: coupon.pointsRequired,
        type: "coupon_claim",
        reason: `领取「${coupon.title}」`,
      });
      pointsAfter = spent.balanceAfter;
    } catch (e) {
      if (e instanceof PointsError) {
        // 并发领券时可能在检查之后被扣光，扣减语句自带 gte 条件，这里只需回报
        return NextResponse.json({ error: `本店积分不足，需要 ${coupon.pointsRequired}⭐` }, { status: 400 });
      }
      throw e;
    }
  }

  const [claim] = await Promise.all([
    prisma.customerCoupon.create({
      data: { customerId: session.userId, couponId: id, qrCode, pointsSpent: coupon.pointsRequired, status: "available", sourceLinkId: promoterLink?.id },
    }),
    prisma.coupon.update({
      where: { id },
      data: {
        claimedCount: { increment: 1 },
        ...(coupon.remainingQuantity !== null ? { remainingQuantity: { decrement: 1 } } : {}),
      },
    }),
    // 推广链接计数
    ...(promoterLink ? [prisma.promoterLink.update({ where: { id: promoterLink.id }, data: { claims: { increment: 1 } } })] : []),
  ]);

  // 领券赠品
  let gift: any = null;
  if (coupon.giftType && coupon.giftType !== "none" && coupon.giftData) {
    try {
      const giftConfig = JSON.parse(coupon.giftData);

      if (coupon.giftType === "points" && giftConfig.points) {
        // 赠分同样是发券商家的负债，只能进本品牌账
        const granted = await grantBrandPoints({
          businessId: coupon.businessId,
          customerId: session.userId,
          amount: giftConfig.points,
          type: "claim_gift",
          reason: `领取「${coupon.title}」赠送`,
        });
        pointsAfter = granted.balanceAfter;
        gift = { type: "points", data: { points: giftConfig.points }, message: `额外获得 ${giftConfig.points}⭐ 积分！` };
      } else if (coupon.giftType === "item") {
        gift = { type: "item", data: { name: giftConfig.name, icon: giftConfig.icon, image: giftConfig.image }, message: `额外获得「${giftConfig.name}」！` };
      } else if (coupon.giftType === "lottery" && giftConfig.prizes) {
        // 加权随机抽奖
        const prizes = giftConfig.prizes.filter((p: any) => p.stock === undefined || p.stock === null || p.stock > 0);
        const totalWeight = prizes.reduce((s: number, p: any) => s + (p.weight || 10), 0);
        let rand = Math.random() * totalWeight;
        let winner = prizes[0];
        for (const p of prizes) {
          rand -= (p.weight || 10);
          if (rand <= 0) { winner = p; break; }
        }
        gift = { type: "lottery", data: { name: winner.name, icon: winner.icon || "🎁" }, message: `抽中了「${winner.name}」！` };
      }

      if (gift) {
        await prisma.giftRecord.create({
          data: { claimId: claim.id, customerId: session.userId, type: gift.type, data: JSON.stringify(gift.data), status: "pending" },
        });
      }
    } catch {}
  }

  return NextResponse.json({
    data: {
      claim,
      pointsBalance: pointsAfter,
      brandPoints: pointsAfter,
      message: "领取成功！",
      gift: gift || undefined,
      ...(promoterLink ? { viaPromoter: true } : {}),
    },
  });
}

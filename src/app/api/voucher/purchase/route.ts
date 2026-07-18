import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  fulfillVoucherPurchase,
  VoucherPurchaseError,
} from "@/lib/voucher-purchase";

/**
 * POST /api/voucher/purchase?slug=
 * Direct fulfill (tests / offline). Production UI should use /api/voucher/checkout.
 * Body: { amountSgd, spendNowSgd?, sellerId?, skipPayment?: boolean }
 *
 * When STRIPE_SECRET_KEY is set and skipPayment is not true, returns 402 with hint to use checkout.
 * Set ALLOW_DIRECT_VOUCHER_PURCHASE=true to always allow (local/dev/e2e).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "缺少活动标识" }, { status: 400 });

    const body = await request.json();
    const { amountSgd, spendNowSgd, sellerId, skipPayment } = body;

    const allowDirect =
      process.env.ALLOW_DIRECT_VOUCHER_PURCHASE === "true" ||
      process.env.NODE_ENV === "test" ||
      skipPayment === true ||
      !process.env.STRIPE_SECRET_KEY;

    if (!allowDirect) {
      return NextResponse.json(
        {
          error: "请使用 Stripe 支付购券",
          code: "USE_CHECKOUT",
          checkout: `/api/voucher/checkout?slug=${encodeURIComponent(slug)}`,
        },
        { status: 402 }
      );
    }

    const campaign = await prisma.campaign.findFirst({
      where: {
        slug,
        status: "active",
        type: { in: ["lucky_draw_v2", "voucher_sale"] },
      },
      select: { id: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "活动不可用" }, { status: 404 });
    }

    const data = await fulfillVoucherPurchase({
      customerId: session.userId,
      campaignId: campaign.id,
      amountSgd: Number(amountSgd),
      spendNowSgd: Number(spendNowSgd || 0),
      sellerId: sellerId || null,
      stripeSessionId: null,
    });

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof VoucherPurchaseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("voucher purchase error:", error);
    return NextResponse.json({ error: "购券失败" }, { status: 500 });
  }
}

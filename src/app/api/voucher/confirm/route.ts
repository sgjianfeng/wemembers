import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import {
  fulfillVoucherPurchase,
  VoucherPurchaseError,
} from "@/lib/voucher-purchase";

/**
 * POST /api/voucher/confirm
 * After Stripe redirect: verify session paid and fulfill (idempotent with webhook).
 * Body: { sessionId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    const sessionId = body.sessionId as string;
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "未配置 Stripe" }, { status: 503 });
    }

    const checkout = await stripe.checkout.sessions.retrieve(sessionId);
    if (checkout.payment_status !== "paid" && checkout.status !== "complete") {
      return NextResponse.json({ error: "支付未完成" }, { status: 402 });
    }

    const meta = checkout.metadata || {};
    if (meta.type !== "voucher_purchase") {
      return NextResponse.json({ error: "非购券订单" }, { status: 400 });
    }
    if (meta.userId !== session.userId) {
      return NextResponse.json({ error: "订单不属于当前用户" }, { status: 403 });
    }

    const data = await fulfillVoucherPurchase({
      customerId: session.userId,
      campaignId: meta.campaignId,
      amountSgd: Number(meta.amountSgd),
      spendNowSgd: Number(meta.spendNowSgd || 0),
      sellerId: meta.sellerId || null,
      stripeSessionId: checkout.id,
    });

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof VoucherPurchaseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("voucher confirm error:", error);
    return NextResponse.json({ error: "确认购券失败" }, { status: 500 });
  }
}

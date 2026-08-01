import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import {
  quoteVoucherPaidCents,
  VoucherPurchaseError,
} from "@/lib/voucher-purchase";
import {
  buildVoucherReturnUrl,
  sanitizeCheckoutReturnQuery,
} from "@/lib/activity-buy-context";

/**
 * POST /api/voucher/checkout?slug=
 * Create Stripe Checkout Session for voucher purchase.
 * Body: { amountSgd, spendNowSgd?, sellerId?, returnQuery? | 语境字段 }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "未配置 Stripe" }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");
    if (!slug) {
      return NextResponse.json({ error: "缺少活动标识" }, { status: 400 });
    }

    const body = await request.json();
    const amountSgd = Number(body.amountSgd);
    const spendNowSgd = Number(body.spendNowSgd || 0);
    const sellerId =
      typeof body.sellerId === "string" && body.sellerId ? body.sellerId : "";

    // 支付成功/取消后回到购券页时保留国庆/门店语境
    const returnQuery =
      typeof body.returnQuery === "string"
        ? sanitizeCheckoutReturnQuery(new URLSearchParams(body.returnQuery))
        : sanitizeCheckoutReturnQuery(
            body.returnContext && typeof body.returnContext === "object"
              ? (body.returnContext as Record<string, unknown>)
              : null
          );

    if (!amountSgd || amountSgd <= 0) {
      return NextResponse.json({ error: "请选择券面金额" }, { status: 400 });
    }
    const faceCents = Math.round(amountSgd * 100);
    const spendNowCents = Math.round(spendNowSgd * 100);
    if (spendNowCents < 0) {
      return NextResponse.json({ error: "消费金额无效" }, { status: 400 });
    }

    const { resolveSellableBySlug } = await import("@/lib/catalog");
    const resolved = await resolveSellableBySlug(slug);
    if (!resolved) {
      return NextResponse.json({ error: "券产品不可用" }, { status: 404 });
    }
    const campaign = {
      id: resolved.campaignId,
      name: resolved.product?.name || resolved.campaign.name,
      type: resolved.product?.type || resolved.campaign.type,
      productKind:
        resolved.product?.productKind || resolved.campaign.productKind,
    };

    const isDrawCampaign = campaign.type === "lucky_draw_v2";
    const isCowin =
      isDrawCampaign && campaign.productKind !== "self_use";
    // 共赢：必须带卖家（人或店）
    if (isCowin && !sellerId) {
      return NextResponse.json(
        { error: "共赢券须使用带卖家的链接或店码购买" },
        { status: 400 }
      );
    }
    // 抽奖保留「至少留 20%」；代金可先花到 0
    if (isDrawCampaign && spendNowCents > faceCents * 0.8) {
      return NextResponse.json({ error: "余额不能低于券面的 20%" }, { status: 400 });
    }
    if (!isDrawCampaign && spendNowCents > faceCents) {
      return NextResponse.json({ error: "本次消费不能超过可花余额" }, { status: 400 });
    }

    const hasSeller = Boolean(sellerId);
    const quote = await quoteVoucherPaidCents(campaign.id, amountSgd, hasSeller);
    if (quote.paidCents < 50) {
      return NextResponse.json({ error: "实付金额过低" }, { status: 400 });
    }

    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get("origin") ||
      "http://localhost:3000";

    const isDraw =
      quote.snapshot.kind === "draw" ||
      quote.snapshot.campaignType === "lucky_draw_v2" ||
      campaign.type === "lucky_draw_v2";
    const productName = isDraw
      ? `${campaign.name} · S$${amountSgd} 抽奖券`
      : `${campaign.name} · S$${amountSgd} 代金券`;

    const descriptionParts = [
      `面值 S$${amountSgd}`,
      quote.snapshot.discountPercent > 0
        ? `折扣 ${quote.snapshot.discountPercent}%`
        : null,
      // Model A: balance is full face; pool funded on redeem
      isDraw ? "余额全额可用 · 到店核销 20% 进奖池" : null,
    ].filter(Boolean);

    // Live: PayNow only (SG). Test keys: also enable card so 4242… can 验账.
    const stripeKey = process.env.STRIPE_SECRET_KEY || "";
    const isTestStripe = stripeKey.startsWith("sk_test");
    const paymentMethodTypes: ("paynow" | "card")[] = isTestStripe
      ? ["card", "paynow"]
      : ["paynow"];

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: paymentMethodTypes,
      customer_email: undefined,
      line_items: [
        {
          price_data: {
            currency: "sgd",
            product_data: {
              name: productName,
              description: descriptionParts.join(" · ") || undefined,
            },
            unit_amount: quote.paidCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "voucher_purchase",
        userId: session.userId,
        campaignId: campaign.id,
        productId: resolved.productId || "",
        slug,
        amountSgd: String(amountSgd),
        spendNowSgd: String(spendNowSgd || 0),
        sellerId: sellerId || "",
        faceCents: String(quote.faceCents),
        paidCents: String(quote.paidCents),
        productKind: campaign.productKind || "distribution",
        // 独享：支付款中含 15% 活动扣点（小奖+服务费+大奖），履约时入池
        exclusiveFeePercent:
          campaign.productKind === "self_use" && isDrawCampaign ? "15" : "0",
      },
      success_url: buildVoucherReturnUrl(origin, slug, {
        paid: "1",
        returnQuery,
      }),
      cancel_url: buildVoucherReturnUrl(origin, slug, {
        paid: "0",
        returnQuery,
      }),
    });

    if (!checkoutSession.url) {
      return NextResponse.json({ error: "无法创建支付会话" }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        url: checkoutSession.url,
        sessionId: checkoutSession.id,
        paidCents: quote.paidCents,
        paidSgd: (quote.paidCents / 100).toFixed(2),
        faceCents: quote.faceCents,
      },
    });
  } catch (error) {
    if (error instanceof VoucherPurchaseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("voucher checkout error:", error);
    return NextResponse.json({ error: "创建支付失败" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createCheckoutSession } from "@/lib/stripe";

// POST /api/stripe/checkout — 创建充值 Checkout Session
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "customer")) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { amountSgd } = await request.json();
  if (!amountSgd || amountSgd < 1) {
    return NextResponse.json({ error: "充值金额至少 1 SGD" }, { status: 400 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const isBiz = session.role === "business";
  // 顾客现金充值已下线；仅商户钱包充值
  if (!isBiz) {
    return NextResponse.json({ error: "顾客请使用购券余额，无需 Token 充值" }, { status: 400 });
  }
  const successPath = "/business/tokens?topup=success";
  const cancelPath = "/business/tokens?topup=cancel";

  const url = await createCheckoutSession({
    userId: session.userId,
    amountSgd,
    successUrl: `${origin}${successPath}`,
    cancelUrl: `${origin}${cancelPath}`,
  });

  return NextResponse.json({ data: { url } });
}

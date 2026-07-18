import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { applyPromoterWithdraw } from "@/lib/funding";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    const result = await applyPromoterWithdraw({
      userId: session.userId,
      amountSgd: Number(body.amount),
      method: typeof body.method === "string" ? body.method : "paynow",
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }

    return NextResponse.json({
      data: {
        success: true,
        amount: result.amountSgd,
        method: result.method,
        message: `提现 S$${result.amountSgd.toFixed(2)} 申请已提交（${result.method}），预计 1-3 个工作日人工到账`,
        newBalance: result.newBalanceCents,
      },
    });
  } catch (error) {
    console.error("promoter withdraw error:", error);
    return NextResponse.json({ error: "提现失败" }, { status: 500 });
  }
}

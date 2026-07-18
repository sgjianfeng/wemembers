import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createTransfer } from "@/lib/stripe";
import {
  applyBusinessWithdrawLedger,
  precheckBusinessWithdraw,
} from "@/lib/funding";

// POST /api/stripe/withdraw — 提现（仅可用余额；先释放已到期 T+1 冻结）
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    const amountCents = Number(body.amountCents);

    const check = await precheckBusinessWithdraw({
      userId: session.userId,
      role: session.role,
      amountCents,
    });
    if (!check.ok) {
      return NextResponse.json({ error: check.message, code: check.code }, { status: check.status });
    }

    try {
      await createTransfer({
        amountCents: check.amountCents,
        stripeAccountId: check.stripeAccountId,
        description: "WeMembers 余额提现",
      });
    } catch (error: unknown) {
      console.error("withdrawal stripe transfer error:", error);
      const msg = error instanceof Error ? error.message : "提现失败";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const ledger = await applyBusinessWithdrawLedger({
      userId: session.userId,
      amountCents: check.amountCents,
    });

    return NextResponse.json({
      data: {
        success: true,
        amount: ledger.amountSgd,
        balance: ledger.balance,
      },
    });
  } catch (error) {
    console.error("withdrawal error:", error);
    return NextResponse.json({ error: "提现失败" }, { status: 500 });
  }
}

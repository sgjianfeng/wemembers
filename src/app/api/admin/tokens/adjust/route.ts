import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { grantTokens, spendTokens } from "@/lib/tokens";

// POST /api/admin/tokens/adjust
// Body: { userId: string, amount: number, reason: string }
// amount > 0 = 发放, amount < 0 = 扣除
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  try {
    const { userId, amount, reason } = await request.json();

    if (!userId || !amount || !reason) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    if (amount > 0) {
      const result = await grantTokens(userId, Math.abs(amount), "admin_adjust", reason);
      return NextResponse.json({ data: result });
    } else {
      const result = await spendTokens(userId, Math.abs(amount), "admin_adjust", reason);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ data: result });
    }
  } catch (error) {
    console.error("token adjust error:", error);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}

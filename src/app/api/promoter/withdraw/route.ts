import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { prisma } = await import("@/lib/db");
  const { amount, method } = await request.json();

  if (!amount || amount <= 0) return NextResponse.json({ error: "请输入提现金额" }, { status: 400 });

  const account = await prisma.promoterAccount.findUnique({ where: { userId: session.userId } });
  if (!account) return NextResponse.json({ error: "请先开启推广模式" }, { status: 400 });
  if (account.availableBalance < amount * 100) return NextResponse.json({ error: `可提现余额不足（可用 ¥${(account.availableBalance / 100).toFixed(2)}）` }, { status: 400 });
  if (amount < 10) return NextResponse.json({ error: "最低提现金额为 ¥10.00" }, { status: 400 });

  // MVP: 记录提现，标记已确认的收益为已支付
  await prisma.promoterAccount.update({
    where: { userId: session.userId },
    data: { availableBalance: { decrement: amount * 100 } },
  });

  await prisma.promoterEarning.updateMany({
    where: { promoterId: session.userId, status: "confirmed" },
    data: { status: "paid" },
  });

  return NextResponse.json({
    data: {
      success: true,
      amount,
      method: method || "wechat",
      message: `提现 ¥${amount.toFixed(2)} 申请已提交，预计1-3个工作日到账`,
      newBalance: account.availableBalance - amount * 100,
    },
  });
}

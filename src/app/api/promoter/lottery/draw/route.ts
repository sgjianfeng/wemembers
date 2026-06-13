import { NextRequest, NextResponse } from "next/server";

// POST /api/promoter/lottery/draw — 抽奖
export async function POST(request: NextRequest) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { prisma } = await import("@/lib/db");
  const { couponId } = await request.json();

  if (!couponId) return NextResponse.json({ error: "缺少参数" }, { status: 400 });

  // 获取奖池 (仅库存>0的)
  const prizes = await prisma.lotteryPrize.findMany({
    where: {
      couponId,
      OR: [{ remainingStock: null }, { remainingStock: { gt: 0 } }],
    },
  });

  if (prizes.length === 0) return NextResponse.json({ error: "奖品已被抽完" }, { status: 400 });

  // 加权随机
  const totalWeight = prizes.reduce((s, p) => s + p.weight, 0);
  let rand = Math.random() * totalWeight;
  let winner = prizes[0];
  for (const p of prizes) {
    rand -= p.weight;
    if (rand <= 0) { winner = p; break; }
  }

  // 扣库存
  if (winner.remainingStock !== null) {
    await prisma.lotteryPrize.update({
      where: { id: winner.id },
      data: { remainingStock: { decrement: 1 }, claimed: { increment: 1 } },
    });
  } else {
    await prisma.lotteryPrize.update({ where: { id: winner.id }, data: { claimed: { increment: 1 } } });
  }

  // 记录中奖
  const win = await prisma.lotteryWin.create({
    data: { prizeId: winner.id, promoterId: session.userId, status: "pending" },
  });

  return NextResponse.json({
    data: {
      win,
      prize: { name: winner.name, icon: winner.icon, type: winner.type, valueCents: winner.valueCents },
      message: winner.type === "cash" ? `恭喜获得 ¥${(winner.valueCents / 100).toFixed(2)} 现金！` : `恭喜获得「${winner.name}」！`,
    },
  });
}

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || session.role !== "customer") return NextResponse.json({ error: "请登录" }, { status: 401 });

  const { prisma } = await import("@/lib/db");
  let account = await prisma.promoterAccount.findUnique({ where: { userId: session.userId } });

  if (!account) {
    account = await prisma.promoterAccount.create({ data: { userId: session.userId, isActive: true } });
  } else {
    account = await prisma.promoterAccount.update({ where: { userId: session.userId }, data: { isActive: !account.isActive } });
  }

  return NextResponse.json({ data: { isActive: account.isActive, level: account.level, totalEarned: account.totalEarned } });
}

export async function GET() {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { prisma } = await import("@/lib/db");
  const account = await prisma.promoterAccount.findUnique({ where: { userId: session.userId } });

  return NextResponse.json({ data: { isActive: account?.isActive ?? false, level: account?.level ?? 1, totalEarned: account?.totalEarned ?? 0, availableBalance: account?.availableBalance ?? 0 } });
}

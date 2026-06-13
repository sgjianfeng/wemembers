import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { prisma } = await import("@/lib/db");
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = 30;

  const where: any = { promoterId: session.userId };
  if (status) where.status = status;

  const [earnings, total] = await Promise.all([
    prisma.promoterEarning.findMany({
      where,
      include: { link: { select: { code: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit, take: limit,
    }),
    prisma.promoterEarning.count({ where }),
  ]);

  return NextResponse.json({
    data: earnings,
    meta: { total, page, hasMore: page * limit < total },
  });
}

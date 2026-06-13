import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/business/members — 会员列表
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const tier = searchParams.get("tier") || "";
  const sort = searchParams.get("sort") || "recent";
  const limit = 20;

  const where: any = {
    businessId: session.userId,
    ...(search
      ? {
          customer: {
            OR: [
              { displayName: { contains: search } },
              { phone: { contains: search } },
            ],
          },
        }
      : {}),
    ...(tier ? { tier } : {}),
  };

  let orderBy: any = { createdAt: "desc" };
  if (sort === "points") orderBy = { points: "desc" };
  if (sort === "visits") orderBy = { visitsCount: "desc" };
  if (sort === "tier") orderBy = { points: "desc" };

  const members = await prisma.membership.findMany({
    where,
    include: {
      customer: {
        select: { id: true, displayName: true, phone: true, membershipTier: true },
      },
    },
    orderBy,
    take: limit,
  });

  return NextResponse.json({ data: members });
}

// POST /api/business/members — 添加会员
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "无权操作" }, { status: 403 });

  try {
    const { phone, name, tags } = await request.json();
    if (!phone) return NextResponse.json({ error: "请提供手机号" }, { status: 400 });

    // 查找或创建客户用户
    let customer = await prisma.user.findUnique({ where: { phone } });
    if (!customer) {
      customer = await prisma.user.create({
        data: { phone, displayName: name || null, role: "customer", status: "active" },
      });
      // 给新客户发注册Token
      await prisma.tokenAccount.create({ data: { userId: customer.id, balance: 100, totalEarned: 100 } });
    }

    // 检查是否已存在
    const existing = await prisma.membership.findUnique({
      where: { businessId_customerId: { businessId: session.userId, customerId: customer.id } },
    });
    if (existing) return NextResponse.json({ error: "该客户已是会员" }, { status: 409 });

    const membership = await prisma.membership.create({
      data: { businessId: session.userId, customerId: customer.id, points: 0 },
      include: { customer: { select: { displayName: true, phone: true, membershipTier: true } } },
    });

    return NextResponse.json({ data: membership });
  } catch (error) {
    console.error("add member error:", error);
    return NextResponse.json({ error: "添加失败" }, { status: 500 });
  }
}

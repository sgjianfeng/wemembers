import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type DistributorRow = {
  userId: string;
  label: string;
  kind: "store" | "staff" | "promoter" | "business";
  phone?: string | null;
  storeName?: string | null;
};

/**
 * GET — 本活动可印分发版的账号列表
 * 含：店内通用、企业主、各店店员、已激活推广人（可按手机追加）
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id } = await params;
  const campaign = await prisma.campaign.findFirst({
    where: { id, businessId: session.userId },
    select: { id: true, businessId: true, name: true, slug: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "活动不存在" }, { status: 404 });
  }

  const stores = await prisma.store.findMany({
    where: { businessId: session.userId },
    select: {
      id: true,
      name: true,
      staff: {
        where: { role: "staff", status: "active" },
        select: { id: true, displayName: true, phone: true },
      },
    },
  });

  const list: DistributorRow[] = [
    {
      userId: "",
      label: "店内通用（无个人佣金）",
      kind: "store",
    },
    {
      userId: session.userId,
      label: "企业主（记在商家）",
      kind: "business",
    },
  ];

  for (const st of stores) {
    for (const s of st.staff) {
      list.push({
        userId: s.id,
        label: s.displayName || s.phone || "店员",
        kind: "staff",
        phone: s.phone,
        storeName: st.name,
      });
    }
  }

  // 已激活推广人（平台级；企业可选用）
  const promoters = await prisma.promoterAccount.findMany({
    where: { isActive: true },
    take: 50,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, displayName: true, phone: true } },
    },
  });
  for (const p of promoters) {
    if (list.some((x) => x.userId === p.userId)) continue;
    list.push({
      userId: p.userId,
      label: p.user.displayName || p.user.phone || "推广人",
      kind: "promoter",
      phone: p.user.phone,
    });
  }

  return NextResponse.json({
    data: {
      campaignId: campaign.id,
      slug: campaign.slug,
      name: campaign.name,
      distributors: list,
    },
  });
}

/**
 * POST body: { phone } — 按手机查找/确认可作分发的用户（顾客推广人或店员）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id } = await params;
  const campaign = await prisma.campaign.findFirst({
    where: { id, businessId: session.userId },
    select: { id: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "活动不存在" }, { status: 404 });
  }

  const body = await request.json();
  const phone = String(body.phone || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/^\+65/, "");
  if (!phone) {
    return NextResponse.json({ error: "请输入手机号" }, { status: 400 });
  }

  const user =
    (await prisma.user.findUnique({
      where: { phone },
      include: { promoterAccount: true, store: { select: { name: true, businessId: true } } },
    })) ||
    (await prisma.user.findUnique({
      where: { phone: `+65${phone}` },
      include: { promoterAccount: true, store: { select: { name: true, businessId: true } } },
    }));

  if (!user) {
    return NextResponse.json(
      { error: "未找到该手机号用户，请先让对方注册并开通推广或加为店员" },
      { status: 404 }
    );
  }

  const isStaff =
    user.role === "staff" &&
    user.store?.businessId === session.userId;
  const isPromoter = Boolean(user.promoterAccount?.isActive);
  const isSelf = user.id === session.userId;

  if (!isStaff && !isPromoter && !isSelf) {
    return NextResponse.json(
      {
        error:
          "该用户不是本店店员或已激活推广人。请先添加店员，或让对方在推广中心开通。",
      },
      { status: 400 }
    );
  }

  const row: DistributorRow = {
    userId: user.id,
    label: user.displayName || user.phone || user.id.slice(0, 8),
    kind: isStaff ? "staff" : isPromoter ? "promoter" : "business",
    phone: user.phone,
    storeName: user.store?.name,
  };

  return NextResponse.json({ data: row });
}

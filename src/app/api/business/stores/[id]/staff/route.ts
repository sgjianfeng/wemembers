import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// POST /api/business/stores/[id]/staff — 邀请店员
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id: storeId } = await params;
  const { phone, displayName } = await request.json();
  if (!phone) return NextResponse.json({ error: "请提供手机号" }, { status: 400 });

  const store = await prisma.store.findUnique({
    where: { id: storeId, businessId: session.userId },
  });
  if (!store) return NextResponse.json({ error: "门店不存在" }, { status: 404 });

  // 查找或创建店员用户
  let staffUser = await prisma.user.findUnique({ where: { phone } });

  if (staffUser && staffUser.role !== "customer" && staffUser.role !== "staff") {
    return NextResponse.json({ error: "该用户已是其他角色" }, { status: 409 });
  }

  if (staffUser) {
    // 升级为 staff
    staffUser = await prisma.user.update({
      where: { id: staffUser.id },
      data: {
        role: "staff",
        storeId,
        displayName: displayName || staffUser.displayName,
      },
    });
  } else {
    staffUser = await prisma.user.create({
      data: {
        phone,
        role: "staff",
        storeId,
        displayName: displayName || null,
        status: "active",
      },
    });
  }

  return NextResponse.json({ data: staffUser });
}

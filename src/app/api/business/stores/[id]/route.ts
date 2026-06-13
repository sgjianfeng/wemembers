import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// PUT /api/business/stores/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const store = await prisma.store.update({
    where: { id, businessId: session.userId },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.address !== undefined ? { address: body.address } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
    },
  });

  return NextResponse.json({ data: store });
}

// DELETE /api/business/stores/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id } = await params;

  // 解绑店员
  await prisma.user.updateMany({
    where: { storeId: id },
    data: { storeId: null },
  });

  await prisma.store.delete({
    where: { id, businessId: session.userId },
  });

  return NextResponse.json({ data: { success: true } });
}

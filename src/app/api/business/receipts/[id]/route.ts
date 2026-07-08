import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface ItemInput {
  name: string;
  quantity?: number | null;
  unitPrice?: number | null; // 分
  amount?: number | null; // 分
}

// PATCH /api/business/receipts/[id] — 人工确认/修改后入库
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.receipt.findFirst({
    where: { id, businessId: session.userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "票据不存在" }, { status: 404 });
  }

  const body = await request.json();
  const {
    category,
    vendorName,
    totalAmount,
    taxAmount,
    receiptDate,
    tags,
    note,
    items,
    status,
  } = body;

  let parsedDate: Date | null | undefined = undefined;
  if (receiptDate === null) parsedDate = null;
  else if (typeof receiptDate === "string" && receiptDate) {
    const d = new Date(receiptDate);
    if (!isNaN(d.getTime())) parsedDate = d;
  }

  const receipt = await prisma.receipt.update({
    where: { id },
    data: {
      status: status === "rejected" ? "rejected" : "confirmed",
      ...(category !== undefined ? { category } : {}),
      ...(vendorName !== undefined ? { vendorName: vendorName || null } : {}),
      ...(totalAmount !== undefined ? { totalAmount: totalAmount ?? null } : {}),
      ...(taxAmount !== undefined ? { taxAmount: taxAmount ?? null } : {}),
      ...(parsedDate !== undefined ? { receiptDate: parsedDate } : {}),
      ...(tags !== undefined ? { tags: JSON.stringify(tags ?? []) } : {}),
      ...(note !== undefined ? { note: note || null } : {}),
      // 明细整体替换（前端确认时提交最终列表）
      ...(Array.isArray(items)
        ? {
            items: {
              deleteMany: {},
              create: (items as ItemInput[]).map((it) => ({
                name: it.name,
                quantity: it.quantity ?? null,
                unitPrice: it.unitPrice ?? null,
                amount: it.amount ?? null,
              })),
            },
          }
        : {}),
    },
    include: { items: true },
  });

  return NextResponse.json({ data: receipt });
}

// DELETE /api/business/receipts/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.receipt.findFirst({
    where: { id, businessId: session.userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "票据不存在" }, { status: 404 });
  }

  await prisma.receipt.delete({ where: { id } }); // items 级联删除

  return NextResponse.json({ data: { id } });
}

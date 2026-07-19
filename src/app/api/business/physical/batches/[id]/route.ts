import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/business/physical/batches/[id] — 批次详情 + 全部码（印刷用）
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id } = await params;
  const batch = await prisma.physicalBatch.findFirst({
    where: { id, businessId: session.userId },
    include: {
      store: { select: { id: true, name: true, address: true } },
      tickets: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          code: true,
          status: true,
          claimedAt: true,
          redeemedAt: true,
          customerId: true,
        },
      },
    },
  });

  if (!batch) {
    return NextResponse.json({ error: "批次不存在" }, { status: 404 });
  }

  return NextResponse.json({ data: batch });
}

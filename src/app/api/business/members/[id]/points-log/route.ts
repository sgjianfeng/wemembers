import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/business/members/[id]/points-log
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id: customerId } = await params;

  const membership = await prisma.membership.findUnique({
    where: {
      businessId_customerId: { businessId: session.userId, customerId },
    },
    select: { id: true },
  });

  if (!membership) {
    return NextResponse.json({ error: "会员不存在" }, { status: 404 });
  }

  const logs = await prisma.pointsLog.findMany({
    where: { membershipId: membership.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return NextResponse.json({ data: logs });
}

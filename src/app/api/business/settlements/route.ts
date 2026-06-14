import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/business/settlements — 结算列表
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role") || "all"; // issuer | redeemer | all

  const where: any = {
    ...(role === "issuer" ? { issuerBusinessId: session.userId } : {}),
    ...(role === "redeemer" ? { redeemerBusinessId: session.userId } : {}),
    ...(role === "all" ? { OR: [{ issuerBusinessId: session.userId }, { redeemerBusinessId: session.userId }] } : {}),
  };

  const settlements = await prisma.settlement.findMany({
    where,
    include: {
      redemption: {
        select: {
          redeemedAt: true,
          amountSaved: true,
          store: { select: { name: true } },
          claim: { select: { coupon: { select: { title: true, businessId: true } } } },
        },
      },
      issuer: { select: { businessName: true } },
      redeemer: { select: { businessName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // 汇总
  const summary = {
    totalPlatformFee: settlements.reduce((s, t) => s + t.platformFee, 0),
    totalIssuerFee: settlements.filter((t) => t.issuerBusinessId === session.userId).reduce((s, t) => s + t.issuerFee, 0),
    totalRedeemerIncome: settlements.filter((t) => t.redeemerBusinessId === session.userId).reduce((s, t) => s + t.redeemerIncome, 0),
  };

  return NextResponse.json({ data: settlements, summary });
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const usages = await prisma.voucherUsage.findMany({
    where: { voucher: { customerId: session.userId } },
    include: {
      voucher: { select: { amountCents: true, tier: true } },
      store: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    data: usages.map((u) => ({
      id: u.id,
      amountSgd: (u.amountCents / 100).toFixed(2),
      storeName: u.store?.name || "Unknown",
      createdAt: u.createdAt,
      voucherTier: u.voucher?.tier || "",
    })),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const vouchers = await prisma.voucher.findMany({
    where: { customerId: session.userId, status: "active" },
    include: { campaign: { select: { name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });

  const { isSpendableBalanceVoucher } = await import(
    "@/lib/voucher-classification"
  );
  const spendable = vouchers.filter(isSpendableBalanceVoucher);

  const totalBalance = spendable.reduce((sum, v) => sum + v.balanceCents, 0);
  const totalAmount = spendable.reduce((sum, v) => sum + v.amountCents, 0);
  const totalUsed = spendable.reduce((sum, v) => sum + v.usedCents, 0);

  return NextResponse.json({
    data: {
      totalBalanceSgd: (totalBalance / 100).toFixed(2),
      totalAmountSgd: (totalAmount / 100).toFixed(2),
      totalUsedSgd: (totalUsed / 100).toFixed(2),
      vouchers: spendable.map((v) => ({
        id: v.id,
        amountSgd: (v.amountCents / 100).toFixed(2),
        balanceSgd: (v.balanceCents / 100).toFixed(2),
        tier: v.tier,
        campaignName: v.campaign?.name || "",
        createdAt: v.createdAt,
      })),
    },
  });
}

// GET /api/seller/me — am I an eligible seller? earnings summary
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEligibleSeller } from "@/lib/seller";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const eligible = await getEligibleSeller(session.userId);

    const sold = await prisma.voucher.findMany({
      where: { sellerId: session.userId },
      select: {
        id: true,
        amountCents: true,
        paidCents: true,
        sellerCommissionCents: true,
        usedCents: true,
        balanceCents: true,
        status: true,
        createdAt: true,
        campaign: { select: { name: true, slug: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const accruedCommission = sold.reduce((s, v) => s + v.sellerCommissionCents, 0);
    const soldCount = sold.length;
    const faceTotal = sold.reduce((s, v) => s + v.amountCents, 0);

    // Wallet commission txs (already paid out to token account)
    const account = await prisma.tokenAccount.findUnique({
      where: { userId: session.userId },
      include: {
        transactions: {
          where: { type: "seller_commission" },
          orderBy: { createdAt: "desc" },
          take: 30,
        },
      },
    });

    const paidOut = (account?.transactions || []).reduce((s, t) => s + Math.max(0, t.amount), 0);

    return NextResponse.json({
      data: {
        eligible: Boolean(eligible),
        kind: eligible?.kind ?? null,
        displayName: eligible?.displayName ?? null,
        shareHint: eligible
          ? "购券链接加 ?seller=你的用户ID，或使用下方专属码"
          : session.role === "customer"
            ? "请先在推广中心激活推广人身份"
            : session.role === "business"
              ? null
              : "当前账号不可作为卖家",
        userId: session.userId,
        stats: {
          soldCount,
          faceTotalSgd: (faceTotal / 100).toFixed(2),
          accruedCommissionSgd: (accruedCommission / 100).toFixed(2),
          paidOutCommissionSgd: (paidOut / 100).toFixed(2),
          availableSgd: ((account?.balance ?? 0) / 100).toFixed(2),
          frozenSgd: ((account?.frozenBalance ?? 0) / 100).toFixed(2),
        },
        recentSales: sold.map((v) => ({
          id: v.id,
          campaignName: v.campaign?.name,
          slug: v.campaign?.slug,
          type: v.campaign?.type,
          faceSgd: (v.amountCents / 100).toFixed(2),
          commissionSgd: (v.sellerCommissionCents / 100).toFixed(2),
          usedSgd: (v.usedCents / 100).toFixed(2),
          balanceSgd: (v.balanceCents / 100).toFixed(2),
          status: v.status,
          createdAt: v.createdAt,
        })),
        commissionTxs: (account?.transactions || []).map((t) => ({
          id: t.id,
          amountSgd: (t.amount / 100).toFixed(2),
          description: t.description,
          createdAt: t.createdAt,
          availableAt: t.availableAt,
          releasedAt: t.releasedAt,
        })),
      },
    });
  } catch (error) {
    console.error("seller me error:", error);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

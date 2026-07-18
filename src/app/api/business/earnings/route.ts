// GET /api/business/earnings — redeem income vs sales attribution for open network
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "无权操作" }, { status: 403 });
    }

    const stores = await prisma.store.findMany({
      where: { businessId: session.userId },
      select: { id: true, name: true },
    });
    const storeIds = stores.map((s) => s.id);

    const [redeemUsages, soldAsSeller, wallet] = await Promise.all([
      storeIds.length
        ? prisma.voucherUsage.findMany({
            where: { storeId: { in: storeIds } },
            orderBy: { createdAt: "desc" },
            take: 40,
            include: {
              store: { select: { name: true } },
              voucher: {
                select: {
                  id: true,
                  campaign: { select: { name: true, businessId: true } },
                },
              },
            },
          })
        : Promise.resolve([]),
      prisma.voucher.findMany({
        where: { sellerId: session.userId },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: {
          id: true,
          amountCents: true,
          paidCents: true,
          sellerCommissionCents: true,
          usedCents: true,
          balanceCents: true,
          status: true,
          createdAt: true,
          campaign: { select: { name: true, slug: true } },
        },
      }),
      prisma.tokenAccount.findUnique({
        where: { userId: session.userId },
        select: { balance: true, frozenBalance: true, totalEarned: true },
      }),
    ]);

    const redeemIncomeCents = redeemUsages.reduce((s, u) => s + u.storeIncome, 0);
    const redeemVolumeCents = redeemUsages.reduce((s, u) => s + u.amountCents, 0);
    const commissionAccrued = soldAsSeller.reduce((s, v) => s + v.sellerCommissionCents, 0);
    const soldFace = soldAsSeller.reduce((s, v) => s + v.amountCents, 0);

    // Today
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const redeemToday = redeemUsages.filter((u) => u.createdAt >= start);
    const redeemTodayIncome = redeemToday.reduce((s, u) => s + u.storeIncome, 0);

    return NextResponse.json({
      data: {
        wallet: {
          availableSgd: ((wallet?.balance ?? 0) / 100).toFixed(2),
          frozenSgd: ((wallet?.frozenBalance ?? 0) / 100).toFixed(2),
          totalEarnedSgd: ((wallet?.totalEarned ?? 0) / 100).toFixed(2),
        },
        redeem: {
          // note: list is last 40, not all-time — label as recent
          recentCount: redeemUsages.length,
          recentVolumeSgd: (redeemVolumeCents / 100).toFixed(2),
          recentIncomeSgd: (redeemIncomeCents / 100).toFixed(2),
          todayCount: redeemToday.length,
          todayIncomeSgd: (redeemTodayIncome / 100).toFixed(2),
          rows: redeemUsages.slice(0, 15).map((u) => ({
            id: u.id,
            storeName: u.store?.name,
            campaignName: u.voucher.campaign?.name,
            isOwnCampaign: u.voucher.campaign?.businessId === session.userId,
            amountSgd: (u.amountCents / 100).toFixed(2),
            incomeSgd: (u.storeIncome / 100).toFixed(2),
            feeSgd: (u.feeCents / 100).toFixed(2),
            createdAt: u.createdAt,
          })),
        },
        sales: {
          count: soldAsSeller.length,
          faceSgd: (soldFace / 100).toFixed(2),
          commissionAccruedSgd: (commissionAccrued / 100).toFixed(2),
          rows: soldAsSeller.slice(0, 15).map((v) => ({
            id: v.id,
            campaignName: v.campaign?.name,
            faceSgd: (v.amountCents / 100).toFixed(2),
            commissionSgd: (v.sellerCommissionCents / 100).toFixed(2),
            usedSgd: (v.usedCents / 100).toFixed(2),
            status: v.status,
            createdAt: v.createdAt,
          })),
        },
        note: "开放互核：接待收入=本店核销实收；售出佣金=链接/码归因后顾客消费计提",
      },
    });
  } catch (error) {
    console.error("business earnings error:", error);
    return NextResponse.json({ error: "加载失败" }, { status: 500 });
  }
}

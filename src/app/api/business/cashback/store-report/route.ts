// GET /api/business/cashback/store-report — 门店级发放 vs 核销对账
//
// 连锁落地的关键阻力：A 店发的额度在 B 店核销，B 店营业额被摊薄，店长会抵制。
// 品牌统一钱包下这是内部转移，无需托管池，但必须能看见谁发谁核。
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const businessId = session.userId;

    const { searchParams } = new URL(request.url);
    const days = Math.min(365, Math.max(1, Number(searchParams.get("days")) || 30));
    const since = new Date(Date.now() - days * 86400_000);

    const [campaign, stores] = await Promise.all([
      prisma.campaign.findFirst({
        where: { businessId, type: "cashback" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          transferPricingMode: true,
          cashbackIssuedCents: true,
          cashbackRedeemedCents: true,
        },
      }),
      prisma.store.findMany({
        where: { businessId },
        select: { id: true, name: true },
      }),
    ]);

    if (!campaign) {
      return NextResponse.json({
        data: { campaign: null, rows: [], totals: null },
      });
    }

    const storeName = new Map(stores.map((s) => [s.id, s.name]));

    // 发放侧：按发放门店聚合消费流水
    const issued = await prisma.spendRecord.groupBy({
      by: ["storeId"],
      where: { businessId, campaignId: campaign.id, status: "settled", createdAt: { gte: since } },
      _sum: { amountCents: true, cashbackCents: true, platformFeeCents: true },
      _count: { _all: true },
    });

    // 核销侧：按核销门店聚合 cashback 券的使用
    const usages = await prisma.voucherUsage.findMany({
      where: {
        createdAt: { gte: since },
        voucher: { campaignId: campaign.id, origin: "cashback" },
      },
      select: { storeId: true, amountCents: true },
    });
    const redeemedByStore = new Map<string, { cents: number; count: number }>();
    for (const u of usages) {
      const cur = redeemedByStore.get(u.storeId) || { cents: 0, count: 0 };
      cur.cents += u.amountCents;
      cur.count += 1;
      redeemedByStore.set(u.storeId, cur);
    }

    const issuedByStore = new Map(
      issued.map((r) => [
        r.storeId,
        {
          gmvCents: r._sum.amountCents ?? 0,
          cashbackCents: r._sum.cashbackCents ?? 0,
          platformFeeCents: r._sum.platformFeeCents ?? 0,
          count: r._count._all,
        },
      ])
    );

    const allStoreIds = new Set<string>([
      ...issuedByStore.keys(),
      ...redeemedByStore.keys(),
    ]);

    const rows = Array.from(allStoreIds).map((id) => {
      const iss = issuedByStore.get(id) || {
        gmvCents: 0, cashbackCents: 0, platformFeeCents: 0, count: 0,
      };
      const red = redeemedByStore.get(id) || { cents: 0, count: 0 };
      return {
        storeId: id,
        storeName: storeName.get(id) ?? "(已删除门店)",
        gmvCents: iss.gmvCents,
        spendCount: iss.count,
        issuedCents: iss.cashbackCents,
        platformFeeCents: iss.platformFeeCents,
        redeemedCents: red.cents,
        redeemCount: red.count,
        /** 正 = 本店发得多（净输出营销额度）；负 = 本店核销得多（净承接） */
        netCents: iss.cashbackCents - red.cents,
      };
    });
    rows.sort((a, b) => b.netCents - a.netCents);

    const totals = rows.reduce(
      (acc, r) => ({
        gmvCents: acc.gmvCents + r.gmvCents,
        issuedCents: acc.issuedCents + r.issuedCents,
        redeemedCents: acc.redeemedCents + r.redeemedCents,
        platformFeeCents: acc.platformFeeCents + r.platformFeeCents,
      }),
      { gmvCents: 0, issuedCents: 0, redeemedCents: 0, platformFeeCents: 0 }
    );

    return NextResponse.json({
      data: {
        campaign: {
          id: campaign.id,
          transferPricingMode: campaign.transferPricingMode,
          cashbackIssuedCents: campaign.cashbackIssuedCents,
          cashbackRedeemedCents: campaign.cashbackRedeemedCents,
          outstandingCents: Math.max(
            0,
            campaign.cashbackIssuedCents - campaign.cashbackRedeemedCents
          ),
        },
        days,
        rows,
        totals,
      },
    });
  } catch (error) {
    console.error("cashback store-report error:", error);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

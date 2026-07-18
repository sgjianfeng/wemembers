// GET /api/seller/campaigns — active campaigns seller can promote (with share URL)
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
    if (!eligible) {
      return NextResponse.json(
        { error: "无卖家资格，请先激活推广人或使用商家账号" },
        { status: 403 }
      );
    }

    const now = new Date();
    // Own campaigns always; plus joinable marketplace active draws
    const campaigns = await prisma.campaign.findMany({
      where: {
        status: "active",
        endDate: { gt: now },
        type: { in: ["lucky_draw_v2", "voucher_sale"] },
        slug: { not: null },
        OR: [
          { businessId: session.userId },
          { joinable: true },
          // partners where I'm listed
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        color: true,
        endDate: true,
        businessId: true,
        business: { select: { businessName: true } },
      },
      orderBy: { endDate: "asc" },
      take: 40,
    });

    return NextResponse.json({
      data: {
        sellerId: session.userId,
        kind: eligible.kind,
        campaigns: campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          type: c.type,
          color: c.color,
          endDate: c.endDate,
          businessName: c.business?.businessName || "",
          isOwn: c.businessId === session.userId,
          path: `/voucher/${c.slug}?seller=${session.userId}`,
        })),
      },
    });
  } catch (error) {
    console.error("seller campaigns error:", error);
    return NextResponse.json({ error: "加载失败" }, { status: 500 });
  }
}

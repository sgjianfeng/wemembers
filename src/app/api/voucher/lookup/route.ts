// GET /api/voucher/lookup?id= — business/staff look up prepaid voucher for redeem
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "business" && session.role !== "staff")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ error: "请输入券 ID" }, { status: 400 });
    }

    const voucher = await prisma.voucher.findUnique({
      where: { id },
      include: {
        campaign: { select: { name: true, slug: true, budgetPercent: true, type: true } },
        customer: { select: { displayName: true, phone: true } },
      },
    });

    if (!voucher) {
      return NextResponse.json({ error: "未找到该券" }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        id: voucher.id,
        status: voucher.status,
        amountSgd: (voucher.amountCents / 100).toFixed(2),
        balanceSgd: (voucher.balanceCents / 100).toFixed(2),
        balanceCents: voucher.balanceCents,
        usedSgd: (voucher.usedCents / 100).toFixed(2),
        tier: voucher.tier,
        budgetPercent: voucher.campaign?.budgetPercent ?? 20,
        campaignName: voucher.campaign?.name || "",
        campaignSlug: voucher.campaign?.slug || "",
        customerName: voucher.customer?.displayName || "",
        customerPhone: voucher.customer?.phone
          ? `${voucher.customer.phone.slice(0, 4)}****${voucher.customer.phone.slice(-2)}`
          : "",
      },
    });
  } catch (error) {
    console.error("voucher lookup error:", error);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

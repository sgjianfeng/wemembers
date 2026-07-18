// GET /api/campaign/qr?slug=xxx — public campaign buy-page QR (print for counter)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateQrCodeSvg } from "@/lib/qr";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  const size = Math.min(parseInt(searchParams.get("size") || "280", 10) || 280, 600);

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findFirst({
    where: {
      slug,
      type: { in: ["lucky_draw_v2", "voucher_sale"] },
    },
    select: { id: true, businessId: true, status: true },
  });

  if (!campaign) {
    return NextResponse.json({ error: "活动不存在" }, { status: 404 });
  }

  // Owners can print draft; public only active
  const session = await getSession();
  const isOwner = session?.role === "business" && session.userId === campaign.businessId;
  if (campaign.status !== "active" && !isOwner) {
    return NextResponse.json({ error: "活动未开始" }, { status: 404 });
  }

  const origin = request.nextUrl.origin;
  const seller = searchParams.get("seller");
  let url = `${origin}/voucher/${encodeURIComponent(slug)}`;
  if (seller) url += `?seller=${encodeURIComponent(seller)}`;

  const svg = await generateQrCodeSvg(url, size);
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

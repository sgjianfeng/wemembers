// GET /api/campaign/qr?slug=xxx&seller=&size=&format=svg|png&download=1
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateQrCodePng, generateQrCodeSvg } from "@/lib/qr";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  const size = Math.min(
    parseInt(searchParams.get("size") || "280", 10) || 280,
    1024
  );
  const format = (searchParams.get("format") || "svg").toLowerCase();
  const download = searchParams.get("download") === "1";

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findFirst({
    where: {
      slug,
      type: { in: ["lucky_draw_v2", "voucher_sale"] },
    },
    select: { id: true, businessId: true, status: true, name: true },
  });

  if (!campaign) {
    return NextResponse.json({ error: "活动不存在" }, { status: 404 });
  }

  const session = await getSession();
  const isOwner =
    session?.role === "business" && session.userId === campaign.businessId;
  if (campaign.status !== "active" && !isOwner) {
    return NextResponse.json({ error: "活动未开始" }, { status: 404 });
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const seller = searchParams.get("seller");
  let url = `${origin}/voucher/${encodeURIComponent(slug)}`;
  if (seller) url += `?seller=${encodeURIComponent(seller)}`;

  const safeName = (campaign.name || "campaign")
    .replace(/[^\w\u4e00-\u9fff-]+/g, "-")
    .slice(0, 32);

  if (format === "png") {
    const png = await generateQrCodePng(url, Math.max(size, 256));
    const headers: Record<string, string> = {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=300",
    };
    if (download) {
      headers["Content-Disposition"] =
        `attachment; filename="${safeName}-qr.png"`;
    }
    return new NextResponse(new Uint8Array(png), { headers });
  }

  const svg = await generateQrCodeSvg(url, size);
  const headers: Record<string, string> = {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "public, max-age=600",
  };
  if (download) {
    headers["Content-Disposition"] =
      `attachment; filename="${safeName}-qr.svg"`;
  }
  return new NextResponse(svg, { headers });
}

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

  // 活动广告/台卡：任意活动类型（含 holiday 满赠）；不再限 voucher_sale / lucky_draw_v2
  // spendGet=1 是新参数；ndp=1 已印在旧二维码链接里，继续认
  const forceSpendGet =
    searchParams.get("spendGet") === "1" ||
    searchParams.get("spend_get") === "1" ||
    searchParams.get("ndp") === "1";
  const campaign = await prisma.campaign.findFirst({
    where: {
      slug,
      role: { not: "product_mirror" },
    },
    select: {
      id: true,
      businessId: true,
      status: true,
      name: true,
      type: true,
      tags: true,
    },
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
  const from = searchParams.get("from") === "counter" ? "counter" : "table";
  const { isSpendGetCampaign } = await import("@/lib/spend-and-get");
  const isSpendGetLanding =
    forceSpendGet || isSpendGetCampaign(campaign.type, campaign.tags);

  let url: string;
  if (isSpendGetLanding) {
    url = `${origin}/spend-get/${encodeURIComponent(slug)}?from=${from}`;
    if (seller) url += `&seller=${encodeURIComponent(seller)}`;
  } else {
    url = `${origin}/voucher/${encodeURIComponent(slug)}`;
    if (seller) url += `?seller=${encodeURIComponent(seller)}`;
  }

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

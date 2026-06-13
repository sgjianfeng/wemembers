import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateQrCodeSvg } from "@/lib/qr";

// GET /api/shop/qr — 获取商家店铺二维码 SVG
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { businessSlug: true, businessName: true },
  });

  if (!user?.businessSlug) {
    return NextResponse.json({ error: "店铺尚未设置" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const size = parseInt(searchParams.get("size") || "200");

  const origin = request.nextUrl.origin;
  const shopUrl = `${origin}/shop/${user.businessSlug}`;
  const svg = await generateQrCodeSvg(shopUrl, Math.min(size, 600));

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

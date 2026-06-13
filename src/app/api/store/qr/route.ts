import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateQrCodeSvg } from "@/lib/qr";

// GET /api/store/qr — 获取门店二维码 SVG
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  let storeSlug: string | null = null;

  if (session.role === "staff" && session.storeId) {
    const store = await prisma.store.findUnique({
      where: { id: session.storeId },
      select: { slug: true },
    });
    storeSlug = store?.slug || null;
  } else {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");
    if (storeId) {
      const store = await prisma.store.findUnique({
        where: { id: storeId, businessId: session.userId },
        select: { slug: true },
      });
      storeSlug = store?.slug || null;
    } else {
      // 取该公司的第一个门店
      const store = await prisma.store.findFirst({
        where: { businessId: session.userId },
        orderBy: { createdAt: "asc" },
        select: { slug: true },
      });
      storeSlug = store?.slug || null;
    }
  }

  if (!storeSlug)
    return NextResponse.json({ error: "门店不存在" }, { status: 404 });

  const size = parseInt(
    new URL(request.url).searchParams.get("size") || "200"
  );
  const origin = request.nextUrl.origin;
  const svg = await generateQrCodeSvg(
    `${origin}/store/${storeSlug}`,
    Math.min(size, 600)
  );

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

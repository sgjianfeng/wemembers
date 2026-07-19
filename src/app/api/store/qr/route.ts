import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateQrCodePng, generateQrCodeSvg } from "@/lib/qr";

// GET /api/store/qr?storeId=&size=&format=svg|png&download=1
// 门店顾客页二维码（SVG 预览 / PNG 下载）
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const size = Math.min(
    parseInt(searchParams.get("size") || "200", 10) || 200,
    1024
  );
  const format = (searchParams.get("format") || "svg").toLowerCase();
  const download = searchParams.get("download") === "1";

  type StoreRow = {
    id: string;
    name: string;
    slug: string;
    business: { businessSlug: string | null; businessName: string | null };
  };

  let store: StoreRow | null = null;

  if (session.role === "staff" && session.storeId) {
    store = await prisma.store.findUnique({
      where: { id: session.storeId },
      select: {
        id: true,
        name: true,
        slug: true,
        business: { select: { businessSlug: true, businessName: true } },
      },
    });
  } else {
    const storeId = searchParams.get("storeId");
    if (storeId) {
      store = await prisma.store.findFirst({
        where: { id: storeId, businessId: session.userId },
        select: {
          id: true,
          name: true,
          slug: true,
          business: { select: { businessSlug: true, businessName: true } },
        },
      });
    } else {
      store = await prisma.store.findFirst({
        where: { businessId: session.userId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          business: { select: { businessSlug: true, businessName: true } },
        },
      });
    }
  }

  if (!store) {
    return NextResponse.json({ error: "门店不存在" }, { status: 404 });
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const targetUrl = store.business.businessSlug
    ? `${origin}/shop/${store.business.businessSlug}/${store.slug}`
    : `${origin}/store/${store.slug}`;

  const safeName = (store.name || "store")
    .replace(/[^\w\u4e00-\u9fff-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);

  if (format === "png") {
    const png = await generateQrCodePng(targetUrl, Math.max(size, 256));
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

  const svg = await generateQrCodeSvg(targetUrl, size);
  const headers: Record<string, string> = {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "private, max-age=300",
  };
  if (download) {
    headers["Content-Disposition"] =
      `attachment; filename="${safeName}-qr.svg"`;
  }
  return new NextResponse(svg, { headers });
}

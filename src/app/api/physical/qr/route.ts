import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateQrCodePng, generateQrCodeSvg } from "@/lib/qr";
import { normalizePhysicalCode } from "@/lib/physical-tickets";

// GET /api/physical/qr?code=&size=&format=
// 印刷页：已登录商家可读自家码；公开 claim URL 的 QR 也可在有 session 时生成
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("code") || "";
  const code = normalizePhysicalCode(raw);
  const size = Math.min(parseInt(searchParams.get("size") || "200", 10) || 200, 600);
  const format = (searchParams.get("format") || "png").toLowerCase();

  if (!code) {
    return NextResponse.json({ error: "缺少 code" }, { status: 400 });
  }

  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const ticket = await prisma.physicalTicket.findUnique({
    where: { code },
    include: {
      batch: { select: { businessId: true } },
      store: { select: { businessId: true } },
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "码不存在" }, { status: 404 });
  }

  let businessId = session.userId;
  if (session.role === "staff") {
    if (!session.storeId) {
      return NextResponse.json({ error: "无权" }, { status: 403 });
    }
    const st = await prisma.store.findUnique({
      where: { id: session.storeId },
      select: { businessId: true },
    });
    businessId = st?.businessId || "";
  }

  if (ticket.batch.businessId !== businessId) {
    return NextResponse.json({ error: "无权" }, { status: 403 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const url = `${origin}/c/${encodeURIComponent(code)}`;

  if (format === "svg") {
    const svg = await generateQrCodeSvg(url, size);
    return new NextResponse(svg, {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=300" },
    });
  }

  const png = await generateQrCodePng(url, size);
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=300",
    },
  });
}

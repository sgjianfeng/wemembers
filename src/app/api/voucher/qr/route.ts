// GET /api/voucher/qr?id= — customer-owned voucher QR for in-store redeem
// Payload: wmv:{voucherId}
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateQrCodeSvg } from "@/lib/qr";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "缺少券 ID" }, { status: 400 });
  }

  const size = Math.min(
    parseInt(new URL(request.url).searchParams.get("size") || "240", 10) || 240,
    600
  );

  // Customer: own voucher. Business/staff: any active voucher (for reprint/help)
  const voucher =
    session.role === "customer"
      ? await prisma.voucher.findFirst({
          where: { id, customerId: session.userId, status: "active" },
          select: { id: true },
        })
      : session.role === "business" || session.role === "staff"
        ? await prisma.voucher.findFirst({
            where: { id, status: "active" },
            select: { id: true },
          })
        : null;

  if (!voucher) {
    return NextResponse.json({ error: "券不可用" }, { status: 404 });
  }

  const payload = `wmv:${voucher.id}`;
  const svg = await generateQrCodeSvg(payload, size);
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, max-age=60",
    },
  });
}

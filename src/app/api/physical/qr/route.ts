import { NextRequest, NextResponse } from "next/server";
import { generateQrCodePng, generateQrCodeSvg } from "@/lib/qr";
import { normalizePhysicalCode } from "@/lib/physical-tickets";
import { prisma } from "@/lib/db";

/**
 * GET /api/physical/qr?code=&size=&format=
 *
 * 公开可读：只生成「扫码绑定」URL 的 QR，不返回敏感业务数据。
 * 有码即可绑券，码本身即凭证；QR 图不额外泄露。
 * （此前要求 business 登录 → <img> 在部分场景 403，预览空白）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("code") || "";
    const code = normalizePhysicalCode(raw);
    const size = Math.min(
      Math.max(parseInt(searchParams.get("size") || "200", 10) || 200, 64),
      600
    );
    const format = (searchParams.get("format") || "png").toLowerCase();

    if (!code) {
      return NextResponse.json({ error: "缺少 code" }, { status: 400 });
    }

    // 确认码存在（防止乱扫生成垃圾图，但不要求登录）
    const ticket = await prisma.physicalTicket.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!ticket) {
      return NextResponse.json({ error: "码不存在" }, { status: 404 });
    }

    const envOrigin = (process.env.NEXT_PUBLIC_APP_URL || "").replace(
      /\/$/,
      ""
    );
    const xfHost = request.headers.get("x-forwarded-host");
    const xfProto =
      request.headers.get("x-forwarded-proto") === "http" ? "http" : "https";
    const origin =
      envOrigin ||
      (xfHost ? `${xfProto}://${xfHost}` : request.nextUrl.origin);

    const url = `${origin.replace(/\/$/, "")}/c/${encodeURIComponent(code)}`;

    if (format === "svg") {
      const svg = await generateQrCodeSvg(url, size);
      return new NextResponse(svg, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=600",
        },
      });
    }

    const png = await generateQrCodePng(url, size);
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=600",
      },
    });
  } catch (e) {
    console.error("physical qr error:", e);
    return NextResponse.json({ error: "QR 生成失败" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";

// POST /api/auth/logout — 清除登录 Cookie（前端主动退出）
export async function POST() {
  try {
    await clearSession();
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("logout error:", error);
    return NextResponse.json({ error: "退出失败" }, { status: 500 });
  }
}

/**
 * GET /api/auth/logout?next=/auth/login
 * 用于服务端 redirect：JWT 仍有效但用户已删除（清库）时，
 * 在 Route Handler 里清 cookie，打断 login ↔ dashboard 死循环。
 */
export async function GET(request: NextRequest) {
  try {
    await clearSession();
  } catch (error) {
    console.error("logout GET error:", error);
  }
  const next = request.nextUrl.searchParams.get("next") || "/auth/login";
  // 只允许站内相对路径，防止 open redirect
  const safe =
    next.startsWith("/") && !next.startsWith("//") ? next : "/auth/login";
  return NextResponse.redirect(new URL(safe, request.url));
}

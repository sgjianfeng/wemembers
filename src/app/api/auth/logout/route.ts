import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";

// POST /api/auth/logout — 清除登录 Cookie
export async function POST() {
  try {
    await clearSession();
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("logout error:", error);
    return NextResponse.json({ error: "退出失败" }, { status: 500 });
  }
}

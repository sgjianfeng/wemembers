import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

const PUBLIC_STARTS = ["/shop", "/coupons", "/store", "/auth", "/api/stripe", "/draw"];

const STAFF_BLOCKED = [
  "/business/coupons",
  "/business/campaigns",
  "/business/stores",
  "/business/settings",
  "/business/tokens",
  "/business/members/config",
  "/business/lucky-draw",
  "/business/partners",
  "/business/settlements",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 静态资源和 API 放行
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/favicon.ico")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("gwm_token")?.value;
  let payload: { userId: string; role: string; storeId?: string } | null = null;

  if (token) {
    payload = await verifyToken(token);
  }

  // 公开路由
  if (pathname === "/" || PUBLIC_STARTS.some((r) => pathname.startsWith(r))) {
    if (pathname.startsWith("/auth/") && payload) {
      const map: Record<string, string> = {
        admin: "/admin",
        business: "/business",
        customer: "/home",
        staff: "/business",
      };
      return NextResponse.redirect(
        new URL(map[payload.role] || "/home", request.url)
      );
    }
    return NextResponse.next();
  }

  // 未登录
  if (!payload) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const { role } = payload;

  // Admin
  if (pathname.startsWith("/admin/") && role !== "admin") {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  // Business 区域
  if (pathname.startsWith("/business/")) {
    if (role !== "business" && role !== "staff") {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }
    // Staff 不能访问特定页面
    if (
      role === "staff" &&
      STAFF_BLOCKED.some((r) => pathname.startsWith(r))
    ) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // Customer 路由
  const customerRoutes = [
    "/home", "/wallet", "/card", "/profile", "/my-tokens", "/redeem",
  ];
  if (
    customerRoutes.some((r) => pathname.startsWith(r)) &&
    role !== "customer"
  ) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|next.svg|vercel.svg|.*\\.(?:png|jpg|jpeg|gif|svg|ico)$).*)",
  ],
};

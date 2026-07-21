import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

const PUBLIC_STARTS = [
  "/shop",
  "/coupons",
  "/store",
  "/auth",
  "/api/stripe",
  "/for-business",
  "/voucher",
  "/draw", // legacy V1 draw links redirect to /voucher
  "/p",
  "/seller",
  "/promoter",
  "/c", // 实体券扫码绑定
];

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
  "/business/physical",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 静态资源和 API 放行（含 PWA manifest，避免被踢到 login 形成异常请求）
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/uploads/") ||
    pathname === "/favicon.ico" ||
    pathname === "/site.webmanifest" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
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

  const roleHome = (r: string) => {
    if (r === "admin") return "/admin";
    if (r === "business" || r === "staff") return "/business";
    return "/home";
  };

  // 页面越权：重定向到本角色首页（不要 JSON 403 白屏）
  const denyPage = () =>
    NextResponse.redirect(new URL(roleHome(role), request.url));

  // Admin
  if (
    (pathname === "/admin" || pathname.startsWith("/admin/")) &&
    role !== "admin"
  ) {
    return denyPage();
  }

  // Business 区域（含 /business 本体，不仅 /business/）
  if (pathname === "/business" || pathname.startsWith("/business/")) {
    if (role !== "business" && role !== "staff") {
      return denyPage();
    }
    // Staff 不能访问特定页面
    if (
      role === "staff" &&
      STAFF_BLOCKED.some((r) => pathname === r || pathname.startsWith(r + "/"))
    ) {
      return NextResponse.redirect(new URL("/business", request.url));
    }
    return NextResponse.next();
  }

  // Customer 路由
  const customerRoutes = [
    "/home",
    "/wallet",
    "/card",
    "/profile",
    "/my-tokens",
    "/redeem",
    "/balance",
    "/discover",
  ];
  if (
    customerRoutes.some((r) => pathname === r || pathname.startsWith(r + "/")) &&
    role !== "customer"
  ) {
    return denyPage();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|next.svg|vercel.svg|.*\\.(?:png|jpg|jpeg|gif|svg|ico)$).*)",
  ],
};

import type { NextRequest } from "next/server";

/**
 * 用户可见的绝对源（用于 Location 重定向）。
 * 禁止落到 0.0.0.0 / 127.0.0.1 — 生产 PM2 常设 HOSTNAME=0.0.0.0 监听，
 * 若用 request.url 拼跳转，Safari 会报 “Not allowed to use restricted network port”。
 */
export function publicOrigin(request?: NextRequest | Request | null): string {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (fromEnv && /^https?:\/\//i.test(fromEnv) && !isLoopbackUrl(fromEnv)) {
    return fromEnv;
  }

  if (request) {
    const xfHost = (
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      ""
    )
      .split(",")[0]
      .trim();
    const xfProto = (
      request.headers.get("x-forwarded-proto") || "https"
    )
      .split(",")[0]
      .trim()
      .toLowerCase();
    if (xfHost && !isLoopbackHost(xfHost)) {
      const proto = xfProto === "http" ? "http" : "https";
      return `${proto}://${xfHost}`;
    }
  }

  return fromEnv && /^https?:\/\//i.test(fromEnv)
    ? fromEnv
    : "https://wemembers.store";
}

function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().split(":")[0];
  return (
    h === "0.0.0.0" ||
    h === "127.0.0.1" ||
    h === "localhost" ||
    h === "[::]" ||
    h === "[::1]" ||
    h === "::" ||
    h === "::1"
  );
}

function isLoopbackUrl(url: string): boolean {
  try {
    return isLoopbackHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** 站内相对路径 → 安全绝对 URL（open-redirect 仍由调用方校验 path） */
export function publicAbsoluteUrl(
  pathAndQuery: string,
  request?: NextRequest | Request | null
): URL {
  const path =
    pathAndQuery.startsWith("/") && !pathAndQuery.startsWith("//")
      ? pathAndQuery
      : `/${pathAndQuery.replace(/^\/+/, "")}`;
  return new URL(path, `${publicOrigin(request)}/`);
}

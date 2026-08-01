import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-in-production-min-32-chars!!"
);

const COOKIE_NAME = "gwm_token";
const DAY = 60 * 60 * 24;

export type JWTPayload = {
  userId: string;
  role: "admin" | "business" | "customer" | "staff";
  storeId?: string;
};

export type AuthRole = JWTPayload["role"];

/**
 * 是否给 Cookie 加 Secure：
 * - COOKIE_SECURE=true/false 显式覆盖
 * - 开发环境默认 false（localhost HTTP 否则存不上）
 * - 生产且 NEXT_PUBLIC_APP_URL 为 http:// 时 false
 * - 其余生产默认 true（https://wemembers.store）
 */
export function shouldUseSecureCookies(): boolean {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  if (process.env.NODE_ENV !== "production") return false;
  const app = process.env.NEXT_PUBLIC_APP_URL || "";
  if (app.startsWith("http://")) return false;
  return true;
}

/**
 * 按角色控制会话时长（安全 vs 便利）：
 * - 客户：默认 90 天，勾选「记住」→ 365 天
 * - 商家/店员：默认 30 天，勾选「记住」→ 90 天
 * - 管理员：固定 7 天（仅验证码，不可拉长）
 */
export function getSessionDuration(
  role: AuthRole,
  rememberMe = false
): { maxAgeSec: number; expiresIn: string; labelDays: number } {
  if (role === "admin") {
    return { maxAgeSec: 7 * DAY, expiresIn: "7d", labelDays: 7 };
  }
  if (role === "business" || role === "staff") {
    if (rememberMe) {
      return { maxAgeSec: 90 * DAY, expiresIn: "90d", labelDays: 90 };
    }
    return { maxAgeSec: 30 * DAY, expiresIn: "30d", labelDays: 30 };
  }
  // customer
  if (rememberMe) {
    return { maxAgeSec: 365 * DAY, expiresIn: "365d", labelDays: 365 };
  }
  return { maxAgeSec: 90 * DAY, expiresIn: "90d", labelDays: 90 };
}

export async function signToken(
  payload: JWTPayload,
  expiresIn: string | number | Date = "7d"
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

/** 校验并返回 payload + 过期时间（秒） */
export async function verifyTokenDetailed(
  token: string
): Promise<{ payload: JWTPayload; exp: number | null } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const exp =
      typeof payload.exp === "number" ? payload.exp : null;
    return { payload: payload as unknown as JWTPayload, exp };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function setSession(
  token: string,
  maxAgeSec = 7 * DAY
): Promise<void> {
  const cookieStore = await cookies();
  const expires = new Date(Date.now() + maxAgeSec * 1000);
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSec,
    expires, // 部分 WebView / 旧浏览器对仅 maxAge 不稳
  });
}

/** 登录成功后按角色签发 JWT + Cookie */
export async function issueSession(
  payload: JWTPayload,
  rememberMe = false
): Promise<{ maxAgeSec: number; expiresIn: string; labelDays: number }> {
  const duration = getSessionDuration(payload.role, rememberMe);
  // 用绝对 Date，避免 jose 对超长 timespan 解析差异
  const expiresAt = new Date(Date.now() + duration.maxAgeSec * 1000);
  const token = await signToken(payload, expiresAt);
  await setSession(token, duration.maxAgeSec);
  return duration;
}

/**
 * 活跃续期：剩余不足 14 天时，按「记住我」最长档续签，减少「勾了记住却很快掉线」
 */
export async function maybeRefreshSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const detailed = await verifyTokenDetailed(raw);
  if (!detailed) return null;

  const { payload, exp } = detailed;
  if (exp == null) return payload;

  const remaining = exp - Math.floor(Date.now() / 1000);
  // 剩余还多：不动
  if (remaining > 14 * DAY) return payload;

  // 管理员不自动拉长
  if (payload.role === "admin") return payload;

  try {
    // 活跃用户按「记住」最长档续期
    await issueSession(payload, true);
  } catch (e) {
    console.error("maybeRefreshSession error:", e);
  }
  return payload;
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}

// 简单的 SHA-256 密码哈希 (MVP, 生产环境用 bcrypt)
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "wemembers-salt");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return (await hashPassword(password)) === hash;
}

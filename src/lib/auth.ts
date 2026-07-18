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
 * 按角色控制会话时长（安全 vs 便利）：
 * - 客户：默认 30 天，勾选「记住」→ 180 天
 * - 商家/店员：默认 7 天，勾选「记住」→ 30 天
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
      return { maxAgeSec: 30 * DAY, expiresIn: "30d", labelDays: 30 };
    }
    return { maxAgeSec: 7 * DAY, expiresIn: "7d", labelDays: 7 };
  }
  // customer
  if (rememberMe) {
    return { maxAgeSec: 180 * DAY, expiresIn: "180d", labelDays: 180 };
  }
  return { maxAgeSec: 30 * DAY, expiresIn: "30d", labelDays: 30 };
}

export async function signToken(
  payload: JWTPayload,
  expiresIn = "7d"
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
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSec,
  });
}

/** 登录成功后按角色签发 JWT + Cookie */
export async function issueSession(
  payload: JWTPayload,
  rememberMe = false
): Promise<{ maxAgeSec: number; expiresIn: string; labelDays: number }> {
  const duration = getSessionDuration(payload.role, rememberMe);
  const token = await signToken(payload, duration.expiresIn);
  await setSession(token, duration.maxAgeSec);
  return duration;
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
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

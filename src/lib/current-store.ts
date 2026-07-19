import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const STORE_COOKIE = "gwm_store_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180d

export type StoreBrief = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
};

/** 读取 cookie 中的当前门店 id（服务端） */
export async function getStoreCookieId(): Promise<string | null> {
  const c = await cookies();
  return c.get(STORE_COOKIE)?.value || null;
}

export async function setStoreCookie(storeId: string): Promise<void> {
  const c = await cookies();
  c.set(STORE_COOKIE, storeId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

/**
 * 解析企业当前门店：cookie 优先，否则第一家店。
 * 校验 store 必须属于 businessId。
 */
export async function resolveBusinessCurrentStore(
  businessId: string,
  preferredStoreId?: string | null
): Promise<{ stores: StoreBrief[]; current: StoreBrief | null }> {
  const stores = await prisma.store.findMany({
    where: { businessId },
    select: { id: true, name: true, slug: true, address: true },
    orderBy: { createdAt: "asc" },
  });

  if (stores.length === 0) {
    return { stores: [], current: null };
  }

  const cookieId = preferredStoreId || (await getStoreCookieId());
  const current =
    stores.find((s) => s.id === cookieId) || stores[0] || null;

  return { stores, current };
}

/** 店员：固定本店 */
export async function resolveStaffStore(
  storeId: string | undefined
): Promise<StoreBrief | null> {
  if (!storeId) return null;
  return prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, slug: true, address: true },
  });
}

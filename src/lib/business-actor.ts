/**
 * 企业主 / 店员 统一解析：businessId + 可选本店 storeId
 */
import { prisma } from "@/lib/db";

export type BusinessActor = {
  userId: string;
  role: "business" | "staff";
  businessId: string;
  storeId: string | null;
};

export async function resolveBusinessActor(session: {
  userId: string;
  role: string;
  storeId?: string;
} | null): Promise<BusinessActor | null> {
  if (!session) return null;
  if (session.role === "business") {
    return {
      userId: session.userId,
      role: "business",
      businessId: session.userId,
      storeId: null,
    };
  }
  if (session.role === "staff") {
    if (!session.storeId) return null;
    const store = await prisma.store.findUnique({
      where: { id: session.storeId },
      select: { id: true, businessId: true },
    });
    if (!store) return null;
    return {
      userId: session.userId,
      role: "staff",
      businessId: store.businessId,
      storeId: store.id,
    };
  }
  return null;
}

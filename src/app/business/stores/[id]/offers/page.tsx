import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";

/**
 * 本店活动券 → 统一跳到 /business/offers?storeId=
 * （店员不可进 /business/stores/* 列表配置页，但企业主可从门店详情进入）
 */
export default async function StoreOffersRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    redirect("/auth/login");
  }

  const { id } = await params;
  const store = await prisma.store.findFirst({
    where: { id, businessId: session.userId },
    select: { id: true },
  });
  if (!store) notFound();

  redirect(`/business/offers?storeId=${encodeURIComponent(store.id)}`);
}

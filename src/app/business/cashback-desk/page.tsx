import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { CashbackDeskClient } from "./CashbackDeskClient";
import { parseCashbackRules } from "@/lib/cashback";

/**
 * 消费返收银台（店员 / 企业主统一）
 * 店员用 session 门店；企业主可 ?storeId= 指定
 *
 * 流程：店员输金额 → 出码 → 顾客扫码领取
 * 金额由店员填 = 可信；顾客只负责扫码 = 店员负担最小
 */
export default async function CashbackDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    redirect("/auth/login");
  }

  const sp = await searchParams;
  let storeId = sp.storeId?.trim() || null;
  let businessId = session.userId;

  if (session.role === "staff") {
    if (!session.storeId) redirect("/business");
    storeId = session.storeId;
    const st = await prisma.store.findUnique({
      where: { id: session.storeId },
      select: { businessId: true },
    });
    if (!st) redirect("/business");
    businessId = st.businessId;
  }

  const stores = await prisma.store.findMany({
    where: { businessId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (!storeId && stores.length > 0) storeId = stores[0].id;

  const campaign = await prisma.campaign.findFirst({
    where: { businessId, type: "cashback" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, status: true, rulesSnapshot: true },
  });

  const rules = parseCashbackRules(campaign?.rulesSnapshot ?? null);

  return (
    <CashbackDeskClient
      role={session.role}
      stores={stores}
      initialStoreId={storeId}
      campaignActive={campaign?.status === "active"}
      campaignName={campaign?.name ?? null}
      cashbackPercent={rules.cashbackPercent}
      drawPercent={rules.drawPercent}
    />
  );
}

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { NdpDeskClient } from "./NdpDeskClient";

/**
 * 本店国庆操作台（店员 / 企业主统一）
 * ?storeId= 必填（店员用 session 店；企业主从门店活动券带入）
 * ?campaignId= 可选
 */
export default async function NdpDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string; campaignId?: string }>;
}) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    redirect("/auth/login");
  }

  const sp = await searchParams;
  let storeId = sp.storeId?.trim() || null;
  const campaignId = sp.campaignId?.trim() || null;

  if (session.role === "staff") {
    if (!session.storeId) redirect("/business");
    storeId = session.storeId;
  }

  if (!storeId) {
    // 企业主未带门店：回活动券去选店
    redirect("/business/offers");
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, businessId: true },
  });
  if (!store) redirect("/business/offers");

  // 权限：企业主只能看自家店；店员只能看绑定店
  if (session.role === "business" && store.businessId !== session.userId) {
    redirect("/business/stores");
  }
  if (session.role === "staff" && store.id !== session.storeId) {
    redirect("/business");
  }

  const backHref = `/business/offers?storeId=${encodeURIComponent(store.id)}`;

  return (
    <NdpDeskClient
      storeId={store.id}
      storeName={store.name}
      initialCampaignId={campaignId}
      canComp={session.role === "business"}
      backHref={backHref}
    />
  );
}

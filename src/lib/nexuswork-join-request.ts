import { prisma } from "@/lib/db";

type JoinTarget = { conversationCode: string; operationsRoleCode: string; financeRoleCode: string };

function targetFor(businessId: string): JoinTarget | null {
  const raw = process.env.NEXUSWORK_JOIN_TARGETS;
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Record<string, JoinTarget>;
  return parsed[businessId] ?? null;
}

export async function pushJoinRequestToNexuswork(requestId: string): Promise<string | null> {
  const request = await prisma.campaignJoinRequest.findUnique({
    where: { id: requestId },
    include: {
      store: { select: { name: true, business: { select: { businessName: true, displayName: true } } } },
      campaign: { select: { id: true, name: true, businessId: true, minTotalPercent: true } },
    },
  });
  if (!request || request.nwTaskCardId) return request?.nwTaskCardId ?? null;
  const target = targetFor(request.campaign.businessId);
  if (!target) return null;
  const token = process.env.NEXUSWORK_LEDGER_TOKEN;
  if (!token) throw new Error("缺少 NEXUSWORK_LEDGER_TOKEN");
  const baseUrl = process.env.NEXUSWORK_URL ?? "https://work.wemembers.store";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/integrations/wemembers/join-request`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      requestId: request.id, conversationCode: target.conversationCode,
      campaignId: request.campaign.id, campaignName: request.campaign.name,
      storeId: request.storeId, storeName: request.store.name,
      businessName: request.store.business.businessName ?? request.store.business.displayName ?? "申请企业",
      feeSummary: request.campaign.minTotalPercent == null ? "按活动规则" : `最低总费率 ${request.campaign.minTotalPercent}%`,
      message: request.message, operationsRoleCode: target.operationsRoleCode, financeRoleCode: target.financeRoleCode,
    }),
  });
  const result = await response.json().catch(() => null) as { data?: { id?: string }; error?: string } | null;
  if (!response.ok || !result?.data?.id) throw new Error(`创建 nexuswork 任务卡失败：${response.status} ${result?.error ?? ""}`);
  await prisma.campaignJoinRequest.update({ where: { id: request.id }, data: { nwTaskCardId: result.data.id } });
  return result.data.id;
}

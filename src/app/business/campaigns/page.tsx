import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";

export default async function CampaignsPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const campaigns = await prisma.campaign.findMany({
    where: { businessId: session.userId },
    include: { coupons: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });

  const typeLabels: Record<string, { label: string; icon: string }> = {
    promotion: { label: "促销", icon: "🏷️" },
    seasonal: { label: "季节", icon: "🌸" },
    holiday: { label: "节日", icon: "🎉" },
    event: { label: "活动", icon: "📅" },
    launch: { label: "新品", icon: "🚀" },
  };

  const statusBadge: Record<string, { variant: "green" | "orange" | "slate"; label: string }> = {
    draft: { variant: "slate", label: "草稿" },
    active: { variant: "green", label: "进行中" },
    ended: { variant: "orange", label: "已结束" },
  };

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">活动管理</h1>
          <p className="text-xs text-slate-400 mt-0.5">批量管理代金券和推广活动</p>
        </div>
        <Link href="/business/campaigns/new" className="px-3 py-1.5 bg-[#1A6EFF] text-white text-xs rounded-full">
          + 创建活动
        </Link>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {campaigns.map((c) => {
          const ti = typeLabels[c.type] || typeLabels.promotion;
          const sb = statusBadge[c.status] || statusBadge.draft;
          const now = new Date();
          const daysLeft = Math.ceil((c.endDate.getTime() - now.getTime()) / 86400000);

          return (
            <Link key={c.id} href={`/business/campaigns/${c.id}`}>
              <Card className="hover:border-[#1A6EFF]/30 transition-colors border-l-4" style={{ borderLeftColor: c.color || "#1A6EFF" }}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{ti.icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                        <p className="text-xs text-slate-500">{ti.label} · {c.coupons.length}张券</p>
                      </div>
                    </div>
                    <Badge variant={sb.variant}>{sb.label}</Badge>
                  </div>

                  {c.description && <p className="text-xs text-slate-500 mb-2 line-clamp-1">{c.description}</p>}

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-50 rounded-lg py-2">
                      <p className="text-lg font-bold text-slate-900">{c.totalClaims}</p>
                      <p className="text-[10px] text-slate-400">领取</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg py-2">
                      <p className="text-lg font-bold text-slate-900">{c.totalRedemptions}</p>
                      <p className="text-[10px] text-slate-400">核销</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg py-2">
                      <p className="text-lg font-bold text-slate-900">{c.totalClaims > 0 ? Math.round((c.totalRedemptions / c.totalClaims) * 100) : 0}%</p>
                      <p className="text-[10px] text-slate-400">转化率</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2 text-[10px] text-slate-400">
                    <span>{c.startDate.toLocaleDateString("zh-CN")} ~ {c.endDate.toLocaleDateString("zh-CN")}</span>
                    {c.status === "active" && daysLeft > 0 && <span className="text-amber-500">还剩 {daysLeft} 天</span>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}

        {campaigns.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <p className="text-4xl mb-2">📅</p>
            <p className="text-sm">还没有活动</p>
            <p className="text-xs mt-1">创建活动来批量管理代金券</p>
          </div>
        )}
      </div>
    </div>
  );
}

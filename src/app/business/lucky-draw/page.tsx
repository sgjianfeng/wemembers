import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { timeAgo } from "@/lib/utils";
import Link from "next/link";

export default async function LuckyDrawPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const campaigns = await prisma.campaign.findMany({
    where: { businessId: session.userId, type: "lucky_draw" },
    include: { prizes: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
        <div>
          <h1 className="text-lg font-semibold">🎰 抽奖活动</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            核销自动发券 · 店员可手动录入 · 一键开奖
          </p>
        </div>
        <Link
          href="/business/campaigns/new?type=lucky_draw"
          className="px-3 py-1.5 bg-[#1A6EFF] text-white text-xs rounded-full"
        >
          + 创建活动
        </Link>
      </div>

      <div className="px-4 mt-3 space-y-3">
        {campaigns.map((c) => {
          const s = c.status;
          const sBadge: Record<string, { variant: "green" | "orange" | "red" | "slate"; label: string }> = {
            draft: { variant: "slate", label: "草稿" },
            active: { variant: "green", label: "进行中" },
            ended: { variant: "red", label: "已结束" },
          };
          const sb = sBadge[s] || { variant: "slate" as const, label: s };
          const prizeCount = c.prizes.length;
          const isFuture = c.startDate > new Date();

          return (
            <Link key={c.id} href={`/business/campaigns/${c.id}`}>
              <Card className="hover:border-[#1A6EFF]/30">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">🎰</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                        <p className="text-xs text-slate-400">
                          {c.startDate.toLocaleDateString("zh-CN")} ~ {c.endDate.toLocaleDateString("zh-CN")}
                          {c.drawDate && ` · ${c.drawDate.toLocaleDateString("zh-CN")} 开奖`}
                        </p>
                      </div>
                    </div>
                    <Badge variant={sb.variant}>{sb.label}</Badge>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>🎁 {prizeCount} 奖品</span>
                    <span>👤 {c.entryCount} 参与</span>
                    {c.minSpendCents && <span>💰 满¥{c.minSpendCents / 100}获得资格</span>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}

        {campaigns.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-5xl mb-4">🎰</p>
            <p className="text-sm">还没有抽奖活动</p>
            <p className="text-xs mt-1 text-slate-300">
              创建活动后，客户核销代金券即可自动获得抽奖资格
            </p>
            <Link
              href="/business/campaigns/new?type=lucky_draw"
              className="inline-block mt-4 px-6 py-2 bg-[#1A6EFF] text-white text-sm rounded-full"
            >
              创建第一个抽奖活动
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

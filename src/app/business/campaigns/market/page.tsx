import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cookies } from "next/headers";
import Link from "next/link";
import { JoinButton } from "./JoinButton";

export default async function CampaignMarketPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const campaigns = await prisma.campaign.findMany({
    where: {
      joinable: true,
      status: "active",
      endDate: { gte: new Date() },
      businessId: { not: session.userId },
    },
    include: {
      business: { select: { businessName: true, businessSlug: true } },
      prizes: { select: { id: true, name: true, icon: true }, orderBy: { weight: "desc" }, take: 3 },
    },
    orderBy: { joinCount: "desc" },
  });

  const myStores = await prisma.store.findMany({
    where: { businessId: session.userId },
    select: { id: true },
  });
  const myStoreIds = myStores.map((s) => s.id);

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
        <div className="flex items-center gap-2">
          <Link href="/business" className="text-xs text-slate-500">← {lang === "zh" ? "返回" : "Back"}</Link>
        </div>
        <h1 className="text-lg font-semibold mt-1">
          {lang === "zh" ? "🎰 活动市场" : "🎰 Campaign Market"}
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {lang === "zh" ? "平台策划 · 一键参与 · 共享大奖池" : "Platform campaigns · Join in one tap · Shared pool"}
        </p>
      </div>

      <div className="px-4 mt-3 space-y-3">
        {campaigns.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-5xl mb-4">🎰</p>
            <p className="text-sm">{lang === "zh" ? "暂无可用活动" : "No campaigns available"}</p>
            <p className="text-xs mt-1">
              {lang === "zh" ? "平台正在筹备新活动，敬请期待" : "New campaigns coming soon"}
            </p>
          </div>
        ) : (
          campaigns.map((camp) => {
            let storeIds: string[] = [];
            try { storeIds = JSON.parse(camp.storeIds || "[]"); } catch {}
            const isJoined = myStoreIds.some((sid) => storeIds.includes(sid));
            const totalPoolSgd = ((camp.instantPoolCents || 0) / 100).toFixed(0);
            const daysLeft = Math.max(0, Math.ceil((camp.endDate.getTime() - Date.now()) / 86400000));
            const topPrize = camp.prizes[0];

            return (
              <Card key={camp.id} className={isJoined ? "border-green-200 bg-green-50/30" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 truncate">{camp.name}</span>
                        {isJoined && <Badge variant="green" size="sm">{lang === "zh" ? "已参与" : "Joined"}</Badge>}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {camp.business?.businessName || "WeMembers"}
                        {" · "}{camp.joinCount || 0} {lang === "zh" ? "家店" : "stores"}
                        {" · "}{lang === "zh" ? "奖池" : "Pool"} S${totalPoolSgd}
                      </p>
                    </div>
                    {camp.color && (
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: camp.color }} />
                    )}
                  </div>

                  {topPrize && (
                    <div className="flex items-center gap-1.5 mb-2 text-xs">
                      <span>{topPrize.icon}</span>
                      <span className="text-amber-600 font-medium">
                        {lang === "zh" ? "大奖" : "Grand"}: {topPrize.name}
                      </span>
                      {camp.prizes.length > 1 && (
                        <span className="text-slate-300">+{camp.prizes.length - 1}</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {daysLeft > 0
                        ? (lang === "zh" ? `剩余 ${daysLeft} 天` : `${daysLeft} days left`)
                        : (lang === "zh" ? "即将结束" : "Ending soon")}
                    </span>
                    {isJoined ? (
                      <span className="text-green-600 font-medium">✓ {lang === "zh" ? "已参与" : "Joined"}</span>
                    ) : (
                      <JoinButton
                        campaignId={camp.id}
                        label={lang === "zh" ? "参与" : "Join"}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { CampaignActions } from "./CampaignActions";
import { DrawButton } from "./DrawButton";
import { PrizeEditor } from "./PrizeEditor";
import { ManualEntryButton } from "./ManualEntryButton";
import { timeAgo } from "@/lib/utils";

const typeMap: Record<string, { label: string; icon: string }> = {
  promotion: { label: "促销", icon: "🏷️" },
  seasonal: { label: "季节", icon: "🌸" },
  holiday: { label: "节日", icon: "🎉" },
  event: { label: "活动", icon: "📅" },
  launch: { label: "新品", icon: "🚀" },
  lucky_draw: { label: "幸运抽奖", icon: "🎰" },
};

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, businessId: session.userId },
    include: {
      coupons: {
        include: { business: { select: { businessName: true } } },
        orderBy: { createdAt: "desc" },
      },
      prizes: { orderBy: { weight: "desc" } },
      entries: {
        take: 20,
        orderBy: { createdAt: "desc" },
        include: { customer: { select: { displayName: true, phone: true } }, store: { select: { name: true } } },
      },
    },
  });

  if (!campaign) return <div className="p-8 text-center text-slate-400">活动不存在</div>;

  const coupons = campaign.coupons;
  const totalClaims = coupons.reduce((s, c) => s + c.claimedCount, 0);
  const totalUsed = coupons.reduce((s, c) => s + c.usedCount, 0);
  const rate = totalClaims > 0 ? Math.round((totalUsed / totalClaims) * 100) : 0;
  const totalValue = (coupons.reduce((s, c) => s + c.valueCents * c.usedCount, 0) / 100).toFixed(0);
  const now = new Date();
  const daysLeft = Math.ceil((campaign.endDate.getTime() - now.getTime()) / 86400000);

  let tags: string[] = [];
  try { tags = JSON.parse(campaign.tags || "[]"); } catch {}

  const ti = typeMap[campaign.type] || typeMap.promotion;

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-4 py-4" style={{ backgroundColor: (campaign.color || "#1A6EFF") + "15" }}>
        <div className="flex items-center justify-between mb-3">
          <Link href="/business/campaigns" className="text-xs text-slate-500">← 活动列表</Link>
          <Badge variant={campaign.status === "active" ? "green" : campaign.status === "ended" ? "orange" : "slate"}>
            {campaign.status === "active" ? "进行中" : campaign.status === "ended" ? "已结束" : "草稿"}
          </Badge>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">{ti.icon}</span>
          <h1 className="text-xl font-bold text-slate-900">{campaign.name}</h1>
        </div>
        {campaign.description && <p className="text-sm text-slate-500 mt-1">{campaign.description}</p>}
        <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
          <span>{ti.label}</span>
          <span>·</span>
          <span>{campaign.startDate.toLocaleDateString("zh-CN")} ~ {campaign.endDate.toLocaleDateString("zh-CN")}</span>
          {campaign.status === "active" && daysLeft > 0 && <span className="text-amber-500 font-medium">· 还剩 {daysLeft} 天</span>}
        </div>
        {tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-2">
            {tags.map((t) => <span key={t} className="px-2 py-0.5 bg-white/60 text-slate-600 text-[10px] rounded-full">{t}</span>)}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="px-4 mt-4">
        <div className="grid grid-cols-4 gap-2">
          {[
            { v: coupons.length, l: "代金券" },
            { v: totalClaims, l: "总领取" },
            { v: totalUsed, l: "总核销" },
            { v: `${rate}%`, l: `转化率` },
          ].map((s) => (
            <Card key={s.l} className="bg-slate-50 border-0">
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-slate-900">{s.v}</p>
                <p className="text-[10px] text-slate-400">{s.l}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-center mt-2">
          <p className="text-xs text-slate-400">累计为客户节省 ¥{totalValue}</p>
        </div>
      </div>

      {/* 券列表 */}
      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900">🎫 活动代金券</h3>
          <Link href={`/business/coupons/new?campaignId=${campaign.id}`} className="text-xs text-[#1A6EFF] font-medium">
            + 添加券
          </Link>
        </div>

        {coupons.length > 0 ? (
          <div className="space-y-2">
            {coupons.map((c) => {
              const sb: Record<string, { variant: "green" | "orange" | "red" | "slate"; label: string }> = {
                published: { variant: "green", label: "进行中" },
                draft: { variant: "slate", label: "草稿" },
                paused: { variant: "orange", label: "暂停" },
                ended: { variant: "red", label: "结束" },
              };
              const s = sb[c.status] || sb.draft;
              return (
                <Link key={c.id} href={`/business/coupons/${c.id}`}>
                  <Card className="hover:border-[#1A6EFF]/30 transition-colors">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{c.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          ¥{(c.valueCents / 100).toFixed(0)} · {c.pointsRequired}⭐ · 领取{c.claimedCount}/{c.totalQuantity || "∞"} · 核销{c.usedCount}
                        </p>
                      </div>
                      <Badge variant={s.variant} size="sm">{s.label}</Badge>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 bg-slate-50 rounded-xl">
            <p className="text-3xl mb-2">🎫</p>
            <p className="text-sm text-slate-400">还没有代金券</p>
            <Link href={`/business/coupons/new?campaignId=${campaign.id}`} className="inline-block mt-3 px-4 py-1.5 bg-[#1A6EFF] text-white text-xs rounded-full">
              添加第一张券
            </Link>
          </div>
        )}
      </div>

      {/* 抽奖专区 (lucky_draw) */}
      {campaign.type === "lucky_draw" && (
        <>
          {/* 抽奖配置信息 */}
          <div className="px-4 mt-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">🎰 抽奖配置</h3>
            <Card>
              <CardContent className="p-3 space-y-1.5 text-xs">
                <Info label="消费门槛" value={campaign.minSpendCents ? `满 ¥${(campaign.minSpendCents / 100).toFixed(0)} 获得资格` : "无门槛，核销即参与"} />
                <Info label="参与上限" value={campaign.maxEntries ? `${campaign.maxEntries} 人` : "不限"} />
                <Info label="开奖方式" value={campaign.drawMethod === "weighted" ? "加权随机" : campaign.drawMethod || "加权随机"} />
                {campaign.drawDate && <Info label="计划开奖" value={campaign.drawDate.toLocaleDateString("zh-CN")} />}
                <Info label="参与人数" value={`${campaign.entryCount} 人`} />
                {campaign.budgetCents && <Info label="活动预算" value={`¥${(campaign.budgetCents / 100).toFixed(0)}`} />}
              </CardContent>
            </Card>
          </div>

          {/* 奖池 */}
          <div className="px-4 mt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900">🎁 奖池配置</h3>
              <PrizeEditor campaignId={campaign.id} currentPrizes={JSON.parse(JSON.stringify(campaign.prizes))} />
            </div>
            {campaign.prizes.length > 0 ? (
              <div className="space-y-1">
                {campaign.prizes.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-slate-50 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{p.icon}</span>
                      <div>
                        <p className="text-slate-700 font-medium">{p.name}</p>
                        <p className="text-[10px] text-slate-400">
                          权重 {p.weight} · 库存 {p.totalStock ?? "∞"} · 已发 {p.claimed}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {p.type === "cash" ? `¥${(p.valueCents / 100).toFixed(0)}` : p.type === "coupon" ? "代金券" : "实物"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-xl">还未配置奖池</p>
            )}
          </div>

          {/* 参与记录 */}
          <div className="px-4 mt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900">👤 参与记录</h3>
              <ManualEntryButton campaignId={campaign.id} />
            </div>
            {campaign.entries.length > 0 ? (
              <div className="space-y-1">
                {campaign.entries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-slate-50 text-xs">
                    <div>
                      <p className="text-slate-700">
                        {e.customer?.displayName || e.name || "未知"}
                        {e.won && e.prizeName && (
                          <span className="ml-1 text-amber-500 font-medium">🎉 {e.prizeIcon} {e.prizeName}</span>
                        )}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {e.source === "auto" ? "🤖 消费自动" : "✋ 店员录入"}
                        {e.store?.name && ` · ${e.store.name}`}
                        {" · "}{timeAgo(e.createdAt)}
                      </p>
                    </div>
                    <Badge variant={e.won ? "green" : "slate"} size="sm">
                      {e.won ? "已中奖" : "待开奖"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-xl">暂无参与记录</p>
            )}
          </div>

          {/* 开奖按钮 */}
          {campaign.status === "active" && (
            <div className="px-4 mt-5">
              <DrawButton campaignId={campaign.id} entryCount={campaign.entryCount} />
            </div>
          )}
        </>
      )}

      {/* 快速操作 */}
      {campaign.status !== "ended" && (
        <div className="px-4 mt-5 flex gap-2">
          <CampaignActions campaignId={campaign.id} currentStatus={campaign.status} />
          <Link href={`/business/coupons/new?campaignId=${campaign.id}`} className="px-4 py-2 bg-[#1A6EFF] text-white text-sm rounded-full">
            + 添加代金券
          </Link>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-900 font-medium">{value}</span>
    </div>
  );
}

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";

export default async function CampaignsPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const campaigns = await prisma.campaign.findMany({
    where: { businessId: session.userId },
    include: { coupons: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });

  const typeLabels: Record<string, { zh: string; en: string; icon: string }> = {
    promotion: { zh: "促销", en: "Promotion", icon: "🏷️" },
    seasonal: { zh: "季节", en: "Seasonal", icon: "🌸" },
    holiday: { zh: "节日", en: "Holiday", icon: "🎉" },
    event: { zh: "活动", en: "Event", icon: "📅" },
    launch: { zh: "新品", en: "Launch", icon: "🚀" },
  };

  const statusBadge: Record<string, { variant: "green" | "orange" | "slate"; zh: string; en: string }> = {
    draft: { variant: "slate", zh: "草稿", en: "Draft" },
    active: { variant: "green", zh: "进行中", en: "Active" },
    ended: { variant: "orange", zh: "已结束", en: "Ended" },
  };

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{t("business.campaigns.title", lang)}</h1>
          <p className="text-xs text-slate-400 mt-0.5">{t("business.campaigns.subtitle", lang)}</p>
        </div>
        <Link href="/business/campaigns/new" className="px-3 py-1.5 bg-[#1A6EFF] text-white text-xs rounded-full">
          + {t("business.campaigns.create", lang)}
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
                        <p className="text-xs text-slate-500">{ti[lang]} · {t("business.campaigns.couponsCount", lang, { count: c.coupons.length })}</p>
                      </div>
                    </div>
                    <Badge variant={sb.variant}>{sb[lang]}</Badge>
                  </div>

                  {c.description && <p className="text-xs text-slate-500 mb-2 line-clamp-1">{c.description}</p>}

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-50 rounded-lg py-2">
                      <p className="text-lg font-bold text-slate-900">{c.totalClaims}</p>
                      <p className="text-[10px] text-slate-400">{t("business.campaigns.claimed", lang)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg py-2">
                      <p className="text-lg font-bold text-slate-900">{c.totalRedemptions}</p>
                      <p className="text-[10px] text-slate-400">{t("business.campaigns.redeemed", lang)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg py-2">
                      <p className="text-lg font-bold text-slate-900">{c.totalClaims > 0 ? Math.round((c.totalRedemptions / c.totalClaims) * 100) : 0}%</p>
                      <p className="text-[10px] text-slate-400">{t("business.campaigns.conversionRate", lang)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2 text-[10px] text-slate-400">
                    <span>{c.startDate.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")} ~ {c.endDate.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")}</span>
                    {c.status === "active" && daysLeft > 0 && <span className="text-amber-500">{t("business.campaigns.daysLeft", lang, { days: daysLeft })}</span>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}

        {campaigns.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <p className="text-4xl mb-2">📅</p>
            <p className="text-sm">{t("business.campaigns.noCampaigns", lang)}</p>
            <p className="text-xs mt-1">{t("business.campaigns.noCampaignsHint", lang)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

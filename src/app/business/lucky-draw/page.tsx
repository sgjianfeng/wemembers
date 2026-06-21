import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { timeAgo } from "@/lib/utils";
import Link from "next/link";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";

export default async function LuckyDrawPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const campaigns = await prisma.campaign.findMany({
    where: { businessId: session.userId, type: "lucky_draw_v2" },
    include: { prizes: true },
    orderBy: { createdAt: "desc" },
  });

  const dateLocale = lang === "zh" ? "zh-CN" : "en-US";

  const statusLabels: Record<string, Record<string, string>> = {
    draft: { zh: "草稿", en: "Draft" },
    active: { zh: "进行中", en: "Active" },
    ended: { zh: "已结束", en: "Ended" },
  };

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
        <div>
          <h1 className="text-lg font-semibold">{t("business.luckyDraw.title", lang)}</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {t("business.luckyDraw.subtitle", lang)}
          </p>
        </div>
        <Link
          href="/business/campaigns/new?type=lucky_draw"
          className="px-3 py-1.5 bg-[#1A6EFF] text-white text-xs rounded-full"
        >
          {t("business.luckyDraw.create", lang)}
        </Link>
      </div>

      <div className="px-4 mt-3 space-y-3">
        {campaigns.map((c) => {
          const s = c.status;
          const sBadge: Record<string, { variant: "green" | "orange" | "red" | "slate"; label: string }> = {
            draft: { variant: "slate", label: statusLabels.draft[lang] },
            active: { variant: "green", label: statusLabels.active[lang] },
            ended: { variant: "red", label: statusLabels.ended[lang] },
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
                          {c.startDate.toLocaleDateString(dateLocale)} ~ {c.endDate.toLocaleDateString(dateLocale)}
                          {c.drawDate && ` · ${c.drawDate.toLocaleDateString(dateLocale)} ${lang === "zh" ? "开奖" : "Draw"}`}
                        </p>
                      </div>
                    </div>
                    <Badge variant={sb.variant}>{sb.label}</Badge>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>🎁 {prizeCount} {t("business.luckyDraw.prizes", lang)}</span>
                    <span>👤 {c.entryCount} {t("business.luckyDraw.entries", lang)}</span>
                    {c.minSpendCents && <span>💰 {t("business.luckyDraw.minSpend", lang, { amount: c.minSpendCents / 100 })}</span>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}

        {campaigns.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-5xl mb-4">🎰</p>
            <p className="text-sm">{t("business.luckyDraw.noData", lang)}</p>
            <p className="text-xs mt-1 text-slate-300">
              {t("business.luckyDraw.noDataHint", lang)}
            </p>
            <Link
              href="/business/campaigns/new?type=lucky_draw"
              className="inline-block mt-4 px-6 py-2 bg-[#1A6EFF] text-white text-sm rounded-full"
            >
              {t("business.luckyDraw.firstCampaign", lang)}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

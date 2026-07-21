import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import { cookies } from "next/headers";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";

const DRAW_TYPES = ["lucky_draw", "lucky_draw_v2", "voucher_sale"] as const;

export default async function DiscoverDrawsPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login?redirect=/discover/draws");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";
  const dateLocale = lang === "en" ? "en-US" : "zh-CN";

  const campaigns = await prisma.campaign.findMany({
    where: {
      type: { in: [...DRAW_TYPES] },
      status: "active",
      endDate: { gt: new Date() },
    },
    include: { business: { select: { businessName: true } } },
    orderBy: { endDate: "asc" },
    take: 50,
  });

  return (
    <div className="pb-4">
      <div className="px-4 py-4 border-b border-slate-100">
        <Link
          href="/home"
          className="text-xs font-medium text-[#1A6EFF] mb-1 inline-block"
        >
          ← {t("discover.backHome", lang)}
        </Link>
        <h1 className="text-lg font-semibold">
          {t("discover.draws.title", lang)}
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {t("discover.draws.subtitle", lang, { count: campaigns.length })}
        </p>
      </div>

      <div className="px-4 mt-3 space-y-2">
        {campaigns.length === 0 ? (
          <div className="text-center py-16 px-4">
            <p className="text-4xl mb-2">🎰</p>
            <p className="text-sm text-slate-600">
              {t("discover.draws.empty", lang)}
            </p>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              {t("discover.draws.emptyHint", lang)}
            </p>
          </div>
        ) : (
          campaigns.map((d) => {
            const href = `/voucher/${d.slug || d.id}`;
            const isDraw =
              d.type === "lucky_draw" || d.type === "lucky_draw_v2";
            return (
              <Link key={d.id} href={href}>
                <Card className="hover:border-[#1A6EFF]/30 transition-colors">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-xl shrink-0">
                      {isDraw ? "🎰" : "🎟️"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {d.name}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {d.business?.businessName || "—"}
                        {" · "}
                        {t("discover.draws.ends", lang)}{" "}
                        {d.endDate.toLocaleDateString(dateLocale)}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-[#FF6B35]">
                      {isDraw
                        ? t("home.draws.enter", lang)
                        : t("discover.draws.buy", lang)}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

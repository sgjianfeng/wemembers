import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { t } from "@/lib/i18n";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import Link from "next/link";

export default async function CardIndexPage() {
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const memberships = await prisma.membership.findMany({
    where: { customerId: session.userId },
    include: {
      business: {
        select: { id: true, businessName: true, businessSlug: true, businessCategory: true },
      },
    },
    orderBy: [{ isFavorite: "desc" }, { visitsCount: "desc" }],
  });

  return (
    <div className="pb-4">
      <div className="px-4 py-4 border-b border-slate-100">
        <h1 className="text-lg font-semibold">{t("card.title", lang)}</h1>
      </div>

      {memberships.length > 0 ? (
        <div className="px-4 mt-3 space-y-2">
          {memberships.map((m) => (
            <Link key={m.business.id} href={`/card/${m.business.id}`}>
              <Card className="hover:border-[#1A6EFF]/30 transition-colors">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#1A6EFF] to-[#3B82F6] flex items-center justify-center text-white text-lg shrink-0">
                    🏢
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-slate-900">
                        {m.business.businessName || t("card.unknownShop", lang)}
                      </p>
                      {m.isFavorite && <span className="text-xs">⭐</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {t("card.pointsAndVisits", lang, {
                        points: m.points,
                        visits: m.visitsCount,
                      })}
                    </p>
                  </div>
                  <span className="text-slate-300">→</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 px-6">
          <p className="text-5xl mb-4">💳</p>
          <p className="text-sm text-slate-400">{t("card.noCard", lang)}</p>
          <p className="text-xs text-slate-300 mt-1">{t("card.noCardHint", lang)}</p>
          <Link
            href="/home"
            className="inline-block mt-4 px-6 py-2 bg-[#1A6EFF] text-white text-sm rounded-full"
          >
            {t("card.goClaim", lang)}
          </Link>
        </div>
      )}
    </div>
  );
}

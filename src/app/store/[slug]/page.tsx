import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TopHeader } from "@/components/ui/TopHeader";
import { daysUntil } from "@/lib/utils";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const store = await prisma.store.findUnique({
    where: { slug },
    include: { business: { select: { id: true, businessName: true, businessCategory: true } } },
  });
  if (!store) notFound();

  const coupons = await prisma.coupon.findMany({
    where: { businessId: store.business.id, status: "published", validUntil: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  const session = await getSession();
  const isLoggedIn = !!session;

  return (
    <div className="min-h-screen bg-slate-50">
      <TopHeader variant="default" title={store.name} />

      <div className="bg-gradient-to-b from-[#1A6EFF] to-[#3B82F6] px-4 pt-8 pb-8 text-white">
        <div className="text-center">
          <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto text-3xl">🏪</div>
          <h1 className="text-xl font-bold mt-3">{store.name}</h1>
          <p className="text-white/60 text-xs mt-1">{store.business.businessName}</p>
          {store.address && <p className="text-white/60 text-xs mt-1">📍 {store.address}</p>}
        </div>
      </div>

      <div className="px-4 -mt-4 pb-8">
        <div className="bg-white rounded-t-2xl pt-5 px-1">
          <div className="flex items-center justify-between px-3 mb-3">
            <h2 className="text-base font-semibold text-slate-900">{t("store.public.title", lang)}</h2>
            <span className="text-xs text-slate-400">{coupons.length}{lang === "zh" ? "张" : ""}</span>
          </div>

          {coupons.length > 0 ? (
            <div className="space-y-2 px-3">
              {coupons.map((c) => {
                const displayValue = c.type === "percentage" ? `${(c.valueCents / 100).toFixed(0)}${lang === "zh" ? "折" : "% off"}`
                  : c.type === "free_item" ? (lang === "zh" ? "免单" : "Free")
                  : `S$${(c.valueCents / 100).toFixed(0)}`;
                const soldOut = c.remainingQuantity !== null && c.remainingQuantity <= 0;
                return (
                  <Link key={c.id} href={`/coupons/${c.id}`}>
                    <Card className={`hover:border-[#1A6EFF]/30 border-l-4 border-l-[#FF6B35] ${soldOut ? "opacity-50" : ""}`}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-base font-bold text-[#FF6B35]">{displayValue}</p>
                            <Badge variant="slate" size="sm">{c.pointsRequired}⭐</Badge>
                          </div>
                          <p className="text-sm font-medium text-slate-900 mt-1">{c.title}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{lang === "zh" ? "剩余" : "Left"} {c.remainingQuantity ?? "∞"} {lang === "zh" ? "张" : ""} · {daysUntil(c.validUntil)}{lang === "zh" ? "天" : "d"}</p>
                        </div>
                        {!soldOut && <span className="px-3 py-1 bg-[#1A6EFF] text-white text-[10px] rounded-full shrink-0">{lang === "zh" ? "领取" : "Claim"}</span>}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16"><p className="text-4xl mb-3">🎫</p><p className="text-sm text-slate-400">{t("store.public.noCoupons", lang) || (lang === "zh" ? "暂无可领取代金券" : "No vouchers available")}</p></div>
          )}
        </div>

        {!isLoggedIn && coupons.length > 0 && (
          <div className="mx-3 mt-4 p-4 bg-[#1A6EFF]/5 rounded-xl text-center">
            <p className="text-sm text-slate-600">{t("store.public.loginPrompt", lang)}</p>
            <Link href={`/auth/login?redirect=/store/${store.slug}`} className="inline-block mt-2 px-6 py-2 bg-[#1A6EFF] text-white text-sm rounded-full">{t("store.public.login", lang)}</Link>
          </div>
        )}

        <div className="text-center mt-6"><p className="text-[10px] text-slate-300">{t("store.public.poweredBy", lang)}</p></div>
      </div>
    </div>
  );
}

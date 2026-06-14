import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatPoints, daysUntil } from "@/lib/utils";
import Link from "next/link";
import { DailyCheckIn } from "@/components/customer/DailyCheckIn";
import { t } from "@/lib/i18n";
import { cookies } from "next/headers";

export default async function CustomerHome() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { tokenAccount: { select: { balance: true } } },
  });
  if (!user) redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const coupons = await prisma.coupon.findMany({
    where: { status: "published", validUntil: { gt: new Date() },
      OR: [{ remainingQuantity: { gte: 1 } }, { remainingQuantity: null }] },
    include: { business: { select: { businessName: true } } },
    orderBy: { createdAt: "desc" }, take: 10,
  });

  const tierLabels: Record<string, string> = {
    regular: t("home.tier.regular", lang),
    silver: t("home.tier.silver", lang),
    gold: t("home.tier.gold", lang),
    platinum: t("home.tier.platinum", lang),
  };
  const tierInfo: Record<string, { label: string; next: string | null; nextLabel: string; threshold: number }> = {
    regular: { label: tierLabels.regular, next: "silver", nextLabel: tierLabels.silver, threshold: 500 },
    silver: { label: tierLabels.silver, next: "gold", nextLabel: tierLabels.gold, threshold: 2000 },
    gold: { label: tierLabels.gold, next: "platinum", nextLabel: tierLabels.platinum, threshold: 10000 },
    platinum: { label: tierLabels.platinum, next: null, nextLabel: "", threshold: Infinity },
  };
  const tier = tierInfo[user.membershipTier] || tierInfo.regular;
  const progress = tier.next ? Math.min(100, Math.round((user.lifetimePoints / tier.threshold) * 100)) : 100;

  return (
    <div className="pb-4">
      <div className="bg-gradient-to-r from-[#1A6EFF] to-[#3B82F6] px-4 pt-6 pb-5 text-white">
        <div className="flex items-center justify-between mb-2">
          <div><p className="text-white/70 text-xs">{t("home.myPoints", lang)}</p><p className="text-3xl font-bold">{formatPoints(user.pointsBalance)}</p></div>
          <Badge variant="slate" size="md" className="!bg-white/20 !text-white">{tier.label}</Badge>
        </div>
        {tier.next && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-white/70 mb-1"><span>{t("home.toNextTier", lang, { name: tier.nextLabel })}</span><span>{user.lifetimePoints}/{tier.threshold}</span></div>
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden"><div className="h-full bg-[#FF6B35] rounded-full" style={{ width: `${progress}%` }} /></div>
          </div>
        )}
      </div>
      {user.tokenAccount && user.tokenAccount.balance > 0 && (
        <Link href="/my-tokens" className="block px-4 py-2 bg-amber-50 border-b border-amber-100">
          <div className="flex items-center justify-between"><span className="text-xs text-amber-700">{t("home.tokenBalance", lang)}</span><span className="text-sm font-semibold text-amber-800">{user.tokenAccount.balance}</span></div>
        </Link>
      )}
      {/* 每日签到 */}
      <div className="px-4 mt-4">
        <DailyCheckIn />
      </div>

      <div className="px-4 mt-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">{t("home.hotCoupons", lang)}</h2>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
          {coupons.slice(0, 5).map((c) => (
            <Link key={c.id} href={`/coupons/${c.id}`} className="snap-start shrink-0 w-[140px]">
              <Card className="hover:border-[#1A6EFF]/30 transition-colors">
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 mb-2"><div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs">🏢</div><span className="text-[11px] text-slate-500 truncate">{c.business?.businessName}</span></div>
                  <p className="text-sm font-semibold text-slate-900 leading-tight line-clamp-2">{c.title}</p>
                  <div className="flex items-center justify-between mt-2"><span className="text-xs text-[#FF6B35] font-bold">{c.pointsRequired}⭐</span><span className="text-[10px] text-slate-400">{t("home.daysSuffix", lang, { n: daysUntil(c.validUntil) })}</span></div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
      <div className="px-4 mt-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">{t("home.allCoupons", lang)}</h2>
        <div className="space-y-2">
          {coupons.map((c) => (
            <Link key={c.id} href={`/coupons/${c.id}`}>
              <Card className="hover:border-[#1A6EFF]/30 transition-colors">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0"><div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><span className="text-lg">{c.type === "free_item" ? "🎁" : "🎫"}</span></div><div className="min-w-0"><p className="text-sm font-medium text-slate-900 truncate">{c.title}</p><p className="text-xs text-slate-400 truncate">{c.business?.businessName} · {c.pointsRequired}⭐ · {t("home.daysSuffix", lang, { n: daysUntil(c.validUntil) })}</p></div></div>
                  <div className="flex items-center gap-1 shrink-0">
                    {c.giftType && c.giftType !== "none" && <span className="text-xs" title={t("home.claimGift", lang)}>{c.giftType === "points" ? "⭐" : c.giftType === "lottery" ? "🎰" : "🎀"}</span>}
                    <Badge variant="orange" size="sm">{t("home.claim", lang)}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          {coupons.length === 0 && <div className="text-center py-10 text-slate-400"><p className="text-4xl mb-2">🎫</p><p className="text-sm">{t("home.noCoupons", lang)}</p></div>}
        </div>
      </div>
    </div>
  );
}

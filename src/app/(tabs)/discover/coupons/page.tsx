import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import { cookies } from "next/headers";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default async function DiscoverCouponsPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login?redirect=/discover/coupons");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";
  const dateLocale = lang === "en" ? "en-US" : "zh-CN";

  const [coupons, claimed] = await Promise.all([
    prisma.coupon.findMany({
      where: {
        status: "published",
        validUntil: { gt: new Date() },
        OR: [{ remainingQuantity: { gte: 1 } }, { remainingQuantity: null }],
      },
      include: {
        business: { select: { businessName: true } },
      },
      orderBy: [{ claimedCount: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.customerCoupon.findMany({
      where: {
        customerId: session.userId,
        status: "available",
      },
      select: { couponId: true },
    }),
  ]);

  const claimedSet = new Set(claimed.map((x) => x.couponId));

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
          {t("discover.coupons.title", lang)}
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {t("discover.coupons.subtitle", lang, { count: coupons.length })}
        </p>
      </div>

      <div className="px-4 mt-3 space-y-2">
        {coupons.length === 0 ? (
          <div className="text-center py-16 px-4">
            <p className="text-4xl mb-2">🎫</p>
            <p className="text-sm text-slate-600">
              {t("discover.coupons.empty", lang)}
            </p>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              {t("discover.coupons.emptyHint", lang)}
            </p>
            <Link
              href="/wallet"
              className="inline-flex mt-4 px-4 py-1.5 rounded-full text-xs font-semibold bg-white border border-slate-200 text-slate-700"
            >
              {t("home.discover.goWallet", lang)}
            </Link>
          </div>
        ) : (
          coupons.map((coupon) => {
            const isClaimed = claimedSet.has(coupon.id);
            const display =
              coupon.type === "percentage"
                ? `${(coupon.valueCents / 100).toFixed(0)}${t("home.deal.off", lang)}`
                : coupon.type === "free_item"
                  ? t("home.deal.free", lang)
                  : `S$${(coupon.valueCents / 100).toFixed(0)}`;
            const scarce =
              coupon.remainingQuantity !== null &&
              coupon.remainingQuantity > 0 &&
              coupon.remainingQuantity <= 10;

            return (
              <Link key={coupon.id} href={`/coupons/${coupon.id}`}>
                <Card
                  className={`border-l-4 transition-colors hover:border-[#1A6EFF]/30 ${
                    isClaimed
                      ? "border-l-green-400 bg-green-50/40"
                      : "border-l-[#FF6B35]"
                  }`}
                >
                  <CardContent className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p
                          className={`text-base font-bold shrink-0 ${
                            isClaimed ? "text-green-600" : "text-[#FF6B35]"
                          }`}
                        >
                          {display}
                        </p>
                        {coupon.pointsRequired > 0 && (
                          <Badge variant="slate" size="sm">
                            {coupon.pointsRequired}⭐
                          </Badge>
                        )}
                        {scarce && (
                          <Badge variant="orange" size="sm">
                            {t("home.deal.left", lang, {
                              n: String(coupon.remainingQuantity),
                            })}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium text-slate-900 mt-1 truncate">
                        {coupon.title}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                        {coupon.business.businessName}
                        {" · "}
                        {t("wallet.expires", lang)}{" "}
                        {coupon.validUntil.toLocaleDateString(dateLocale)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 px-3 py-1 text-[10px] rounded-full font-medium ${
                        isClaimed
                          ? "bg-green-100 text-green-600"
                          : "bg-[#1A6EFF] text-white"
                      }`}
                    >
                      {isClaimed
                        ? t("home.claimed", lang)
                        : t("home.claim", lang)}
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

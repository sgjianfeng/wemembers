import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/Card";
import Link from "next/link";
import { daysUntil } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { cookies } from "next/headers";

export default async function WalletPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const myCoupons = await prisma.customerCoupon.findMany({
    where: { customerId: session.userId },
    include: { coupon: { include: { business: { select: { businessName: true } } } } },
    orderBy: { claimedAt: "desc" },
  });

  const available = myCoupons.filter((c) => c.status === "available");
  const usedCount = myCoupons.filter((c) => c.status === "used").length;
  const expiredCount = myCoupons.filter((c) => c.status === "expired").length;
  const dateLocale = lang === "en" ? "en-US" : "zh-CN";

  return (
    <div className="pb-4">
      <div className="px-4 py-4 border-b border-slate-100"><h1 className="text-lg font-semibold">{t("wallet.title", lang)}</h1></div>
      <div className="px-4 py-3 flex gap-1 bg-white border-b border-slate-50">
        <span className="px-4 py-1.5 rounded-full text-sm font-medium bg-[#1A6EFF] text-white">{t("wallet.available", lang)} · {available.length}</span>
        <span className="px-4 py-1.5 rounded-full text-sm font-medium text-slate-500">{t("wallet.used", lang)} · {usedCount}</span>
        <span className="px-4 py-1.5 rounded-full text-sm font-medium text-slate-500">{t("wallet.expired", lang)} · {expiredCount}</span>
      </div>
      <div className="px-4 mt-3 space-y-2">
        {available.map((claim) => (
          <Link key={claim.id} href={`/redeem/${claim.id}`}>
            <Card className="border-l-4 border-l-[#FF6B35] hover:border-[#1A6EFF] transition-colors">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div><p className="text-xs text-slate-400">{claim.coupon.business?.businessName}</p><p className="text-lg font-bold text-slate-900 mt-0.5">¥{(claim.coupon.valueCents / 100).toFixed(0)}</p><p className="text-xs text-slate-500">{claim.coupon.title}</p></div>
                  <div className="text-right"><p className="text-xs text-slate-400">{t("wallet.expires", lang)} {claim.coupon.validUntil.toLocaleDateString(dateLocale)}</p><span className="inline-block mt-2 px-3 py-1 bg-[#1A6EFF] text-white text-xs rounded-full">{t("wallet.useNow", lang)}</span></div>
                </div>
                <div className="mt-2 pt-2 border-t border-dashed border-slate-100 flex items-center justify-between"><span className="text-[10px] text-slate-400 font-mono">{claim.qrCode}</span><span className="text-[10px] text-slate-400">{t("wallet.gift", lang)}</span></div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {available.length === 0 && <div className="text-center py-12 text-slate-400"><p className="text-4xl mb-2">🎫</p><p className="text-sm">{t("wallet.noCoupons", lang)}</p></div>}
      </div>
    </div>
  );
}

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { formatMoney } from "@/lib/utils";
import { t, type Lang } from "@/lib/i18n";

export interface HomeVoucherItem {
  id: string;
  campaignName: string;
  kind: "draw" | "discount";
  balanceCents: number;
  amountCents: number;
  storeName: string | null;
}

export function HomeVouchersSection({
  lang,
  totalBalanceCents,
  vouchers,
  savedThisMonth,
}: {
  lang: Lang;
  totalBalanceCents: number;
  vouchers: HomeVoucherItem[];
  savedThisMonth: number;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-sm font-semibold text-slate-900">
          {t("home.section.vouchers", lang)}
        </h2>
        {vouchers.length > 0 && (
          <Link href="/balance" className="text-xs font-medium text-[#1A6EFF]">
            {t("home.vouchers.viewAll", lang)}
          </Link>
        )}
      </div>

      {vouchers.length === 0 ? (
        <Card className="border-slate-100 bg-slate-50/80">
          <CardContent className="p-4 text-center">
            <p className="text-2xl mb-1">💳</p>
            <p className="text-sm font-medium text-slate-700">{t("home.vouchers.empty", lang)}</p>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              {t("home.vouchers.emptyHint", lang)}
            </p>
            <Link
              href="/balance"
              className="inline-flex mt-3 px-4 py-1.5 rounded-full text-xs font-semibold bg-[#1A6EFF] text-white"
            >
              {t("home.vouchers.goBalance", lang)}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="bg-gradient-to-r from-amber-500 to-amber-400 border-0">
            <CardContent className="p-4 flex items-end justify-between text-white">
              <div>
                <p className="text-xs text-white/80">{t("home.vouchers.total", lang)}</p>
                <p className="text-2xl font-bold mt-0.5">S${formatMoney(totalBalanceCents)}</p>
                <p className="text-[11px] text-white/70 mt-1">
                  {t("home.vouchers.count", lang, { count: vouchers.length })}
                </p>
              </div>
              {savedThisMonth > 0 && (
                <p className="text-[11px] text-white/90 font-medium text-right max-w-[40%]">
                  {t("home.vouchers.savedMonth", lang, {
                    amount: savedThisMonth.toFixed(0),
                  })}
                </p>
              )}
            </CardContent>
          </Card>

          {vouchers.slice(0, 3).map((v) => (
            <Link key={v.id} href="/balance">
              <Card className="hover:border-[#1A6EFF]/30 transition-colors">
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          v.kind === "draw"
                            ? "bg-orange-50 text-orange-700"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {v.kind === "draw"
                          ? t("home.vouchers.badge.draw", lang)
                          : t("home.vouchers.badge.discount", lang)}
                      </span>
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {v.campaignName}
                      </p>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {t("home.vouchers.face", lang, {
                        amount: formatMoney(v.amountCents),
                      })}
                      {v.storeName ? ` · ${v.storeName}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-amber-600">
                      S${formatMoney(v.balanceCents)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </>
      )}
    </section>
  );
}

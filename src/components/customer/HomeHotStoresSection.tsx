import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { t, type Lang } from "@/lib/i18n";
import type { DiscoverStoreItem } from "@/lib/discover-stores";
import { storeHref } from "@/lib/discover-stores";
import { SERVICE_CATEGORIES } from "@/types";

export function HomeHotStoresSection({
  lang,
  stores,
}: {
  lang: Lang;
  stores: DiscoverStoreItem[];
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-sm font-semibold text-slate-900">
          {t("home.section.hotStores", lang)}
        </h2>
        <Link
          href="/discover/stores"
          className="text-xs font-medium text-[#1A6EFF]"
        >
          {t("home.vouchers.viewAll", lang)}
        </Link>
      </div>

      {stores.length === 0 ? (
        <Card className="border-slate-100 bg-slate-50/80">
          <CardContent className="p-4 text-center">
            <p className="text-2xl mb-1">🏪</p>
            <p className="text-sm font-medium text-slate-700">
              {t("discover.stores.empty", lang)}
            </p>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              {t("discover.stores.emptyHint", lang)}
            </p>
            <Link
              href="/discover/stores"
              className="inline-flex mt-3 px-4 py-1.5 rounded-full text-xs font-semibold bg-white border border-slate-200 text-slate-700"
            >
              {t("home.vouchers.viewAll", lang)}
            </Link>
          </CardContent>
        </Card>
      ) : (
        stores.slice(0, 5).map((s) => {
          const cat =
            lang === "zh"
              ? SERVICE_CATEGORIES.find((x) => x.value === s.businessCategory)
                  ?.label || s.businessCategory
              : s.businessCategory;
          return (
            <Link key={s.businessId} href={storeHref(s)}>
              <Card className="hover:border-[#1A6EFF]/30 transition-colors">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#1A6EFF] to-[#3B82F6] flex items-center justify-center text-white text-lg shrink-0">
                    🏪
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {s.businessName}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {cat ? `${cat} · ` : ""}
                      {s.campaignCount > 0
                        ? t("home.stores.campaigns", lang, {
                            count: s.campaignCount,
                          })
                        : s.couponCount > 0
                          ? t("discover.stores.coupons", lang, {
                              count: s.couponCount,
                            })
                          : t("discover.stores.enter", lang)}
                    </p>
                  </div>
                  <span className="text-slate-300 shrink-0">→</span>
                </CardContent>
              </Card>
            </Link>
          );
        })
      )}
    </section>
  );
}

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import { cookies } from "next/headers";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { BrandAvatar } from "@/components/ui/BrandAvatar";
import { listHotStores, storeHref } from "@/lib/discover-stores";
import { SERVICE_CATEGORIES } from "@/types";

export default async function DiscoverStoresPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login?redirect=/discover/stores");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const stores = await listHotStores(50);

  function categoryLabel(value: string | null): string | null {
    if (!value) return null;
    if (lang === "en") return value;
    return (
      SERVICE_CATEGORIES.find((x) => x.value === value)?.label || value
    );
  }

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
          {t("discover.stores.title", lang)}
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {t("discover.stores.subtitle", lang, { count: stores.length })}
        </p>
      </div>

      <div className="px-4 mt-3 space-y-2">
        {stores.length === 0 ? (
          <div className="text-center py-16 px-4">
            <p className="text-4xl mb-2">🏪</p>
            <p className="text-sm text-slate-600">
              {t("discover.stores.empty", lang)}
            </p>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              {t("discover.stores.emptyHint", lang)}
            </p>
          </div>
        ) : (
          stores.map((s) => {
            const cat = categoryLabel(s.businessCategory);
            const bits: string[] = [];
            if (cat) bits.push(cat);
            if (s.campaignCount > 0) {
              bits.push(
                t("home.stores.campaigns", lang, { count: s.campaignCount })
              );
            }
            if (s.couponCount > 0) {
              bits.push(
                t("discover.stores.coupons", lang, { count: s.couponCount })
              );
            }
            if (s.storeCount > 0) {
              bits.push(
                t("discover.stores.outlets", lang, { count: s.storeCount })
              );
            }

            return (
              <Link key={s.businessId} href={storeHref(s)}>
                <Card className="hover:border-[#1A6EFF]/30 transition-colors">
                  <CardContent className="p-3 flex items-center gap-3">
                    <BrandAvatar
                      src={s.businessLogo}
                      name={s.businessName}
                      size={44}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {s.businessName}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {bits.length > 0
                          ? bits.join(" · ")
                          : t("discover.stores.noActivity", lang)}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-[#1A6EFF]">
                      {t("discover.stores.enter", lang)}
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

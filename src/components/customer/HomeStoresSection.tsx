import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { BrandAvatar } from "@/components/ui/BrandAvatar";
import { t, type Lang } from "@/lib/i18n";

export interface HomeStoreItem {
  businessId: string;
  businessName: string;
  businessSlug: string | null;
  businessLogo?: string | null;
  points: number;
  tier: string;
  campaignCount: number;
  isFavorite: boolean;
}

const TIER_KEYS: Record<string, string> = {
  regular: "home.tier.regular",
  silver: "home.tier.silver",
  gold: "home.tier.gold",
  platinum: "home.tier.platinum",
};

export function HomeStoresSection({
  lang,
  stores,
}: {
  lang: Lang;
  stores: HomeStoreItem[];
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-sm font-semibold text-slate-900">
          {t("home.section.stores", lang)}
        </h2>
        {stores.length > 0 && (
          <Link href="/card" className="text-xs font-medium text-[#1A6EFF]">
            {t("home.stores.viewAll", lang)}
          </Link>
        )}
      </div>

      {stores.length === 0 ? (
        <Card className="border-slate-100 bg-slate-50/80">
          <CardContent className="p-4 text-center">
            <p className="text-2xl mb-1">🏪</p>
            <p className="text-sm font-medium text-slate-700">{t("home.stores.empty", lang)}</p>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              {t("home.stores.emptyHint", lang)}
            </p>
            <Link
              href="/discover/stores"
              className="inline-flex mt-3 px-4 py-1.5 rounded-full text-xs font-semibold bg-white border border-slate-200 text-slate-700"
            >
              {t("discover.stores.browse", lang)}
            </Link>
          </CardContent>
        </Card>
      ) : (
        stores.slice(0, 5).map((s) => {
          const href = s.businessSlug ? `/shop/${s.businessSlug}` : "/card";
          const tierLabel = t(TIER_KEYS[s.tier] || TIER_KEYS.regular, lang);
          return (
            <Link key={s.businessId} href={href}>
              <Card className="hover:border-[#1A6EFF]/30 transition-colors">
                <CardContent className="p-3 flex items-center gap-3">
                  <BrandAvatar
                    src={s.businessLogo}
                    name={s.businessName}
                    size={44}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {s.businessName}
                      </p>
                      {s.isFavorite && <span className="text-xs">⭐</span>}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {t("home.stores.points", lang, { points: s.points })}
                      {" · "}
                      {t("home.stores.tier", lang, { tier: tierLabel })}
                      {s.campaignCount > 0 && (
                        <>
                          {" · "}
                          {t("home.stores.campaigns", lang, {
                            count: s.campaignCount,
                          })}
                        </>
                      )}
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

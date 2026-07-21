"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useLang } from "@/components/i18n/LanguageProvider";

interface CouponItem {
  id: string;
  title: string;
  type: string;
  valueCents: number;
  pointsRequired: number;
  remainingQuantity: number | null;
  validUntil: string;
  claimedCount: number;
  giftType: string;
  business: { id: string; businessName: string };
  isClaimed: boolean;
}

const FILTERS = [
  { key: "all", labelKey: "home.filter.all" },
  { key: "highDiscount", labelKey: "home.filter.highDiscount" },
  { key: "limited", labelKey: "home.filter.limited" },
  { key: "free", labelKey: "home.filter.free" },
] as const;

export function VoucherTabs({
  coupons,
}: {
  coupons: CouponItem[];
  /** @deprecated reserved for SSR parity; client uses useLang() */
  lang?: "zh" | "en";
}) {
  const { t } = useLang();
  const [active, setActive] = useState<string>("all");

  const filtered = (() => {
    switch (active) {
      case "highDiscount":
        return coupons.filter((c) => c.type === "percentage" && c.valueCents >= 7000);
      case "limited":
        return coupons.filter((c) => c.remainingQuantity !== null && c.remainingQuantity <= 10);
      case "free":
        return coupons.filter((c) => c.type === "free_item");
      default:
        return coupons;
    }
  })();

  return (
    <div>
      {coupons.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setActive(f.key)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                active === f.key
                  ? "bg-[#1A6EFF] text-white shadow-sm"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {filtered.map((c) => {
          const displayValue =
            c.type === "percentage"
              ? `${(c.valueCents / 100).toFixed(0)}${t("home.deal.off")}`
              : c.type === "free_item"
              ? t("home.deal.free")
              : `S$${(c.valueCents / 100).toFixed(0)}`;
          const soldOut = c.remainingQuantity !== null && c.remainingQuantity <= 0;
          const scarce =
            c.remainingQuantity !== null && c.remainingQuantity > 0 && c.remainingQuantity <= 10;
          const daysLeft = Math.ceil(
            (new Date(c.validUntil).getTime() - Date.now()) / 86400000
          );

          return (
            <Link key={c.id} href={`/coupons/${c.id}`}>
              <Card
                className={`hover:border-[#1A6EFF]/30 border-l-4 transition-colors ${
                  c.isClaimed
                    ? "border-l-green-400 bg-green-50/50"
                    : soldOut
                    ? "border-l-slate-300 opacity-50"
                    : scarce
                    ? "border-l-red-400"
                    : "border-l-[#FF6B35]"
                }`}
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p
                        className={`text-base font-bold shrink-0 ${
                          c.isClaimed ? "text-green-600" : "text-[#FF6B35]"
                        }`}
                      >
                        {displayValue}
                      </p>
                      <Badge variant="slate" size="sm">
                        {c.pointsRequired}⭐
                      </Badge>
                      {c.giftType && c.giftType !== "none" && (
                        <span className="text-xs">
                          {c.giftType === "points"
                            ? "⭐"
                            : c.giftType === "lottery"
                            ? "🎰"
                            : "🎁"}
                        </span>
                      )}
                      {scarce && (
                        <Badge variant="orange" size="sm">
                          {t("home.deal.left", { n: String(c.remainingQuantity) })}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-900 mt-1 truncate">{c.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {c.business.businessName}
                      {" · "}
                      {t("home.deal.claimed", { n: String(c.claimedCount) })}
                      {" · "}
                      {daysLeft > 0
                        ? t("home.deal.daysLeft", { n: String(daysLeft) })
                        : t("home.deal.today")}
                    </p>
                  </div>
                  <div className="ml-2 shrink-0">
                    {c.isClaimed ? (
                      <span className="px-3 py-1 bg-green-100 text-green-600 text-[10px] rounded-full font-medium">
                        {t("home.claimed")}
                      </span>
                    ) : !soldOut ? (
                      <span className="px-3 py-1 bg-[#1A6EFF] text-white text-[10px] rounded-full font-medium">
                        {t("home.claim")}
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-slate-200 text-slate-400 text-[10px] rounded-full font-medium">
                        {t("home.deal.soldOut")}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-10 px-4 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-4xl mb-2">🎫</p>
            <p className="text-sm font-medium text-slate-600">{t("home.discover.emptyTitle")}</p>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              {t("home.discover.emptyHint")}
            </p>
            <Link
              href="/wallet"
              className="inline-flex mt-4 px-4 py-1.5 rounded-full text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:border-[#1A6EFF] hover:text-[#1A6EFF] transition-colors"
            >
              {t("home.discover.goWallet")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

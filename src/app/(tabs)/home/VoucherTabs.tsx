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

export function VoucherTabs({ coupons, lang: initialLang }: { coupons: CouponItem[]; lang: "zh" | "en" }) {
  const { t } = useLang();
  const [active, setActive] = useState<string>("all");

  const filtered = (() => {
    switch (active) {
      case "highDiscount":
        return coupons.filter((c) => c.type === "percentage" && c.valueCents >= 7000); // 70%+ off
      case "limited":
        return coupons.filter((c) => c.remainingQuantity !== null && c.remainingQuantity <= 10);
      case "free":
        return coupons.filter((c) => c.type === "free_item");
      default:
        return coupons;
    }
  })();

  const dateLocale = initialLang === "en" ? "en-US" : "zh-CN";

  return (
    <div>
      {/* Filter Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4">
        {FILTERS.map((f) => (
          <button
            key={f.key}
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

      {/* Coupon List */}
      <div className="mt-3 space-y-2">
        {filtered.map((c) => {
          const displayValue =
            c.type === "percentage"
              ? `${(c.valueCents / 100).toFixed(0)}${initialLang === "zh" ? "折" : "% off"}`
              : c.type === "free_item"
              ? (initialLang === "zh" ? "免单" : "Free")
              : `$${(c.valueCents / 100).toFixed(0)}`;
          const soldOut = c.remainingQuantity !== null && c.remainingQuantity <= 0;
          const scarce = c.remainingQuantity !== null && c.remainingQuantity > 0 && c.remainingQuantity <= 10;
          const daysLeft = Math.ceil((new Date(c.validUntil).getTime() - Date.now()) / 86400000);

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
                      <p className={`text-base font-bold shrink-0 ${c.isClaimed ? "text-green-600" : "text-[#FF6B35]"}`}>
                        {displayValue}
                      </p>
                      <Badge variant="slate" size="sm">{c.pointsRequired}⭐</Badge>
                      {c.giftType && c.giftType !== "none" && (
                        <span className="text-xs">{c.giftType === "points" ? "⭐" : c.giftType === "lottery" ? "🎰" : "🎁"}</span>
                      )}
                      {scarce && (
                        <Badge variant="orange" size="sm">
                          {initialLang === "zh" ? `仅剩${c.remainingQuantity}` : `${c.remainingQuantity} left`}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-900 mt-1 truncate">{c.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {c.business.businessName}
                      {" · "}{c.claimedCount}{initialLang === "zh" ? "人已领" : " claimed"}
                      {" · "}{daysLeft > 0 ? (initialLang === "zh" ? `${daysLeft}天` : `${daysLeft}d`) : (initialLang === "zh" ? "今天到期" : "Today")}
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
                        {initialLang === "zh" ? "已抢光" : "Gone"}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <p className="text-4xl mb-2">🎫</p>
            <p className="text-sm">{t("home.noCoupons")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

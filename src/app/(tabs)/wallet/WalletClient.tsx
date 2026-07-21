"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { useLang } from "@/components/i18n/LanguageProvider";

export type WalletClaim = {
  id: string;
  status: string;
  qrCode: string;
  coupon: {
    title: string;
    valueCents: number;
    validUntil: string;
    businessName: string | null;
  };
};

type TabKey = "available" | "used" | "expired";

export function WalletClient({ claims }: { claims: WalletClaim[] }) {
  const { t, lang } = useLang();
  const [tab, setTab] = useState<TabKey>("available");
  const dateLocale = lang === "en" ? "en-US" : "zh-CN";

  const available = claims.filter((c) => c.status === "available");
  const used = claims.filter((c) => c.status === "used");
  const expired = claims.filter((c) => c.status === "expired");

  const lists: Record<TabKey, WalletClaim[]> = {
    available,
    used,
    expired,
  };

  const emptyKeys: Record<TabKey, string> = {
    available: "wallet.noCoupons",
    used: "wallet.noUsed",
    expired: "wallet.noExpired",
  };

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "available", label: t("wallet.available"), count: available.length },
    { key: "used", label: t("wallet.used"), count: used.length },
    { key: "expired", label: t("wallet.expired"), count: expired.length },
  ];

  const list = lists[tab];

  return (
    <div className="pb-4">
      <div className="px-4 py-4 border-b border-slate-100">
        <h1 className="text-lg font-semibold">{t("wallet.title")}</h1>
      </div>
      <div className="px-4 py-3 flex gap-1 bg-white border-b border-slate-50 overflow-x-auto">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === item.key
                ? "bg-[#1A6EFF] text-white"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {item.label} · {item.count}
          </button>
        ))}
      </div>
      <div className="px-4 mt-3 space-y-2">
        {list.map((claim) => {
          const isAvailable = claim.status === "available";
          const statusBadge =
            claim.status === "used"
              ? t("wallet.usedLabel")
              : claim.status === "expired"
                ? t("wallet.expiredLabel")
                : null;
          const inner = (
            <Card
              className={`border-l-4 transition-colors ${
                isAvailable
                  ? "border-l-[#FF6B35] hover:border-[#1A6EFF]"
                  : "border-l-slate-200 opacity-80"
              }`}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">
                      {claim.coupon.businessName}
                    </p>
                    <p className="text-lg font-bold text-slate-900 mt-0.5">
                      S${(claim.coupon.valueCents / 100).toFixed(0)}
                    </p>
                    <p className="text-xs text-slate-500">{claim.coupon.title}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">
                      {t("wallet.expires")}{" "}
                      {new Date(claim.coupon.validUntil).toLocaleDateString(
                        dateLocale
                      )}
                    </p>
                    {isAvailable ? (
                      <span className="inline-block mt-2 px-3 py-1 bg-[#1A6EFF] text-white text-xs rounded-full">
                        {t("wallet.useNow")}
                      </span>
                    ) : statusBadge ? (
                      <span className="inline-block mt-2 px-3 py-1 bg-slate-100 text-slate-500 text-xs rounded-full">
                        {statusBadge}
                      </span>
                    ) : null}
                  </div>
                </div>
                {isAvailable && (
                  <div className="mt-2 pt-2 border-t border-dashed border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-mono">
                      {claim.qrCode}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {t("wallet.gift")}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          );

          return isAvailable ? (
            <Link key={claim.id} href={`/redeem/${claim.id}`}>
              {inner}
            </Link>
          ) : (
            <div key={claim.id}>{inner}</div>
          );
        })}
        {list.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <p className="text-4xl mb-2">🎫</p>
            <p className="text-sm">{t(emptyKeys[tab])}</p>
          </div>
        )}
      </div>
    </div>
  );
}

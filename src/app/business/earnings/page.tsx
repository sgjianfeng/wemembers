"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { useLang } from "@/components/i18n/LanguageProvider";

interface EarningsData {
  wallet: { availableSgd: string; frozenSgd: string; totalEarnedSgd: string };
  redeem: {
    recentCount: number;
    recentVolumeSgd: string;
    recentIncomeSgd: string;
    todayCount: number;
    todayIncomeSgd: string;
    rows: Array<{
      id: string;
      storeName?: string;
      campaignName?: string;
      isOwnCampaign: boolean;
      amountSgd: string;
      incomeSgd: string;
      feeSgd: string;
      createdAt: string;
    }>;
  };
  sales: {
    count: number;
    faceSgd: string;
    commissionAccruedSgd: string;
    rows: Array<{
      id: string;
      campaignName?: string;
      faceSgd: string;
      commissionSgd: string;
      usedSgd: string;
      status: string;
    }>;
  };
  note: string;
}

export default function BusinessEarningsPage() {
  const { t } = useLang();
  const [data, setData] = useState<EarningsData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/business/earnings");
      const json = await res.json();
      if (!res.ok) setError(json.error || t("earnings.loading"));
      else setData(json.data);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="p-6 text-center text-sm text-red-600">
        {error}
        <div className="mt-2">
          <Link href="/auth/login" className="text-[#1A6EFF]">
            {t("earnings.login")}
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-center text-sm text-slate-400">{t("earnings.loading")}</div>;
  }

  return (
    <div className="pb-8">
      <div className="px-4 py-3 border-b border-slate-100">
        <h1 className="text-lg font-semibold">{t("earnings.title")}</h1>
        <p className="text-xs text-slate-400 mt-0.5">{t("earnings.note")}</p>
      </div>

      <div className="px-4 mt-4 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Card className="bg-[#1A6EFF] border-0">
            <CardContent className="p-3 text-white">
              <p className="text-[10px] text-white/70">{t("earnings.available")}</p>
              <p className="text-lg font-bold">S${data.wallet.availableSgd}</p>
            </CardContent>
          </Card>
          <Card className="bg-amber-50 border-amber-100">
            <CardContent className="p-3">
              <p className="text-[10px] text-amber-600">{t("earnings.frozen")}</p>
              <p className="text-lg font-bold text-amber-800">S${data.wallet.frozenSgd}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-slate-400">{t("earnings.totalEarned")}</p>
              <p className="text-lg font-bold">S${data.wallet.totalEarnedSgd}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4 space-y-2">
            <h2 className="text-sm font-semibold">{t("earnings.redeemTitle")}</h2>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-slate-50 rounded-lg p-2">
                <p className="text-[10px] text-slate-400">{t("earnings.today")}</p>
                <p className="text-sm font-bold">
                  {data.redeem.todayCount} · S${data.redeem.todayIncomeSgd}
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-2">
                <p className="text-[10px] text-slate-400">{t("earnings.recent40")}</p>
                <p className="text-sm font-bold">S${data.redeem.recentIncomeSgd}</p>
              </div>
            </div>
            {data.redeem.rows.length === 0 ? (
              <p className="text-xs text-slate-400">{t("earnings.noRedeem")}</p>
            ) : (
              data.redeem.rows.map((r) => (
                <div
                  key={r.id}
                  className="flex justify-between text-xs py-2 border-b border-slate-50 gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {r.campaignName || "—"}{" "}
                      {!r.isOwnCampaign && (
                        <span className="text-blue-600 font-normal">{t("earnings.external")}</span>
                      )}
                    </p>
                    <p className="text-slate-400">
                      {t("earnings.spendAt", {
                        store: r.storeName || "",
                        amount: r.amountSgd,
                      })}
                    </p>
                  </div>
                  <p className="text-green-700 font-semibold shrink-0">+S${r.incomeSgd}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <h2 className="text-sm font-semibold">{t("earnings.salesTitle")}</h2>
            <p className="text-[10px] text-slate-400">
              {t("earnings.salesSummary", {
                count: data.sales.count,
                face: data.sales.faceSgd,
                commission: data.sales.commissionAccruedSgd,
              })}
            </p>
            {data.sales.rows.length === 0 ? (
              <p className="text-xs text-slate-400">{t("earnings.noSales")}</p>
            ) : (
              data.sales.rows.map((s) => (
                <div
                  key={s.id}
                  className="flex justify-between text-xs py-2 border-b border-slate-50 gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{s.campaignName}</p>
                    <p className="text-slate-400">
                      {t("earnings.faceUsed", { face: s.faceSgd, used: s.usedSgd })}
                    </p>
                  </div>
                  <p className="text-green-700 font-semibold">+S${s.commissionSgd}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Link href="/business/scan" className="flex-1">
            <Button className="w-full" size="sm">
              {t("earnings.goScan")}
            </Button>
          </Link>
          <Link href="/business/tokens" className="flex-1">
            <Button variant="outline" className="w-full" size="sm">
              {t("earnings.withdraw")}
            </Button>
          </Link>
          <Link href="/seller" className="flex-1">
            <Button variant="outline" className="w-full" size="sm">
              {t("earnings.sellerLinks")}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

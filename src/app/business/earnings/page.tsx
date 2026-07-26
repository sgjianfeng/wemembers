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
      <div className="p-6 text-center text-sm text-red-600 dark:text-red-400">
        {error}
        <div className="mt-2">
          <Link href="/auth/login" className="text-primary">
            {t("earnings.login")}
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{t("earnings.loading")}</div>;
  }

  return (
    <div className="pb-8">
      <div className="px-4 py-3 border-b border-border">
        <h1 className="text-lg font-semibold text-foreground">{t("earnings.title")}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t("earnings.note")}</p>
      </div>

      <div className="px-4 mt-4 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Card className="bg-primary border-0">
            <CardContent className="p-3 text-primary-foreground">
              <p className="text-[10px] text-primary-foreground/70">{t("earnings.available")}</p>
              <p className="text-lg font-bold nums">S${data.wallet.availableSgd}</p>
            </CardContent>
          </Card>
          <Card className="bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50">
            <CardContent className="p-3">
              <p className="text-[10px] text-amber-600 dark:text-amber-400">{t("earnings.frozen")}</p>
              <p className="text-lg font-bold text-amber-800 dark:text-amber-300 nums">S${data.wallet.frozenSgd}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">{t("earnings.totalEarned")}</p>
              <p className="text-lg font-bold text-foreground nums">S${data.wallet.totalEarnedSgd}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4 space-y-2">
            <h2 className="text-sm font-semibold text-foreground">{t("earnings.redeemTitle")}</h2>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-muted/50 rounded-lg p-2">
                <p className="text-[10px] text-muted-foreground">{t("earnings.today")}</p>
                <p className="text-sm font-bold text-foreground nums">
                  {data.redeem.todayCount} · S${data.redeem.todayIncomeSgd}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2">
                <p className="text-[10px] text-muted-foreground">{t("earnings.recent40")}</p>
                <p className="text-sm font-bold text-foreground nums">S${data.redeem.recentIncomeSgd}</p>
              </div>
            </div>
            {data.redeem.rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("earnings.noRedeem")}</p>
            ) : (
              data.redeem.rows.map((r) => (
                <div
                  key={r.id}
                  className="flex justify-between text-xs py-2 border-b border-border gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {r.campaignName || "—"}{" "}
                      {!r.isOwnCampaign && (
                        <span className="text-primary font-normal">{t("earnings.external")}</span>
                      )}
                    </p>
                    <p className="text-muted-foreground">
                      {t("earnings.spendAt", {
                        store: r.storeName || "",
                        amount: r.amountSgd,
                      })}
                    </p>
                  </div>
                  <p className="text-green-700 dark:text-green-400 font-semibold shrink-0 nums">+S${r.incomeSgd}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <h2 className="text-sm font-semibold text-foreground">{t("earnings.salesTitle")}</h2>
            <p className="text-[10px] text-muted-foreground">
              {t("earnings.salesSummary", {
                count: data.sales.count,
                face: data.sales.faceSgd,
                commission: data.sales.commissionAccruedSgd,
              })}
            </p>
            {data.sales.rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("earnings.noSales")}</p>
            ) : (
              data.sales.rows.map((s) => (
                <div
                  key={s.id}
                  className="flex justify-between text-xs py-2 border-b border-border gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{s.campaignName}</p>
                    <p className="text-muted-foreground">
                      {t("earnings.faceUsed", { face: s.faceSgd, used: s.usedSgd })}
                    </p>
                  </div>
                  <p className="text-green-700 dark:text-green-400 font-semibold nums">+S${s.commissionSgd}</p>
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

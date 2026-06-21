"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { VoucherTierSelector } from "@/components/customer/VoucherTierSelector";
import { PoolDashboard } from "@/components/customer/PoolDashboard";
import { useLang } from "@/components/i18n/LanguageProvider";

export default function VoucherDrawPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useLang();
  const [campaign, setCampaign] = useState<any>(null);
  const [poolStatus, setPoolStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAmount, setSelectedAmount] = useState(50);
  const [spendNow, setSpendNow] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const [campRes, poolRes] = await Promise.all([
        fetch(`/api/draw/${slug}`).then(r => r.json()),
        fetch(`/api/campaign/pool-status?slug=${slug}`).then(r => r.json()),
      ]);
      if (campRes.data) setCampaign(campRes.data);
      if (poolRes.data) setPoolStatus(poolRes.data);
      setLoading(false);
    }
    load();
  }, [slug]);

  async function handlePurchase() {
    const amt = parseFloat(spendNow);
    if (isNaN(amt) || amt < 0 || amt > selectedAmount) {
      setError("Invalid spend amount");
      return;
    }
    setSubmitting(true);
    setError("");
    setResult(null);

    const res = await fetch(`/api/voucher/purchase?slug=${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountSgd: selectedAmount, spendNowSgd: amt || 0 }),
    });
    const d = await res.json();
    setSubmitting(false);
    if (res.ok) {
      setResult(d.data);
      // Refresh pool status
      const poolRes = await fetch(`/api/campaign/pool-status?slug=${slug}`).then(r => r.json());
      if (poolRes.data) setPoolStatus(poolRes.data);
    } else {
      setError(d.error || "Error");
    }
  }

  async function handleShareBoost() {
    if (!result?.voucher?.id) return;
    await fetch(`/api/campaign/share-boost`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voucherId: result.voucher.id }),
    });
    setResult((prev: any) => prev ? {
      ...prev,
      shareBoosted: true,
    } : prev);
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400"><p>{t("common.loading")}</p></div>;
  }
  if (!campaign) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-slate-400">Campaign not found</p></div>;
  }

  const isActive = campaign.status === "active" && new Date() < new Date(campaign.endDate);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FF6B35] via-orange-50 to-white">
      {/* Header */}
      <div className="px-4 pt-8 pb-4 text-center text-white">
        <p className="text-5xl mb-3">🎰</p>
        <h1 className="text-2xl font-bold">{campaign.name}</h1>
        <p className="text-white/70 text-sm mt-1">{campaign.businessName}</p>
        <p className="text-xs text-white/50 mt-1">{t("voucher.subtitle")}</p>
      </div>

      <div className="px-4 -mt-2 pb-8">
        {/* Pool Dashboard */}
        {poolStatus && (
          <div className="mb-4">
            <PoolDashboard
              countdowns={poolStatus.countdown || []}
              instantPoolSgd={poolStatus.pool?.instantPool?.sgd || "0"}
              dailyAvgVelocity={poolStatus.velocity?.dailyAvgCents || 0}
            />
          </div>
        )}

        {/* Purchase Section */}
        {isActive ? (
          <Card className="mb-4">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">{t("voucher.selectTier")}</h3>
              <div className="mb-4">
                <VoucherTierSelector selectedAmount={selectedAmount} onSelect={setSelectedAmount} />
              </div>

              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">{t("voucher.spendNow")}</label>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-sm">S$</span>
                  <input
                    type="number"
                    value={spendNow}
                    onChange={e => setSpendNow(e.target.value)}
                    placeholder={`max S$${selectedAmount}`}
                    className="flex-1 h-10 px-3 rounded-lg border border-slate-200 text-sm"
                  />
                  <span className={`text-xs px-2 py-1 rounded ${
                    selectedAmount - (parseFloat(spendNow) || 0) > 0
                      ? "bg-green-50 text-green-600"
                      : "bg-red-50 text-red-500"
                  }`}>
                    {t("voucher.balanceAfter")}: S${(selectedAmount - (parseFloat(spendNow) || 0)).toFixed(2)}
                  </span>
                </div>
              </div>

              {selectedAmount < 50 && (
                <p className="text-[10px] text-amber-600 mb-3 text-center bg-amber-50 rounded-lg py-1.5">
                  {t("voucher.upgradeHint", { amount: "50" })}
                </p>
              )}

              {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

              <Button className="w-full" size="lg" onClick={handlePurchase} loading={submitting}>
                {t("voucher.purchaseCta")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="text-center p-6 bg-white rounded-xl mb-4">
            <p className="text-2xl mb-2">🔒</p>
            <p className="text-sm text-slate-400">{t("draw.ended")}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <Card className="mb-4 border-green-200 bg-green-50">
            <CardContent className="p-4 text-center">
              <p className="text-3xl mb-2">🎉</p>
              <p className="text-lg font-semibold text-green-700">100% {t("draw.winCongrats")}</p>
              <p className="text-sm font-bold text-green-700 mt-1">
                {result.instantPrize?.icon} {result.instantPrize?.name}
              </p>
              <p className="text-xs text-green-600 mt-2">
                {t("voucher.balanceAfter")}: S${result.voucher?.balanceSgd}
              </p>
              {result.grandPoolEntry && (
                <p className="text-xs text-amber-600 mt-1 font-medium">
                  ✅ Entered Grand Prize Pool — Weight: {result.voucher?.drawWeight}
                </p>
              )}
              {!result.grandPoolEntry && (
                <p className="text-xs text-slate-400 mt-1">
                  {t("voucher.upgradeHint", { amount: "50" })}
                </p>
              )}

              {/* Share button */}
              {!result.shareBoosted && result.grandPoolEntry && (
                <button
                  onClick={handleShareBoost}
                  className="mt-3 px-4 py-2 bg-amber-100 text-amber-700 rounded-full text-xs font-medium hover:bg-amber-200 transition-colors"
                >
                  {t("pool.shareButton")}
                </button>
              )}
              {result.shareBoosted && (
                <p className="mt-3 text-xs text-green-600 font-medium">{t("pool.boostSuccess")}</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

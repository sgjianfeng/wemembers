"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TopHeader } from "@/components/ui/TopHeader";
import { VoucherTierSelector } from "@/components/customer/VoucherTierSelector";
import { PoolDashboard } from "@/components/customer/PoolDashboard";
import { InstantPrizePreview } from "@/components/customer/InstantPrizePreview";
import { useLang } from "@/components/i18n/LanguageProvider";
import { resolveTier } from "@/lib/draw-v2";

function TrustPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/90 text-[10px] font-medium text-slate-700 border border-slate-100">
      {children}
    </span>
  );
}

function VoucherDrawInner() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const { t } = useLang();
  const [campaign, setCampaign] = useState<any>(null);
  const [poolStatus, setPoolStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAmount, setSelectedAmount] = useState(0);
  const [spendNow, setSpendNow] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  const sellerId = searchParams.get("seller") || "";

  const refreshPool = useCallback(async () => {
    const poolRes = await fetch(`/api/campaign/pool-status?slug=${slug}`).then((r) =>
      r.json()
    );
    if (poolRes.data) {
      setCampaign(poolRes.data.campaign);
      setPoolStatus(poolRes.data);
      // 默认选中活动开放的最小面额（避免代金 S$2/S$10 却默认 50）
      const tiers: number[] = poolRes.data.rules?.enabledTiers || [];
      if (tiers.length > 0) {
        setSelectedAmount((prev) =>
          prev > 0 && tiers.includes(prev) ? prev : Math.min(...tiers)
        );
      } else {
        setSelectedAmount((prev) => (prev > 0 ? prev : 50));
      }
    }
  }, [slug]);

  useEffect(() => {
    async function load() {
      await refreshPool();
      setLoading(false);
    }
    load();
  }, [refreshPool]);

  useEffect(() => {
    const paid = searchParams.get("paid");
    const sessionId = searchParams.get("session_id");
    if (paid !== "1" || !sessionId || confirming || result) return;

    let cancelled = false;
    (async () => {
      setConfirming(true);
      setError("");
      try {
        const res = await fetch("/api/voucher/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const d = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setResult(d.data);
          await refreshPool();
        } else {
          setError(d.error || t("voucher.confirmPayFail"));
        }
      } catch {
        if (!cancelled) {
          setError(t("voucher.confirmPayFail"));
        }
      } finally {
        if (!cancelled) setConfirming(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, confirming, result, refreshPool]);

  async function handlePurchase() {
    if (!selectedAmount || selectedAmount <= 0) {
      setError(t("voucher.selectTier") || "请选择券面");
      return;
    }
    const amt = spendNow === "" ? 0 : parseFloat(spendNow);
    const maxSpend = isDraw ? selectedAmount * 0.8 : selectedAmount;
    if (isNaN(amt) || amt < 0 || amt > maxSpend) {
      setError(
        isDraw
          ? t("voucher.invalidSpend")
          : t("voucher.invalidSpendVoucher") || "本次消费不能超过可花余额"
      );
      return;
    }
    setSubmitting(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch(`/api/voucher/checkout?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountSgd: selectedAmount,
          spendNowSgd: amt || 0,
          sellerId: sellerId || undefined,
        }),
      });
      const d = await res.json();
      if (res.ok && d.data?.url) {
        window.location.href = d.data.url;
        return;
      }
      if (res.status === 503 || d.code === "USE_CHECKOUT") {
        const direct = await fetch(`/api/voucher/purchase?slug=${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountSgd: selectedAmount,
            spendNowSgd: amt || 0,
            sellerId: sellerId || undefined,
            skipPayment: true,
          }),
        });
        const dj = await direct.json();
        setSubmitting(false);
        if (direct.ok) {
          setResult(dj.data);
          await refreshPool();
        } else {
          setError(dj.error || "Error");
        }
        return;
      }
      setSubmitting(false);
      setError(d.error || "Error");
    } catch {
      setSubmitting(false);
      setError(t("voucher.networkError"));
    }
  }

  async function handleShareBoost() {
    if (!result?.voucher?.id) return;
    await fetch(`/api/campaign/share-boost`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voucherId: result.voucher.id }),
    });
    setResult((prev: any) =>
      prev
        ? {
            ...prev,
            shareBoosted: true,
          }
        : prev
    );
  }

  if (loading || confirming) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        <p>{confirming ? t("voucher.confirming") : t("common.loading")}</p>
      </div>
    );
  }
  if (!campaign) {
    return (
      <div className="min-h-screen bg-white">
        <TopHeader variant="default" />
        <div className="flex items-center justify-center py-32">
          <div className="text-center text-slate-400">
            <p className="text-5xl mb-4">🎫</p>
            <p className="text-sm">{t("voucher.notFound")}</p>
          </div>
        </div>
      </div>
    );
  }

  const isActive = campaign.status === "active";
  const isDraw = campaign.isDraw !== false && campaign.type !== "voucher_sale";
  const discountPercent = poolStatus?.rules?.discountPercent ?? 0;
  // 代金：付 P 得 F（F=券面）；抽奖：付=面=入账
  const facePreview = selectedAmount;
  const paidPreview =
    !isDraw && discountPercent > 0
      ? Math.round((selectedAmount * (100 - discountPercent)) / 100)
      : selectedAmount;
  const creditPreview = isDraw ? paidPreview : facePreview;
  const spendNowNum = spendNow === "" ? 0 : parseFloat(spendNow) || 0;
  const balancePreview = Math.max(0, creditPreview - spendNowNum);
  const tier = resolveTier(selectedAmount);
  const paidCancelled = searchParams.get("paid") === "0";

  return (
    <div
      className={`min-h-screen bg-gradient-to-b ${
        isDraw
          ? "from-[#FF6B35] via-orange-50 to-white"
          : "from-[#1A6EFF] via-blue-50 to-white"
      }`}
    >
      <TopHeader variant="default" />
      <div className="px-4 pt-4 pb-4 text-center text-white">
        <span
          className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full mb-2 ${
            isDraw ? "bg-white/20" : "bg-white/20"
          }`}
        >
          {isDraw ? t("voucher.tag.draw") : t("voucher.tag.discount")}
        </span>
        <p className="text-5xl mb-3">{isDraw ? "🎰" : "🏷️"}</p>
        <h1 className="text-2xl font-bold">{campaign.name}</h1>
        <p className="text-white/80 text-sm mt-1">
          {isDraw ? t("voucher.subtitle") : t("voucher.discountSubtitle")}
        </p>
        {discountPercent > 0 && (
          <p className="text-white text-sm mt-2 font-semibold">
            {t("voucher.discountBanner", { pct: discountPercent })}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-1.5 mt-3">
          <TrustPill>{t("voucher.trust.pillNetwork")}</TrustPill>
          <TrustPill>{t("voucher.trust.pillWithdraw")}</TrustPill>
          <TrustPill>{t("voucher.trust.pillPaynow")}</TrustPill>
          <TrustPill>
            {isDraw ? t("voucher.trust.pillWin") : t("voucher.trust.pillSave")}
          </TrustPill>
        </div>
      </div>

      <div className="px-4 -mt-2 pb-8 space-y-3">
        {paidCancelled && !result && (
          <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-center text-xs text-amber-700">
            {t("voucher.payCancelled")}
          </div>
        )}

        {/* Trust: money is yours */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <p className="text-xs font-semibold text-slate-900">{t("voucher.trust.yours")}</p>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              {t("voucher.trust.yoursBody")}
            </p>
          </CardContent>
        </Card>

        {/* Network */}
        <div className="p-3 bg-white/95 border border-white/60 rounded-xl text-center shadow-sm">
          <p className="text-xs font-semibold text-slate-800">{t("network.publicTitle")}</p>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            {t("network.publicBody")}
          </p>
        </div>

        {/* Withdraw rules — trust feature */}
        <Card className="border-emerald-100 bg-emerald-50/80">
          <CardContent className="p-3">
            <p className="text-xs font-semibold text-emerald-900">
              💳 {t("voucher.trust.withdrawTitle")}
            </p>
            <p className="text-[11px] text-emerald-800/90 mt-1 leading-relaxed">
              {isDraw ? t("voucher.trust.withdrawDraw") : t("voucher.trust.withdrawVoucher")}
            </p>
            <p className="text-[10px] text-emerald-700/80 mt-1.5 font-medium">
              {t("voucher.trust.withdrawSlogan")}
            </p>
          </CardContent>
        </Card>

        {isDraw && poolStatus?.pool && (
          <PoolDashboard
            countdowns={poolStatus.countdown || []}
            instantPoolSgd={poolStatus.pool?.instantPool?.sgd || "0"}
            dailyAvgVelocity={poolStatus.velocity?.dailyAvgCents || 0}
          />
        )}

        {isActive && !result ? (
          <Card className="mb-2">
            <CardContent className="p-4">
              {/* Money transparency */}
              <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-[11px] font-semibold text-slate-700 mb-2">
                  {t("voucher.trust.moneyTitle")}
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-slate-400">{t("voucher.trust.face")}</p>
                    <p className="text-sm font-bold text-slate-800">
                      S${facePreview.toFixed(0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">{t("voucher.trust.pay")}</p>
                    <p className="text-sm font-bold text-[#1A6EFF]">
                      S${paidPreview.toFixed(0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">
                      {isDraw ? t("voucher.trust.credit") : t("voucher.trust.spendable")}
                    </p>
                    <p className="text-sm font-bold text-emerald-600">
                      S${creditPreview.toFixed(0)}
                    </p>
                  </div>
                </div>
                {!isDraw && discountPercent > 0 && (
                  <p className="text-[10px] text-blue-700/80 mt-2 text-center">
                    {t("voucher.payGetFace", {
                      paid: paidPreview.toFixed(0),
                      face: facePreview.toFixed(0),
                      pct: discountPercent,
                    })}
                  </p>
                )}
                {!isDraw && discountPercent === 0 && (
                  <p className="text-[10px] text-slate-400 mt-2 text-center">
                    {t("voucher.balanceEqFace")}
                  </p>
                )}
                {isDraw && (
                  <p className="text-[10px] text-slate-400 mt-2 text-center">
                    {t("voucher.balanceEqPaid")}
                  </p>
                )}
              </div>

              <h3 className="text-sm font-semibold text-slate-900 mb-2">{t("voucher.selectTier")}</h3>
              <div className="mb-4">
                <VoucherTierSelector
                  selectedAmount={selectedAmount}
                  onSelect={setSelectedAmount}
                  enabledAmounts={poolStatus?.rules?.enabledTiers}
                />
              </div>

              {isDraw && tier && (
                <div className="mb-4">
                  <InstantPrizePreview tier={tier} selectedAmount={selectedAmount} />
                </div>
              )}

              {/* 抽奖可保留「先花」；代金默认不展示（无最少留 20% 约束） */}
              {isDraw && (
                <div className="mb-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">
                    {t("voucher.spendNow")}
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-sm">S$</span>
                    <input
                      type="number"
                      value={spendNow}
                      onChange={(e) => setSpendNow(e.target.value)}
                      placeholder={`max S$${(creditPreview * 0.8).toFixed(0)}`}
                      className="flex-1 h-10 px-3 rounded-lg border border-slate-200 text-sm"
                    />
                    <span
                      className={`text-xs px-2 py-1 rounded shrink-0 ${
                        balancePreview >= creditPreview * 0.2
                          ? "bg-green-50 text-green-600"
                          : "bg-red-50 text-red-500"
                      }`}
                    >
                      {t("voucher.balanceAfter")}: S${balancePreview.toFixed(0)}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {t("voucher.minRemain")} S${(creditPreview * 0.2).toFixed(0)}
                  </p>
                </div>
              )}

              {isDraw && selectedAmount < 100 && (
                <p className="text-[10px] text-amber-600 mb-3 text-center bg-amber-50 rounded-lg py-1.5">
                  {t("voucher.upgradeHint", { amount: "100" })}
                </p>
              )}

              {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

              <Button className="w-full" size="lg" onClick={handlePurchase} loading={submitting}>
                {isDraw
                  ? t("voucher.payDraw")
                  : t("voucher.payAmount", { amount: paidPreview.toFixed(0) })}
              </Button>
              <p className="text-[10px] text-slate-400 text-center mt-2">
                {t("voucher.paynowHint")}
              </p>
            </CardContent>
          </Card>
        ) : !result ? (
          <div className="text-center p-6 bg-white rounded-xl">
            <p className="text-2xl mb-2">🔒</p>
            <p className="text-sm text-slate-400">{t("draw.ended")}</p>
          </div>
        ) : null}

        {result && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4 text-center space-y-2">
              <p className="text-3xl">🎉</p>
              <p className="text-lg font-semibold text-green-700">
                {result.instantPrize ? t("voucher.winCongrats") : t("voucher.buySuccess")}
              </p>
              {result.instantPrize && (
                <p className="text-xl font-bold text-green-700">
                  {result.instantPrize?.icon} {result.instantPrize?.name}
                </p>
              )}

              <div className="my-3 p-3 bg-white rounded-xl border border-green-100">
                <p className="text-[10px] text-slate-400">{t("voucher.success.balance")}</p>
                <p className="text-2xl font-bold text-emerald-600 mt-0.5">
                  S${result.voucher?.balanceSgd}
                </p>
                {result.voucher?.paidSgd != null && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    {t("voucher.paid")} S${result.voucher.paidSgd}
                  </p>
                )}
              </div>

              <p className="text-[11px] text-slate-600">{t("voucher.success.showHint")}</p>
              {result.voucher?.id && (
                <p className="text-[10px] text-slate-400 font-mono break-all">
                  {t("voucher.networkId")}: {result.voucher.id}
                </p>
              )}
              <p className="text-[10px] text-slate-500">{t("voucher.networkAfterBuy")}</p>

              <Link
                href="/balance"
                className="inline-block mt-2 px-5 py-2 bg-[#1A6EFF] text-white text-sm font-medium rounded-full"
              >
                {t("voucher.success.goBalance")}
              </Link>

              {result.grandPoolEntry ? (
                <>
                  <p className="text-xs text-amber-600 mt-2 font-medium">
                    ✅ {t("voucher.enteredGrand")} — {t("voucher.weight")}:{" "}
                    {result.voucher?.drawWeight}
                  </p>

                  {!result.shareBoosted ? (
                    <div className="mt-2 p-3 bg-amber-100 rounded-xl border border-amber-200">
                      <p className="text-sm font-semibold text-amber-800 mb-1">
                        🚀 {t("voucher.shareBoostTitle")}
                      </p>
                      <p className="text-[11px] text-amber-600 mb-2">{t("voucher.shareBoostHint")}</p>
                      <button
                        type="button"
                        onClick={handleShareBoost}
                        className="px-5 py-2 bg-amber-500 text-white rounded-full text-sm font-semibold hover:bg-amber-600 transition-colors active:scale-[0.98]"
                      >
                        📤 {t("voucher.shareNow")}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-green-600 font-medium">
                      ✅ {t("voucher.shareDone")}
                    </p>
                  )}
                </>
              ) : result.instantPrize && isDraw ? (
                <div className="mt-2 p-3 bg-slate-100 rounded-xl">
                  <p className="text-xs text-slate-500">
                    {t("voucher.upgradeHint", { amount: "100" })}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function VoucherDrawPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-slate-400">
          <p>…</p>
        </div>
      }
    >
      <VoucherDrawInner />
    </Suspense>
  );
}

"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Info,
  ChevronDown,
  Wallet,
  Trophy,
  Ticket,
  Tag,
  Lock,
  PartyPopper,
} from "lucide-react";
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
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/90 text-[10px] font-medium text-foreground/90 border border-white/40">
      {children}
    </span>
  );
}

/**
 * Folds the long trust/network/withdraw explainer copy into an on-demand drawer,
 * so the focal point (the purchase card) leads instead of a wall of legal text.
 */
function RulesDrawer({
  isSelfUse,
  isDraw,
  t,
}: {
  isSelfUse: boolean;
  isDraw: boolean;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  return (
    <details className="group rounded-2xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[13px] font-medium text-foreground">
        <span className="flex items-center gap-2">
          <Info size={15} className="text-muted-foreground" />
          {t("voucher.rules.title")}
        </span>
        <ChevronDown
          size={16}
          className="text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="space-y-3 px-4 pb-4 pt-1 text-[11px] leading-relaxed text-muted-foreground">
        {isSelfUse ? (
          <div>
            <p className="text-[12px] font-semibold text-foreground">
              {t("voucher.selfUse.trustTitle")}
            </p>
            <p className="mt-1">{t("voucher.selfUse.trustBody")}</p>
          </div>
        ) : (
          <>
            <div>
              <p className="text-[12px] font-semibold text-foreground">
                {t("voucher.trust.yours")}
              </p>
              <p className="mt-1">{t("voucher.trust.yoursBody")}</p>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-foreground">
                {t("network.publicTitle")}
              </p>
              <p className="mt-1">{t("network.publicBody")}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/30">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-800 dark:text-emerald-300">
                <Wallet size={13} />
                {t("voucher.trust.withdrawTitle")}
              </p>
              <p className="mt-1 text-emerald-800/90 dark:text-emerald-300/80">
                {isDraw
                  ? t("voucher.trust.withdrawDraw")
                  : t("voucher.trust.withdrawVoucher")}
              </p>
              <p className="mt-1.5 font-medium text-emerald-700/80 dark:text-emerald-400/70">
                {t("voucher.trust.withdrawSlogan")}
              </p>
            </div>
          </>
        )}
      </div>
    </details>
  );
}

function VoucherDrawInner() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const { t, lang } = useLang();
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
  const paidFlag = searchParams.get("paid");
  const sessionIdParam = searchParams.get("session_id");

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

  // 支付回跳确认：勿把 confirming 放进 deps（会 setState → 重跑 → cleanup cancel → 永远卡住）
  useEffect(() => {
    if (paidFlag !== "1" || !sessionIdParam || result) return;

    let alive = true;
    setConfirming(true);
    setError("");
    (async () => {
      try {
        const res = await fetch("/api/voucher/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionIdParam }),
        });
        const d = await res.json();
        if (!alive) return;
        if (res.ok) {
          setResult(d.data);
          await refreshPool();
        } else {
          setError(d.error || t("voucher.confirmPayFail"));
        }
      } catch {
        if (alive) setError(t("voucher.confirmPayFail"));
      } finally {
        if (alive) setConfirming(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidFlag, sessionIdParam, result, refreshPool]);

  async function handlePurchase() {
    if (!selectedAmount || selectedAmount <= 0) {
      setError(t("voucher.selectTier") || "请选择券面");
      return;
    }
    // 独享：付款即完成，不支持「先花」；联合抽奖才可填 spendNow
    const exclusive =
      (campaign?.productKind === "self_use" ||
        poolStatus?.campaign?.productKind === "self_use") &&
      campaign?.type !== "voucher_sale" &&
      campaign?.isDraw !== false;
    const amt = exclusive
      ? 0
      : spendNow === ""
        ? 0
        : parseFloat(spendNow);
    if (!exclusive) {
      const maxSpend = isDraw ? selectedAmount * 0.8 : selectedAmount;
      if (isNaN(amt) || amt < 0 || amt > maxSpend) {
        setError(
          isDraw
            ? t("voucher.invalidSpend")
            : t("voucher.invalidSpendVoucher") || "本次消费不能超过可花余额"
        );
        return;
      }
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
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <p>{confirming ? t("voucher.confirming") : t("common.loading")}</p>
      </div>
    );
  }
  if (!campaign) {
    return (
      <div className="min-h-screen bg-background">
        <TopHeader variant="default" />
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center text-center text-muted-foreground">
            <Ticket size={30} className="mb-3" />
            <p className="text-sm">{t("voucher.notFound")}</p>
          </div>
        </div>
      </div>
    );
  }

  const isActive = campaign.status === "active";
  const isDraw = campaign.isDraw !== false && campaign.type !== "voucher_sale";
  const isSelfUse =
    campaign.productKind === "self_use" ||
    poolStatus?.campaign?.productKind === "self_use";
  /** 独享抽奖：付款即扣费进奖池，无「先花 / 留余额 max」 */
  const isExclusiveDraw = isDraw && isSelfUse;
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
          ? "from-brand via-accent-brand to-background"
          : isSelfUse
            ? "from-slate-600 via-muted to-background"
            : "from-primary via-accent to-background"
      }`}
    >
      <TopHeader variant="default" />
      <div className="px-4 pt-4 pb-4 text-center text-white">
        <span className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full mb-2 bg-white/20">
          {isDraw
            ? isSelfUse
              ? t("productKind.self") + " · " + t("voucher.tag.draw")
              : t("voucher.tag.draw")
            : isSelfUse
              ? t("productKind.self")
              : t("voucher.tag.discount")}
        </span>
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-white/15">
          {isDraw ? (
            <Trophy size={28} />
          ) : isSelfUse ? (
            <Ticket size={28} />
          ) : (
            <Tag size={28} />
          )}
        </div>
        <h1 className="text-2xl font-bold text-balance">{campaign.name}</h1>
        <p className="text-white/80 text-sm mt-1">
          {isSelfUse && isDraw
            ? lang === "en"
              ? "Exclusive draw · pay first · 15% to prizes (no seller fee) · group redeem"
              : "独享抽奖 · 先付款 · 15%进小奖/大奖/服务费（无卖券奖）· 集团可核"
            : isSelfUse
              ? t("voucher.selfUseSubtitle")
              : isDraw
                ? t("voucher.subtitle")
                : t("voucher.discountSubtitle")}
        </p>
        {discountPercent > 0 && (
          <p className="text-white text-sm mt-2 font-semibold">
            {t("voucher.discountBanner", { pct: discountPercent })}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-1.5 mt-3">
          {isSelfUse ? (
            <>
              <TrustPill>{t("voucher.trust.pillGroupStores")}</TrustPill>
              <TrustPill>{t("voucher.trust.pillPaynow")}</TrustPill>
              <TrustPill>{t("voucher.trust.pillNoWithdraw")}</TrustPill>
              <TrustPill>{t("voucher.trust.pillSave")}</TrustPill>
            </>
          ) : (
            <>
              <TrustPill>{t("voucher.trust.pillNetwork")}</TrustPill>
              <TrustPill>{t("voucher.trust.pillWithdraw")}</TrustPill>
              <TrustPill>{t("voucher.trust.pillPaynow")}</TrustPill>
              <TrustPill>
                {isDraw ? t("voucher.trust.pillWin") : t("voucher.trust.pillSave")}
              </TrustPill>
            </>
          )}
        </div>
      </div>

      <div className="px-4 -mt-2 pb-8 space-y-3">
        {paidCancelled && !result && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/35 border border-amber-100 dark:border-amber-800/50 rounded-xl text-center text-xs text-amber-700 dark:text-amber-400">
            {t("voucher.payCancelled")}
          </div>
        )}

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
              <div className="mb-4 p-3 rounded-xl bg-muted/50 border border-border">
                <p className="text-[11px] font-semibold text-foreground/90 mb-2">
                  {t("voucher.trust.moneyTitle")}
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground">{t("voucher.trust.face")}</p>
                    <p className="text-sm font-bold text-foreground">
                      S${facePreview.toFixed(0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">{t("voucher.trust.pay")}</p>
                    <p className="text-sm font-bold text-[#1A6EFF]">
                      S${paidPreview.toFixed(0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">
                      {isDraw ? t("voucher.trust.credit") : t("voucher.trust.spendable")}
                    </p>
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      S${creditPreview.toFixed(0)}
                    </p>
                  </div>
                </div>
                {!isDraw && discountPercent > 0 && (
                  <p className="text-[10px] text-blue-700 dark:text-blue-400/80 mt-2 text-center">
                    {t("voucher.payGetFace", {
                      paid: paidPreview.toFixed(0),
                      face: facePreview.toFixed(0),
                      pct: discountPercent,
                    })}
                  </p>
                )}
                {!isDraw && discountPercent === 0 && (
                  <p className="text-[10px] text-muted-foreground mt-2 text-center">
                    {t("voucher.balanceEqFace")}
                  </p>
                )}
                {isDraw && (
                  <p className="text-[10px] text-muted-foreground mt-2 text-center">
                    {t("voucher.balanceEqPaid")}
                  </p>
                )}
              </div>

              <h3 className="text-sm font-semibold text-foreground mb-2">{t("voucher.selectTier")}</h3>
              <div className="mb-4">
                <VoucherTierSelector
                  selectedAmount={selectedAmount}
                  onSelect={setSelectedAmount}
                  enabledAmounts={poolStatus?.rules?.enabledTiers}
                />
              </div>

              {isDraw && tier && (
                <div className="mb-4">
                  <InstantPrizePreview
                    tier={tier}
                    selectedAmount={selectedAmount}
                    compareAmounts={
                      poolStatus?.rules?.enabledTiers?.length
                        ? poolStatus.rules.enabledTiers
                        : [50, 100, 200]
                    }
                  />
                </div>
              )}

              {/* 联合抽奖可「先花」；独享付款即扣费，不展示 max / 留余额 */}
              {isDraw && !isExclusiveDraw && (
                <div className="mb-3">
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    {t("voucher.spendNow")}
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">S$</span>
                    <input
                      type="number"
                      value={spendNow}
                      onChange={(e) => setSpendNow(e.target.value)}
                      placeholder={`max S$${(creditPreview * 0.8).toFixed(0)}`}
                      className="flex-1 h-10 px-3 rounded-lg border border-input bg-background text-base nums"
                    />
                    <span
                      className={`text-xs px-2 py-1 rounded shrink-0 ${
                        balancePreview >= creditPreview * 0.2
                          ? "bg-green-50 dark:bg-green-950/35 text-green-600"
                          : "bg-red-50 dark:bg-red-950/35 text-red-500"
                      }`}
                    >
                      {t("voucher.balanceAfter")}: S${balancePreview.toFixed(0)}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {t("voucher.minRemain")} S${(creditPreview * 0.2).toFixed(0)}
                  </p>
                </div>
              )}

              {isExclusiveDraw && (
                <p className="text-[10px] text-muted-foreground mb-3 text-center rounded-lg bg-muted/50 py-1.5 px-2">
                  {lang === "en"
                    ? "Pay now · fee funds prize pools · draw on purchase"
                    : "付款即参与 · 费用进奖池 · 购买当场抽奖"}
                </p>
              )}

              {isDraw && !isExclusiveDraw && selectedAmount < 100 && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mb-3 text-center bg-amber-50 dark:bg-amber-950/35 rounded-lg py-1.5">
                  {t("voucher.upgradeHint", { amount: "100" })}
                </p>
              )}

              {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

              <Button className="w-full" size="lg" onClick={handlePurchase} loading={submitting}>
                {isDraw
                  ? t("voucher.payDraw")
                  : t("voucher.payAmount", { amount: paidPreview.toFixed(0) })}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                {t("voucher.paynowHint")}
              </p>
            </CardContent>
          </Card>
        ) : !result ? (
          <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-6 text-center">
            <Lock size={22} className="mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("draw.ended")}</p>
          </div>
        ) : null}

        {/* Long trust/network/withdraw copy folded here — focal point is the purchase above */}
        {!result && <RulesDrawer isSelfUse={isSelfUse} isDraw={isDraw} t={t} />}

        {result && (
          <Card className="border-green-200 bg-green-50 dark:bg-green-950/35 dark:border-emerald-900 dark:bg-emerald-950/40">
            <CardContent className="p-4 text-center space-y-2">
              <PartyPopper size={30} className="mx-auto text-emerald-600 dark:text-emerald-400" />
              <p className="text-lg font-semibold text-green-700 dark:text-green-400 dark:text-emerald-300">
                {result.instantPrize ? t("voucher.winCongrats") : t("voucher.buySuccess")}
              </p>
              {result.instantPrize && (
                <p className="text-xl font-bold text-green-700 dark:text-green-400">
                  {result.instantPrize?.icon} {result.instantPrize?.name}
                </p>
              )}

              <div className="my-3 p-3 bg-card rounded-xl border border-green-100 dark:border-green-800/50">
                <p className="text-[10px] text-muted-foreground">{t("voucher.success.balance")}</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  S${result.voucher?.balanceSgd}
                </p>
                {result.instantPrize && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 font-medium">
                    {result.instantPrize.icon} {result.instantPrize.name}
                    {lang === "en"
                      ? " · added to spendable balance"
                      : " · 已加入可花余额"}
                  </p>
                )}
                {result.voucher?.paidSgd != null && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {t("voucher.paid")} S${result.voucher.paidSgd}
                    {result.voucher?.amountSgd
                      ? ` · ${t("balance.face")} S$${result.voucher.amountSgd}`
                      : ""}
                  </p>
                )}
                {result.voucher?.shortCode && (
                  <p className="text-lg font-bold font-mono tracking-[0.2em] text-[#1A6EFF] mt-2">
                    {result.voucher.shortCode}
                  </p>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground">{t("voucher.success.showHint")}</p>
              {result.voucher?.id && !result.voucher?.shortCode && (
                <p className="text-[10px] text-muted-foreground font-mono break-all">
                  {t("voucher.networkId")}: {result.voucher.id}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground">
                {isSelfUse || result.voucher?.productKind === "self_use"
                  ? t("voucher.selfUse.afterBuy")
                  : t("voucher.networkAfterBuy")}
              </p>

              <Link
                href="/balance"
                className="inline-block mt-2 px-5 py-2 bg-[#1A6EFF] text-white text-sm font-medium rounded-full"
              >
                {t("voucher.success.goBalance")}
              </Link>

              {result.grandPoolEntry ? (
                <>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 font-medium">
                    ✅ {t("voucher.enteredGrand")} — {t("voucher.weight")}:{" "}
                    {result.voucher?.drawWeight}
                  </p>

                  {!result.shareBoosted ? (
                    <div className="mt-2 p-3 bg-amber-100 dark:bg-amber-900/40 rounded-xl border border-amber-200">
                      <p className="text-sm font-semibold text-amber-800 mb-1">
                        🚀 {t("voucher.shareBoostTitle")}
                      </p>
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2">{t("voucher.shareBoostHint")}</p>
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
                <div className="mt-2 p-3 bg-muted rounded-xl">
                  <p className="text-xs text-muted-foreground">
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
        <div className="min-h-screen flex items-center justify-center text-muted-foreground">
          <p>…</p>
        </div>
      }
    >
      <VoucherDrawInner />
    </Suspense>
  );
}

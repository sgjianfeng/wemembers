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
  MapPin,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TopHeader } from "@/components/ui/TopHeader";
import { VoucherTierSelector } from "@/components/customer/VoucherTierSelector";
import { PoolDashboard } from "@/components/customer/PoolDashboard";
import { InstantPrizePreview } from "@/components/customer/InstantPrizePreview";
import { WinBalanceWheel } from "@/components/customer/WinBalanceWheel";
import { useLang } from "@/components/i18n/LanguageProvider";
import { resolveTier } from "@/lib/draw-v2";
import {
  activityBuyBackHref,
  parseActivityBuyContext,
} from "@/lib/activity-buy-context";

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
  const [confirmAttempt, setConfirmAttempt] = useState(0);
  const sellerId = searchParams.get("seller") || "";
  const paidFlag = searchParams.get("paid");
  const sessionIdParam = searchParams.get("session_id");
  /** 结账 join 入口带来的推荐档 */
  const amountFromJoin = Number(searchParams.get("amount") || 0);
  /** 从国庆 / 门店货架进入：保持活动语境 */
  const buyCtx = parseActivityBuyContext(searchParams);
  const fromNdp = buyCtx.from === "ndp";
  const fromStore = buyCtx.from === "store" || buyCtx.from === "shop";
  const fromActivityShelf = fromNdp || fromStore;
  const ndpMin = buyCtx.minSpendSgd && buyCtx.minSpendSgd > 0 ? buyCtx.minSpendSgd : 120;
  const ndpGift = buyCtx.giftSgd && buyCtx.giftSgd > 0 ? buyCtx.giftSgd : 61;
  const activityBackHref = activityBuyBackHref(buyCtx);

  const refreshPool = useCallback(async () => {
    const poolRes = await fetch(`/api/campaign/pool-status?slug=${slug}`).then((r) =>
      r.json()
    );
    if (poolRes.data) {
      setCampaign(poolRes.data.campaign);
      setPoolStatus(poolRes.data);
      // 默认选中活动开放的最小面额；join 入口可带 amount=推荐档
      const tiers: number[] = poolRes.data.rules?.enabledTiers || [];
      if (tiers.length > 0) {
        setSelectedAmount((prev) => {
          if (prev > 0 && tiers.includes(prev)) return prev;
          if (amountFromJoin > 0 && tiers.includes(amountFromJoin)) {
            return amountFromJoin;
          }
          return Math.min(...tiers);
        });
      } else {
        setSelectedAmount((prev) =>
          prev > 0 ? prev : amountFromJoin > 0 ? amountFromJoin : 50
        );
      }
    }
  }, [slug, amountFromJoin]);

  useEffect(() => {
    async function load() {
      await refreshPool();
      setLoading(false);
    }
    load();
  }, [refreshPool]);

  // 支付回跳确认
  // - PayNow 回跳时可能尚未 paid → 短轮询（202/402）
  // - finally 始终 setConfirming(false)，避免 effect cleanup 把界面卡死
  useEffect(() => {
    if (paidFlag !== "1" || !sessionIdParam || result) return;

    let cancelled = false;
    setConfirming(true);
    setError("");

    const sleep = (ms: number) =>
      new Promise((r) => {
        setTimeout(r, ms);
      });

    (async () => {
      const maxTries = 24; // ~36s，覆盖 PayNow 到账延迟
      let lastErr = "";
      try {
        for (let i = 0; i < maxTries; i++) {
          if (cancelled) break;
          const res = await fetch("/api/voucher/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: sessionIdParam }),
            credentials: "same-origin",
          });
          const d = await res.json().catch(() => ({}));
          if (cancelled) break;

          if (res.ok && d.data) {
            setResult(d.data);
            // 先落确认态；奖池刷新失败不影响已购成功
            setConfirming(false);
            try {
              await refreshPool();
            } catch {
              /* ignore */
            }
            return;
          }

          if (
            res.status === 202 ||
            res.status === 402 ||
            d.code === "PAYMENT_PENDING"
          ) {
            lastErr = d.error || t("voucher.confirmPayFail");
            await sleep(1500);
            continue;
          }

          if (res.status === 401) {
            lastErr =
              t("voucher.confirmPayFail") +
              (lang === "en"
                ? " · please log in again"
                : " · 请重新登录后再打开此页");
            break;
          }

          lastErr = d.error || t("voucher.confirmPayFail");
          break;
        }
        if (!cancelled && !result) {
          setError(
            lastErr ||
              (lang === "en"
                ? "Payment is taking longer than expected. Tap retry."
                : "支付确认较慢，请点重试。若已扣款，稍后可在钱包查看。")
          );
        }
      } catch {
        if (!cancelled) {
          setError(
            lang === "en"
              ? "Network error while confirming. Tap retry."
              : "确认时网络异常，请点重试。若已扣款，请稍后打开钱包查看。"
          );
        }
      } finally {
        setConfirming(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidFlag, sessionIdParam, result, confirmAttempt]);

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
      // 把当前页语境带给 Stripe 回跳（from=ndp / 门店等），取消/成功后不丢活动上下文
      const returnQuery = searchParams.toString();
      const res = await fetch(`/api/voucher/checkout?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountSgd: selectedAmount,
          spendNowSgd: amt || 0,
          sellerId: sellerId || undefined,
          returnQuery,
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (confirming) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin mb-4" />
        <p className="text-sm font-medium text-foreground">
          {t("voucher.confirming")}
        </p>
        <p className="text-xs text-muted-foreground mt-2 max-w-xs leading-relaxed">
          {lang === "en"
            ? "PayNow may take a few seconds to settle. Please keep this page open."
            : "PayNow 到账可能需数秒，请勿关闭此页。若已扣款，确认后会自动显示购券结果。"}
        </p>
      </div>
    );
  }
  if (!campaign) {
    return (
      <div className="min-h-screen bg-background">
        <TopHeader variant="default" />
        <div className="flex flex-col items-center justify-center py-32 px-6 text-center">
          <Ticket size={30} className="mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {error || t("voucher.notFound")}
          </p>
          {paidFlag === "1" && sessionIdParam && (
            <Button
              className="mt-4 rounded-full"
              onClick={() => {
                setError("");
                setConfirmAttempt((n) => n + 1);
              }}
            >
              {lang === "en" ? "Retry confirm" : "重新确认支付"}
            </Button>
          )}
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

  const headerTitle = fromNdp
    ? lang === "en"
      ? "National Day buy"
      : "国庆购券"
    : fromStore
      ? lang === "en"
        ? "Store buy"
        : "门店购券"
      : undefined;

  return (
    <div
      className={`min-h-screen bg-gradient-to-b ${
        fromNdp
          ? "from-rose-700 via-rose-600 to-background"
          : fromStore
            ? isDraw
              ? "from-amber-600 via-orange-500 to-background"
              : "from-primary via-primary/80 to-background"
            : isDraw
              ? "from-brand via-accent-brand to-background"
              : isSelfUse
                ? "from-slate-600 via-muted to-background"
                : "from-primary via-accent to-background"
      }`}
    >
      <TopHeader
        variant="default"
        title={headerTitle}
        fallbackUrl={fromActivityShelf ? activityBackHref : "/"}
        preferFallback={fromActivityShelf}
      />

      {/* 活动/门店语境条：购券页不「跳戏」 */}
      {fromNdp && (
        <div className="px-4 pt-2">
          <Link
            href={activityBackHref}
            className="flex items-start gap-2.5 rounded-2xl border border-white/25 bg-white/12 backdrop-blur px-3 py-2.5 text-left text-white active:bg-white/18 transition-colors"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15">
              <PartyPopper size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-white/85">
                {lang === "en" ? "National Day activity" : "国庆满赠活动"}
              </span>
              <span className="block text-[13px] font-semibold leading-snug mt-0.5">
                {lang === "en"
                  ? `Buy here → redeem in store · spend ≥ S$${ndpMin} gets S$${ndpGift}`
                  : `在此购券 → 到店核销满 S$${ndpMin} 送 S$${ndpGift}`}
              </span>
              <span className="block text-[11px] text-white/80 mt-0.5">
                {lang === "en"
                  ? "Also joins grand prize countdown · tap to view activity"
                  : "同时参加大奖倒计时 · 点此返回活动页"}
              </span>
            </span>
          </Link>
        </div>
      )}

      {fromStore && (
        <div className="px-4 pt-2">
          <Link
            href={
              buyCtx.activityId
                ? `${activityBackHref}#activity-${buyCtx.activityId}`
                : activityBackHref
            }
            className="flex items-start gap-2.5 rounded-2xl border border-white/25 bg-white/12 backdrop-blur px-3 py-2.5 text-left text-white active:bg-white/18 transition-colors"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15">
              <MapPin size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-white/85">
                {lang === "en" ? "From store shelf" : "来自门店货架"}
              </span>
              <span className="block text-[13px] font-semibold leading-snug mt-0.5 truncate">
                {buyCtx.storeName ||
                  buyCtx.brandName ||
                  (lang === "en" ? "This store" : "本店")}
                {buyCtx.activityName ? ` · ${buyCtx.activityName}` : ""}
              </span>
              <span className="block text-[11px] text-white/80 mt-0.5">
                {lang === "en"
                  ? "Still in this activity · tap to return to store offers"
                  : "仍在本活动中 · 点此返回门店活动列表"}
              </span>
            </span>
          </Link>
        </div>
      )}

      <div className="px-4 pt-4 pb-4 text-center text-white">
        <span className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full mb-2 bg-white/20">
          {fromNdp
            ? lang === "en"
              ? "Activity purchase · Grand countdown"
              : "活动购券 · 大奖倒计时"
            : fromStore
              ? lang === "en"
                ? "Activity offer · buy here"
                : "活动权益 · 在此购买"
              : isDraw
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
          {fromNdp
            ? lang === "en"
              ? "Pay for a voucher · use in store · join the prize countdown"
              : "付款买券 · 到店使用 · 同步冲大奖倒计时"
            : fromStore
              ? lang === "en"
                ? "Pay for this offer · redeem at the store you came from"
                : "付款购买本权益 · 回刚才门店核销使用"
              : isSelfUse && isDraw
                ? lang === "en"
                  ? "Exclusive draw · pay first · 15% to prizes (no seller fee) · group redeem"
                  : "独享抽奖 · 先付款 · 15%进小奖/大奖/服务费（无卖券奖）· 集团可核"
                : isSelfUse
                  ? t("voucher.selfUseSubtitle")
                  : isDraw
                    ? t("voucher.subtitle")
                    : t("voucher.discountSubtitle")}
        </p>
        {discountPercent > 0 && !fromActivityShelf && (
          <p className="text-white text-sm mt-2 font-semibold">
            {t("voucher.discountBanner", { pct: discountPercent })}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-1.5 mt-3">
          {fromNdp ? (
            <>
              <TrustPill>
                {lang === "en"
                  ? `Spend S$${ndpMin} → S$${ndpGift}`
                  : `满 S$${ndpMin} 送 S$${ndpGift}`}
              </TrustPill>
              <TrustPill>{t("voucher.trust.pillPaynow")}</TrustPill>
              <TrustPill>
                {lang === "en" ? "Grand countdown" : "大奖倒计时"}
              </TrustPill>
              <TrustPill>
                {lang === "en" ? "In-store redeem" : "到店核销"}
              </TrustPill>
            </>
          ) : fromStore ? (
            <>
              {buyCtx.storeName && (
                <TrustPill>{buyCtx.storeName}</TrustPill>
              )}
              <TrustPill>{t("voucher.trust.pillPaynow")}</TrustPill>
              <TrustPill>
                {lang === "en" ? "In-store redeem" : "到店核销"}
              </TrustPill>
              {isDraw && (
                <TrustPill>
                  {lang === "en" ? "Prize countdown" : "大奖倒计时"}
                </TrustPill>
              )}
            </>
          ) : isSelfUse ? (
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
        {fromNdp && (
          <Card className="border-rose-200 bg-rose-50/95 shadow-sm dark:border-rose-900/40 dark:bg-rose-950/40">
            <CardContent className="p-3 text-[12px] leading-relaxed text-rose-950 dark:text-rose-100">
              <p className="font-semibold">
                {lang === "en"
                  ? "Still in National Day flow"
                  : "仍在国庆满赠流程中"}
              </p>
              <p className="mt-1 text-rose-900/85 dark:text-rose-100/85">
                {lang === "en"
                  ? `1) Buy this voucher · 2) Redeem in store · 3) When this bill ≥ S$${ndpMin}, get S$${ndpGift} gift for next visit · also joins the grand countdown below.`
                  : `① 在本页买券 ② 到店核销消费 ③ 本单满 S$${ndpMin} 自动送 S$${ndpGift} 下次用 · 下方奖池是同步参加的大奖倒计时。`}
              </p>
              {/* 独享购券仍可点转盘抽即时小奖（赢余额），非必做 */}
              {isExclusiveDraw && (
                <p className="mt-2 rounded-lg bg-white/50 dark:bg-black/20 px-2.5 py-1.5 text-[11px] text-rose-900/90 dark:text-rose-100/90">
                  {lang === "en"
                    ? "Optional after pay: tap “Win balance” for a small prize. Not required — grand countdown still counts."
                    : "付款后可选：点「赢余额」抽即时小奖（到店用）。不抽也没关系，大奖倒计时照样累计。"}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {fromStore && (
          <Card className="border-primary/20 bg-primary/5 shadow-sm">
            <CardContent className="p-3 text-[12px] leading-relaxed text-foreground">
              <p className="font-semibold">
                {lang === "en"
                  ? "Still in store activity flow"
                  : "仍在门店活动流程中"}
              </p>
              <p className="mt-1 text-muted-foreground">
                {lang === "en"
                  ? `Buying “${campaign.name}” for ${buyCtx.storeName || "this store"}. After payment, open wallet and redeem in store.`
                  : `正在为「${buyCtx.storeName || "本店"}」购买「${campaign.name}」。付款后在券包查看，到店核销即可。`}
              </p>
            </CardContent>
          </Card>
        )}

        {paidFlag === "1" && !result && error && (
          <Card className="border-amber-200 bg-amber-50 shadow-sm dark:border-amber-800/50 dark:bg-amber-950/30">
            <CardContent className="p-4 text-center">
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                {lang === "en" ? "Payment confirm issue" : "支付确认遇到问题"}
              </p>
              <p className="text-xs text-amber-900/90 dark:text-amber-200/90 mt-1 leading-relaxed">
                {error}
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center mt-3">
                <Button
                  className="rounded-full"
                  onClick={() => {
                    setError("");
                    setConfirmAttempt((n) => n + 1);
                  }}
                >
                  {lang === "en" ? "Retry confirm" : "重新确认支付"}
                </Button>
                <Link href="/wallet">
                  <Button variant="outline" className="rounded-full w-full">
                    {lang === "en" ? "Open wallet" : "打开钱包查看"}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {paidCancelled && !result && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/35 border border-amber-100 dark:border-amber-800/50 rounded-xl text-center text-xs text-amber-700 dark:text-amber-400">
            {t("voucher.payCancelled")}
          </div>
        )}

        {isDraw && poolStatus?.pool && (
          <div id="grand-countdown" className="scroll-mt-20">
            <PoolDashboard
              countdowns={poolStatus.countdown || []}
              instantPoolSgd={poolStatus.pool?.instantPool?.sgd || "0"}
              dailyAvgVelocity={poolStatus.velocity?.dailyAvgCents || 0}
            />
          </div>
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

              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-950 leading-relaxed">
                {t("voucher.paynowMobileTip")}
              </div>

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

              <div className="my-3 p-3 bg-card rounded-xl border border-green-100 dark:border-green-800/50">
                <p className="text-[10px] text-muted-foreground">{t("voucher.success.balance")}</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  S${result.voucher?.balanceSgd}
                </p>
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

              {/* 点一下赢余额：购券后 commit 即时小奖 */}
              {isDraw &&
                result.voucher?.id &&
                (result.instantPrizePending || result.instantPrize) && (
                  <WinBalanceWheel
                    lang={lang === "en" ? "en" : "zh"}
                    prize={
                      result.instantPrize
                        ? {
                            name: result.instantPrize.name,
                            icon: result.instantPrize.icon,
                            valueSgd: result.instantPrize.valueSgd,
                          }
                        : null
                    }
                    onClaim={
                      result.instantPrize
                        ? undefined
                        : async () => {
                            const res = await fetch("/api/voucher/claim-instant", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                voucherId: result.voucher.id,
                              }),
                            });
                            const j = await res.json();
                            if (!res.ok) {
                              throw new Error(j.error || "claim failed");
                            }
                            const p = j.data?.instantPrize;
                            if (!p) return null;
                            setResult((prev: any) =>
                              prev
                                ? {
                                    ...prev,
                                    instantPrize: p,
                                    instantPrizePending: false,
                                    voucher: {
                                      ...prev.voucher,
                                      balanceSgd:
                                        j.data.balanceSgd ?? prev.voucher?.balanceSgd,
                                    },
                                  }
                                : prev
                            );
                            return {
                              name: p.name,
                              icon: p.icon,
                              valueSgd: p.valueSgd,
                            };
                          }
                    }
                    onRevealed={(p) => {
                      setResult((prev: any) =>
                        prev
                          ? {
                              ...prev,
                              instantPrize: {
                                name: p.name,
                                icon: p.icon,
                                valueSgd: p.valueSgd,
                              },
                              instantPrizePending: false,
                            }
                          : prev
                      );
                    }}
                  />
                )}

              {/* 随时可看大奖进度 */}
              {isDraw && poolStatus?.pool && (
                <div id="grand-countdown" className="scroll-mt-20 text-left">
                  <p className="text-xs font-semibold text-foreground mb-2 text-center">
                    {lang === "en" ? "Grand prizes" : "抽大奖 · 进度"}
                  </p>
                  <PoolDashboard
                    countdowns={poolStatus.countdown || []}
                    instantPoolSgd={poolStatus.pool?.instantPool?.sgd || "0"}
                    dailyAvgVelocity={poolStatus.velocity?.dailyAvgCents || 0}
                  />
                </div>
              )}

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

              <div className="flex flex-wrap justify-center gap-2 mt-2">
                <Link
                  href="/wallet"
                  className="inline-block px-5 py-2 bg-[#1A6EFF] text-white text-sm font-medium rounded-full"
                >
                  {lang === "en" ? "Show QR to redeem" : "出示核销码"}
                </Link>
                <Link
                  href="/balance"
                  className="inline-block px-5 py-2 border border-border bg-card text-foreground text-sm font-medium rounded-full"
                >
                  {t("voucher.success.goBalance")}
                </Link>
              </div>

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

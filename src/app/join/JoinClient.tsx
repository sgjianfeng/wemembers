"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Trophy,
  Wallet,
  ChevronRight,
  LogIn,
  Sparkles,
  ScanLine,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TopHeader } from "@/components/ui/TopHeader";
import { useLang } from "@/components/i18n/LanguageProvider";
import { recommendFace } from "@/lib/recommend-face";
import { cn } from "@/lib/utils";

type JoinContext = {
  store: {
    id: string;
    name: string;
    slug: string;
    address: string | null;
    businessName: string | null;
    businessSlug: string | null;
    businessLogo: string | null;
  };
  campaign: {
    id: string;
    name: string;
    slug: string;
    type: string;
    productKind: string | null;
  } | null;
  tiers: number[];
  loggedIn: boolean;
  balanceSgd: number;
  balanceCents: number;
};

export function JoinClient({ storeId }: { storeId: string }) {
  const { lang } = useLang();
  const router = useRouter();
  const searchParams = useSearchParams();
  const billFromUrl = searchParams.get("bill") || searchParams.get("billSgd") || "";

  const [ctx, setCtx] = useState<JoinContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [billInput, setBillInput] = useState(billFromUrl);
  const [billConfirmed, setBillConfirmed] = useState(
    () => billFromUrl !== "" && !Number.isNaN(parseFloat(billFromUrl)) && parseFloat(billFromUrl) > 0
  );
  const [selectedFace, setSelectedFace] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/join/context?storeId=${encodeURIComponent(storeId)}`
      );
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || (lang === "en" ? "Load failed" : "加载失败"));
        setCtx(null);
        return;
      }
      setCtx(j.data);
    } catch {
      setError(lang === "en" ? "Network error" : "网络错误");
    } finally {
      setLoading(false);
    }
  }, [storeId, lang]);

  useEffect(() => {
    load();
  }, [load]);

  const billSgd = useMemo(() => {
    const n = parseFloat(billInput);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100) / 100;
  }, [billInput]);

  const rec = useMemo(() => {
    if (!ctx || !billConfirmed || billSgd <= 0) return null;
    return recommendFace({
      billSgd,
      balanceSgd: ctx.balanceSgd,
      tiers: ctx.tiers,
    });
  }, [ctx, billConfirmed, billSgd]);

  useEffect(() => {
    if (!rec) return;
    if (rec.recommended != null) {
      setSelectedFace(rec.recommended);
    } else if (rec.canCoverWithoutPurchase) {
      setSelectedFace(null);
    }
  }, [rec]);

  function confirmBill() {
    if (billSgd <= 0) {
      setError(lang === "en" ? "Enter bill amount" : "请输入本单金额");
      return;
    }
    setError("");
    setBillConfirmed(true);
    // 同步 URL，方便刷新/登录回跳
    const q = new URLSearchParams();
    q.set("storeId", storeId);
    q.set("bill", String(billSgd));
    router.replace(`/join?${q.toString()}`, { scroll: false });
  }

  const loginHref = useMemo(() => {
    const q = new URLSearchParams();
    q.set("storeId", storeId);
    if (billSgd > 0) q.set("bill", String(billSgd));
    const next = `/join?${q.toString()}`;
    return `/auth/login?redirect=${encodeURIComponent(next)}`;
  }, [storeId, billSgd]);

  function goPurchase() {
    if (!ctx?.campaign || !selectedFace) return;
    if (!ctx.loggedIn) {
      router.push(loginHref);
      return;
    }
    const q = new URLSearchParams();
    q.set("amount", String(selectedFace));
    q.set("bill", String(billSgd));
    q.set("storeId", storeId);
    // 与门店货架一致：购券页返回本店
    if (ctx.store.businessSlug && ctx.store.slug) {
      q.set("from", "store");
      q.set("store", `/shop/${ctx.store.businessSlug}/${ctx.store.slug}`);
      q.set("storeName", ctx.store.name);
      if (ctx.store.businessName) q.set("brand", ctx.store.businessName);
    } else {
      q.set("from", "join");
    }
    if (ctx.campaign.id) q.set("activity", ctx.campaign.id);
    if (ctx.campaign.slug) q.set("activitySlug", ctx.campaign.slug);
    if (ctx.campaign.name) q.set("activityName", ctx.campaign.name);
    router.push(`/voucher/${encodeURIComponent(ctx.campaign.slug)}?${q.toString()}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        {lang === "en" ? "Loading…" : "加载中…"}
      </div>
    );
  }

  const storeBackHref =
    ctx?.store.businessSlug && ctx.store.slug
      ? `/shop/${ctx.store.businessSlug}/${ctx.store.slug}`
      : "/";

  if (!ctx) {
    return (
      <div className="min-h-screen bg-background">
        <TopHeader variant="default" fallbackUrl="/" preferFallback />
        <p className="p-8 text-center text-sm text-muted-foreground">
          {error || (lang === "en" ? "Store not found" : "门店不存在")}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand via-accent-brand to-background pb-10">
      <TopHeader
        variant="default"
        title={lang === "en" ? "Join draw" : "结账参加大奖"}
        fallbackUrl={storeBackHref}
        preferFallback
      />
      <div className="px-4 pt-4 pb-2 text-center text-white">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-semibold">
          <Trophy size={12} />
          {lang === "en" ? "Join grand prize" : "结账参加大奖"}
        </span>
        <h1 className="text-xl font-bold mt-2">{ctx.store.name}</h1>
        {ctx.store.businessName && (
          <p className="text-white/75 text-xs mt-1">{ctx.store.businessName}</p>
        )}
        <p className="text-white/60 text-[11px] mt-2 max-w-xs mx-auto leading-relaxed">
          {billConfirmed && billSgd > 0
            ? lang === "en"
              ? `Bill S$${billSgd.toFixed(2)} from cashier code · confirm tiers below.`
              : `本单 S$${billSgd.toFixed(2)}（收银码已带入）· 下方确认推荐档`
            : lang === "en"
              ? "Enter this bill → we recommend a face value so your total balance covers it."
              : "填写本单金额 → 按已有余额推荐券面 → 购券（如需）后核销。"}
        </p>
      </div>

      <div className="px-4 space-y-3 mt-1">
        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* 登录状态 */}
        <Card>
          <CardContent className="p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Wallet size={18} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {ctx.loggedIn
                    ? lang === "en"
                      ? "Your balance here"
                      : "本店/本企业可用余额"
                    : lang === "en"
                      ? "Not logged in"
                      : "未登录"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ctx.loggedIn
                    ? `S$${ctx.balanceSgd.toFixed(2)}`
                    : lang === "en"
                      ? "Log in with phone to use balance & buy"
                      : "手机号登录后可算余额并购买"}
                </p>
              </div>
            </div>
            {!ctx.loggedIn && (
              <Link href={loginHref}>
                <Button size="sm" variant="outline" className="rounded-full gap-1">
                  <LogIn size={14} />
                  {lang === "en" ? "Login" : "登录"}
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        {!ctx.campaign ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground text-center">
              {lang === "en"
                ? "No active grand-prize draw at this store yet."
                : "本店暂无进行中的大奖抽奖活动。"}
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  {lang === "en" ? "Activity" : "活动"}
                </p>
                <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles size={16} className="text-amber-500" />
                  {ctx.campaign.name}
                </p>
              </CardContent>
            </Card>

            {/* 步骤 1：本单金额 */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {lang === "en" ? "1. This bill (S$)" : "1. 本单金额（新币）"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {lang === "en"
                      ? "Ask the cashier for the amount due"
                      : "问收银要本单应付金额"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    placeholder={lang === "en" ? "e.g. 68" : "例如 68"}
                    value={billInput}
                    onChange={(e) => {
                      setBillInput(e.target.value);
                      setBillConfirmed(false);
                    }}
                    className="h-12 text-base"
                  />
                  <Button
                    type="button"
                    className="h-12 px-5 rounded-full shrink-0"
                    onClick={confirmBill}
                  >
                    {lang === "en" ? "Next" : "下一步"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 步骤 2：推荐 + 选档 */}
            {billConfirmed && rec && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {lang === "en" ? "2. Cover this bill" : "2. 抵本单"}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      {lang === "en"
                        ? `Bill S$${rec.billSgd.toFixed(2)} · Balance S$${rec.balanceSgd.toFixed(2)} · Still need S$${rec.needSgd.toFixed(2)}`
                        : `本单 S$${rec.billSgd.toFixed(2)} · 已有 S$${rec.balanceSgd.toFixed(2)} · 还差 S$${rec.needSgd.toFixed(2)}`}
                    </p>
                  </div>

                  {rec.canCoverWithoutPurchase ? (
                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 p-3 space-y-2">
                      <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                        {lang === "en"
                          ? "Balance already covers this bill"
                          : "余额已够付本单"}
                      </p>
                      <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80">
                        {lang === "en"
                          ? "Show your voucher QR to the cashier to redeem. Optional: buy more to join the draw."
                          : "出示券码给店员核销即可。也可加购参加抽奖赢余额。"}
                      </p>
                      <Link href="/wallet">
                        <Button className="w-full rounded-full gap-1.5 mt-1">
                          <ScanLine size={16} />
                          {lang === "en" ? "Open wallet / QR" : "打开券包出示核销"}
                        </Button>
                      </Link>
                    </div>
                  ) : rec.affordable.length === 0 ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {lang === "en"
                        ? "No face tier covers this bill — ask staff for higher tiers."
                        : "当前档位都不够抵本单，请联系店员开放更高档。"}
                    </p>
                  ) : (
                    <>
                      <p className="text-[11px] text-muted-foreground">
                        {lang === "en"
                          ? "Pick a face value so balance + new voucher ≥ bill"
                          : "选一档，使「已有余额 + 新券面」≥ 本单"}
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {ctx.tiers.map((face) => {
                          const ok = rec.affordable.includes(face);
                          const isRec = rec.recommended === face;
                          const active = selectedFace === face;
                          return (
                            <button
                              key={face}
                              type="button"
                              disabled={!ok}
                              onClick={() => ok && setSelectedFace(face)}
                              className={cn(
                                "relative rounded-2xl border p-3 text-center transition-all active:scale-[0.97]",
                                !ok &&
                                  "opacity-40 border-border bg-muted/40 cursor-not-allowed",
                                ok &&
                                  !active &&
                                  "border-border bg-card hover:border-primary/40",
                                active &&
                                  "border-primary bg-primary/10 ring-2 ring-primary/30"
                              )}
                            >
                              {isRec && (
                                <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground whitespace-nowrap">
                                  {lang === "en" ? "Suggested" : "推荐"}
                                </span>
                              )}
                              <p className="text-base font-bold text-foreground">
                                S${face}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {!ok
                                  ? lang === "en"
                                    ? "Too low"
                                    : "不够"
                                  : isRec && rec.recommendedStrictGreater
                                    ? lang === "en"
                                      ? "Best fit"
                                      : "刚好多一点"
                                    : lang === "en"
                                      ? "OK"
                                      : "可抵"}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                      <Button
                        className="w-full rounded-full h-12 gap-1"
                        disabled={!selectedFace}
                        onClick={goPurchase}
                      >
                        {ctx.loggedIn
                          ? lang === "en"
                            ? `Buy S$${selectedFace ?? "—"} & join`
                            : `购买 S$${selectedFace ?? "—"} 并参加`
                          : lang === "en"
                            ? "Log in to buy"
                            : "登录后购买"}
                        <ChevronRight size={16} />
                      </Button>
                      <p className="text-[10px] text-center text-muted-foreground leading-relaxed">
                        {lang === "en"
                          ? "After pay: spin for balance, show QR to redeem this bill."
                          : "付款后可转余额；再出示券码给店员核销本单。"}
                      </p>
                    </>
                  )}

                  {/* 已够付时仍可加购 */}
                  {rec.canCoverWithoutPurchase && ctx.tiers.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-[11px] text-muted-foreground mb-2">
                        {lang === "en"
                          ? "Optional add-on for the draw"
                          : "可选：加购参加抽奖"}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {ctx.tiers.map((face) => (
                          <button
                            key={face}
                            type="button"
                            onClick={() => setSelectedFace(face)}
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-xs font-medium",
                              selectedFace === face
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-foreground"
                            )}
                          >
                            S${face}
                          </button>
                        ))}
                      </div>
                      {selectedFace != null && (
                        <Button
                          variant="outline"
                          className="w-full rounded-full mt-2"
                          onClick={goPurchase}
                        >
                          {lang === "en"
                            ? `Add S$${selectedFace}`
                            : `加购 S$${selectedFace}`}
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {ctx.campaign && (
              <Link
                href={`/voucher/${encodeURIComponent(ctx.campaign.slug)}`}
                className="block text-center text-[11px] text-white/80 underline-offset-2 hover:underline py-2"
              >
                {lang === "en"
                  ? "Open full activity page (prizes & rules)"
                  : "打开完整活动页（大奖进度与规则）"}
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}

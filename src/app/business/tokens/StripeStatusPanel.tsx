"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Building2,
} from "lucide-react";
import { StripeSetupButton } from "./StripeSetupButton";
import { useLang } from "@/components/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

export type StripeStatusSnapshot = {
  hasAccount: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

/**
 * 收款账户状态 · 折叠卡
 * - 已完全激活：默认收起，只看一行状态
 * - 未激活 / 进行中：默认展开，方便操作
 */
export function StripeStatusPanel({ initial }: { initial: StripeStatusSnapshot }) {
  const { t, lang } = useLang();
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState("");
  const [snap, setSnap] = useState(initial);

  const fullyReady = snap.chargesEnabled && snap.payoutsEnabled;
  const partial =
    snap.detailsSubmitted && snap.chargesEnabled && !snap.payoutsEnabled;
  // 已就绪默认折叠；未就绪默认展开
  const [open, setOpen] = useState(!fullyReady);

  async function checkStatus() {
    setChecking(true);
    setMsg("");
    try {
      const res = await fetch("/api/stripe/account", {
        method: "GET",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error || t("business.tokens.checkFail"));
        return;
      }
      if (!json.data) {
        setSnap({
          hasAccount: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
        });
        setMsg(t("business.tokens.checkNoAccount"));
        return;
      }
      const d = json.data;
      setSnap({
        hasAccount: true,
        chargesEnabled: !!d.chargesEnabled,
        payoutsEnabled: !!d.payoutsEnabled,
        detailsSubmitted: !!d.detailsSubmitted,
      });
      if (d.fullyReady) {
        setMsg(t("business.tokens.checkReady"));
      } else if (d.chargesEnabled && d.detailsSubmitted) {
        setMsg(t("business.tokens.checkPartial"));
      } else {
        setMsg(t("business.tokens.checkPending"));
      }
      router.refresh();
    } catch {
      setMsg(t("business.tokens.checkFail"));
    } finally {
      setChecking(false);
    }
  }

  const statusLabel = !snap.hasAccount
    ? lang === "en"
      ? "Not set up"
      : "未开通"
    : fullyReady
      ? t("business.tokens.stripeReady")
      : partial
        ? t("business.tokens.stripePartial")
        : t("business.tokens.stripePending");

  const statusTone = !snap.hasAccount
    ? "text-muted-foreground bg-muted"
    : fullyReady
      ? "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40"
      : partial
        ? "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40"
        : "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40";

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* 折叠头：始终可见 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left active:bg-muted/40 transition-colors"
        aria-expanded={open}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {t("tokens.distTitle", lang)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {t("business.tokens.stripeTitle", lang)}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full",
            statusTone
          )}
        >
          {statusLabel}
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {/* 状态说明 */}
          {!snap.hasAccount ? (
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                {t("business.tokens.stripeSetupHint")}
              </p>
              <StripeSetupButton label={t("business.tokens.stripeSetup")} />
            </div>
          ) : fullyReady ? (
            <div className="flex items-start gap-2">
              <span className="text-green-500 text-lg leading-none" aria-hidden>
                ✅
              </span>
              <div>
                <p className="text-sm text-green-700 dark:text-green-400 font-medium">
                  {t("business.tokens.stripeReady")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("business.tokens.stripeReadyDesc")}
                </p>
              </div>
            </div>
          ) : partial ? (
            <div className="flex items-start gap-2">
              <span className="text-blue-500 text-lg leading-none" aria-hidden>
                ⏳
              </span>
              <div>
                <p className="text-sm text-blue-700 dark:text-blue-400 font-medium">
                  {t("business.tokens.stripePartial")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("business.tokens.stripePartialDesc")}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <span className="text-amber-500 text-lg leading-none" aria-hidden>
                ⚠️
              </span>
              <div>
                <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                  {t("business.tokens.stripePending")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("business.tokens.stripePendingDesc")}
                </p>
              </div>
            </div>
          )}

          {snap.hasAccount && (
            <ul className="rounded-xl bg-muted/50 px-3 py-2.5 space-y-1.5 text-xs">
              <li className="flex items-center gap-2">
                <span aria-hidden>{snap.detailsSubmitted ? "✅" : "○"}</span>
                <span className="text-muted-foreground">
                  {t("business.tokens.flagDetails")}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden>{snap.chargesEnabled ? "✅" : "○"}</span>
                <span className="text-muted-foreground">
                  {t("business.tokens.flagCharges")}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden>{snap.payoutsEnabled ? "✅" : "○"}</span>
                <span className="text-muted-foreground">
                  {t("business.tokens.flagPayouts")}
                </span>
              </li>
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            {snap.hasAccount && (
              <button
                type="button"
                onClick={() => void checkStatus()}
                disabled={checking}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-border bg-card text-sm text-foreground font-medium disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${checking ? "animate-spin" : ""}`}
                  aria-hidden
                />
                {checking
                  ? t("business.tokens.checking")
                  : t("business.tokens.checkStatus")}
              </button>
            )}
            {snap.hasAccount && !fullyReady && (
              <StripeSetupButton
                label={
                  partial
                    ? t("business.tokens.stripeContinue")
                    : t("business.tokens.stripeSetup")
                }
              />
            )}
            {!snap.hasAccount && (
              <StripeSetupButton label={t("business.tokens.stripeSetup")} />
            )}
          </div>

          {msg && (
            <p
              className={`text-xs rounded-lg px-3 py-2 ${
                fullyReady
                  ? "bg-green-50 dark:bg-green-950/35 text-green-700 dark:text-green-400"
                  : partial
                    ? "bg-blue-50 dark:bg-blue-950/35 text-blue-800"
                    : "bg-muted/50 text-muted-foreground"
              }`}
            >
              {msg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2, Clock, AlertTriangle, Circle } from "lucide-react";
import { StripeSetupButton } from "./StripeSetupButton";
import { useLang } from "@/components/i18n/LanguageProvider";

export type StripeStatusSnapshot = {
  hasAccount: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

/**
 * 收款账户状态 +「检查状态」按钮（向 Stripe 拉最新状态并刷新页面）
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
      // re-render server parts (withdraw button etc.)
      router.refresh();
    } catch {
      setMsg(t("business.tokens.checkFail"));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Status headline */}
      {!snap.hasAccount ? (
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            {t("business.tokens.stripeSetupHint")}
          </p>
          <StripeSetupButton label={t("business.tokens.stripeSetup")} />
        </div>
      ) : fullyReady ? (
        <div className="flex items-start gap-2">
          <span className="text-green-500 text-lg leading-none">✅</span>
          <div>
            <p className="text-sm text-green-700 font-medium">
              {t("business.tokens.stripeReady")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("business.tokens.stripeReadyDesc")}
            </p>
          </div>
        </div>
      ) : partial ? (
        <div className="flex items-start gap-2">
          <span className="text-blue-500 text-lg leading-none">⏳</span>
          <div>
            <p className="text-sm text-blue-700 font-medium">
              {t("business.tokens.stripePartial")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("business.tokens.stripePartialDesc")}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <span className="text-amber-500 text-lg leading-none">⚠️</span>
          <div>
            <p className="text-sm text-amber-700 font-medium">
              {t("business.tokens.stripePending")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("business.tokens.stripePendingDesc")}
            </p>
          </div>
        </div>
      )}

      {/* Checklist — always clear, reduces misunderstanding */}
      {snap.hasAccount && (
        <ul className="rounded-xl bg-muted/50 px-3 py-2.5 space-y-1.5 text-xs">
          <li className="flex items-center gap-2">
            <span>{snap.detailsSubmitted ? "✅" : "○"}</span>
            <span className="text-muted-foreground">
              {t("business.tokens.flagDetails")}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span>{snap.chargesEnabled ? "✅" : "○"}</span>
            <span className="text-muted-foreground">
              {t("business.tokens.flagCharges")}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span>{snap.payoutsEnabled ? "✅" : "○"}</span>
            <span className="text-muted-foreground">
              {t("business.tokens.flagPayouts")}
            </span>
          </li>
        </ul>
      )}

      {/* Actions */}
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
              ? "bg-green-50 text-green-700"
              : partial
                ? "bg-blue-50 text-blue-800"
                : "bg-muted/50 text-muted-foreground"
          }`}
        >
          {msg}
          {lang === "zh" ? "" : ""}
        </p>
      )}
    </div>
  );
}

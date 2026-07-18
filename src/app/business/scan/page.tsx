"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useLang } from "@/components/i18n/LanguageProvider";

type Tab = "voucher" | "coupon";

export default function ScanPage() {
  const { t } = useLang();

  const [tab, setTab] = useState<Tab>("voucher");

  // ── Legacy coupon QR redeem ──
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    couponTitle?: string;
    value?: number;
    tokenBalance?: number;
    error?: string;
  } | null>(null);

  // ── V2 prepaid voucher redeem ──
  const [voucherId, setVoucherId] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [voucherInfo, setVoucherInfo] = useState<{
    id: string;
    balanceSgd: string;
    balanceCents: number;
    amountSgd: string;
    budgetPercent: number;
    campaignName: string;
    customerName: string;
    status: string;
  } | null>(null);
  const [redeemAmountSgd, setRedeemAmountSgd] = useState("");
  const [voucherResult, setVoucherResult] = useState<{
    ok: boolean;
    message: string;
    remaining?: string;
    income?: string;
    fee?: string;
  } | null>(null);

  async function handleCouponRedeem() {
    if (!code) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/business/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrCode: code.trim().toUpperCase() }),
      });
      const data = await res.json();
      setResult(data.data || { success: false, error: data.error || t("business.scan.failed") });
    } catch {
      setResult({ success: false, error: t("business.scan.networkError") });
    }
    setLoading(false);
  }

  function parseVoucherInput(raw: string): string {
    let s = raw.trim();
    // wmv:{id} payload from customer QR
    if (s.toLowerCase().startsWith("wmv:")) s = s.slice(4).trim();
    // pasted URL ...?id= or /voucher/ not used — strip query
    try {
      if (s.includes("://") || s.includes("?")) {
        const u = new URL(s, "https://local.invalid");
        const q = u.searchParams.get("id") || u.searchParams.get("voucherId");
        if (q) s = q;
      }
    } catch {
      /* ignore */
    }
    // last path segment if looks like cuid
    if (s.includes("/")) {
      const part = s.split("/").filter(Boolean).pop() || s;
      if (part.length > 10) s = part;
    }
    return s.trim();
  }

  async function lookupVoucher(rawId?: string) {
    const id = parseVoucherInput(rawId ?? voucherId);
    if (!id) return;
    setVoucherId(id);
    setLookupLoading(true);
    setVoucherInfo(null);
    setVoucherResult(null);
    try {
      const res = await fetch(`/api/voucher/lookup?id=${encodeURIComponent(id)}`);
      const json = await res.json();
      if (!res.ok) {
        setVoucherResult({ ok: false, message: json.error || t("scan.lookupFail") });
      } else {
        setVoucherInfo(json.data);
        setRedeemAmountSgd(json.data.balanceSgd);
      }
    } catch {
      setVoucherResult({ ok: false, message: t("business.scan.networkError") });
    }
    setLookupLoading(false);
  }

  async function redeemVoucher(full: boolean) {
    if (!voucherInfo) return;
    const amountSgd = full ? Number(voucherInfo.balanceSgd) : Number(redeemAmountSgd);
    if (!Number.isFinite(amountSgd) || amountSgd <= 0) {
      setVoucherResult({ ok: false, message: t("scan.invalidAmount") });
      return;
    }
    const amountCents = Math.round(amountSgd * 100);
    if (amountCents > voucherInfo.balanceCents) {
      setVoucherResult({ ok: false, message: t("scan.exceeds") });
      return;
    }

    setRedeemLoading(true);
    setVoucherResult(null);
    try {
      const res = await fetch("/api/voucher/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voucherId: voucherInfo.id, amountCents }),
      });
      const json = await res.json();
      if (!res.ok) {
        setVoucherResult({ ok: false, message: json.error || t("scan.fail") });
      } else {
        setVoucherResult({
          ok: true,
          message: t("scan.success"),
          remaining: json.data?.voucher?.remainingBalanceSgd,
          income: json.data?.usage?.storeIncomeSgd,
          fee: json.data?.usage?.feeSgd,
        });
        setVoucherInfo({
          ...voucherInfo,
          balanceSgd: json.data.voucher.remainingBalanceSgd,
          balanceCents: Math.round(Number(json.data.voucher.remainingBalanceSgd) * 100),
          status: json.data.voucher.status,
        });
        setRedeemAmountSgd(json.data.voucher.remainingBalanceSgd);
      }
    } catch {
      setVoucherResult({ ok: false, message: t("business.scan.networkError") });
    }
    setRedeemLoading(false);
  }

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100">
        <h1 className="text-lg font-semibold">{t("business.scan.title")}</h1>
        <p className="text-xs text-slate-400 mt-0.5">{t("scan.networkSubtitle")}</p>
      </div>

      <div className="px-4 mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("voucher")}
          className={`flex-1 h-9 rounded-full text-sm font-medium ${
            tab === "voucher" ? "bg-[#1A6EFF] text-white" : "bg-slate-100 text-slate-600"
          }`}
        >
          {t("scan.voucherTab")}
        </button>
        <button
          type="button"
          onClick={() => setTab("coupon")}
          className={`flex-1 h-9 rounded-full text-sm font-medium ${
            tab === "coupon" ? "bg-[#1A6EFF] text-white" : "bg-slate-100 text-slate-600"
          }`}
        >
          {t("scan.couponTab")}
        </button>
      </div>

      {tab === "voucher" && (
        <div className="px-4 mt-4 space-y-4">
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-sm text-slate-600">{t("scan.voucherHint")}</p>
            <Input
              placeholder={t("scan.voucherPlaceholder")}
              value={voucherId}
              onChange={(e) => setVoucherId(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (text) {
                  e.preventDefault();
                  const id = parseVoucherInput(text);
                  setVoucherId(id);
                  void lookupVoucher(id);
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && lookupVoucher()}
              className="font-mono text-sm"
            />
            <Button className="w-full" onClick={() => lookupVoucher()} loading={lookupLoading}>
              {t("scan.lookup")}
            </Button>
            <p className="text-[10px] text-slate-400 text-center">{t("scan.lookupHelp")}</p>
          </div>

          {voucherInfo && (
            <Card className="border-slate-100">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{voucherInfo.campaignName}</p>
                    <p className="text-xs text-slate-400">{voucherInfo.customerName || "—"}</p>
                  </div>
                  <Badge variant={voucherInfo.status === "active" ? "green" : "slate"} size="sm">
                    {voucherInfo.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-blue-50 rounded-lg p-2">
                    <p className="text-[10px] text-slate-400">{t("scan.balance")}</p>
                    <p className="text-lg font-bold text-blue-700">S${voucherInfo.balanceSgd}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2">
                    <p className="text-[10px] text-slate-400">{t("scan.face")}</p>
                    <p className="text-lg font-bold text-slate-800">S${voucherInfo.amountSgd}</p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  {t("scan.feeHint", {
                    pct: voucherInfo.budgetPercent,
                    rest: 100 - voucherInfo.budgetPercent,
                  })}
                </p>
                <Input
                  label={t("scan.amountLabel")}
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={redeemAmountSgd}
                  onChange={(e) => setRedeemAmountSgd(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    loading={redeemLoading}
                    onClick={() => redeemVoucher(false)}
                    disabled={voucherInfo.balanceCents <= 0}
                  >
                    {t("scan.partial")}
                  </Button>
                  <Button
                    loading={redeemLoading}
                    onClick={() => redeemVoucher(true)}
                    disabled={voucherInfo.balanceCents <= 0}
                  >
                    {t("scan.full")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {voucherResult && (
            <Card className={voucherResult.ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
              <CardContent className="p-4 text-center space-y-1">
                <p className="text-2xl">{voucherResult.ok ? "✅" : "❌"}</p>
                <p className={`text-sm font-medium ${voucherResult.ok ? "text-green-800" : "text-red-600"}`}>
                  {voucherResult.message}
                </p>
                {voucherResult.ok && (
                  <>
                    <p className="text-xs text-green-700">
                      {t("scan.income")} S${voucherResult.income} · {t("scan.fee")} S$
                      {voucherResult.fee}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t("scan.remaining")} S${voucherResult.remaining}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "coupon" && (
        <div className="px-4 mt-6">
          <div className="bg-slate-50 rounded-xl p-4 mb-6 text-center">
            <p className="text-4xl mb-3">📷</p>
            <p className="text-sm text-slate-500 mb-4">{t("business.scan.enterCode")}</p>
            <Input
              placeholder={t("business.scan.placeholder")}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="text-center text-lg font-mono tracking-widest"
              onKeyDown={(e) => e.key === "Enter" && handleCouponRedeem()}
            />
            <Button className="w-full mt-3" size="lg" onClick={handleCouponRedeem} loading={loading}>
              {t("business.scan.confirm")}
            </Button>
            <p className="text-[10px] text-slate-400 mt-2">{t("business.scan.tokenCost")}</p>
          </div>

          {result && (
            <Card className={result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
              <CardContent className="p-4 text-center">
                {result.success ? (
                  <>
                    <p className="text-3xl mb-2">✅</p>
                    <p className="text-lg font-semibold text-green-800">{t("business.scan.success")}</p>
                    <p className="text-sm text-green-700 mt-1">{result.couponTitle}</p>
                    <p className="text-2xl font-bold text-green-900 mt-2">S${result.value?.toFixed(0)}</p>
                    {result.tokenBalance !== undefined && (
                      <Badge variant="slate" className="mt-2">
                        {t("business.scan.tokenBalance", { tokens: String(result.tokenBalance) })}
                      </Badge>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-3xl mb-2">❌</p>
                    <p className="text-sm text-red-600">{result.error}</p>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <div className="mt-8 p-4 bg-slate-50 rounded-xl">
            <h3 className="text-xs font-semibold text-slate-500 mb-2">{t("business.scan.tips")}</h3>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• {t("business.scan.tip1")}</li>
              <li>• {t("business.scan.tip2")}</li>
              <li>• {t("business.scan.tip3")}</li>
              <li>• {t("business.scan.tip4")}</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

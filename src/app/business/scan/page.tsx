"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useLang } from "@/components/i18n/LanguageProvider";

export default function ScanPage() {
  const { t } = useLang();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; couponTitle?: string; value?: number; tokenBalance?: number; error?: string } | null>(null);

  async function handleRedeem() {
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

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100">
        <h1 className="text-lg font-semibold">{t("business.scan.title")}</h1>
        <p className="text-xs text-slate-400 mt-0.5">{t("business.scan.subtitle")}</p>
      </div>

      <div className="px-4 mt-6">
        {/* Manual code entry */}
        <div className="bg-slate-50 rounded-xl p-4 mb-6 text-center">
          <p className="text-4xl mb-3">📷</p>
          <p className="text-sm text-slate-500 mb-4">{t("business.scan.enterCode")}</p>
          <Input
            placeholder={t("business.scan.placeholder")}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="text-center text-lg font-mono tracking-widest"
            onKeyDown={(e) => e.key === "Enter" && handleRedeem()}
          />
          <Button className="w-full mt-3" size="lg" onClick={handleRedeem} loading={loading}>
            {t("business.scan.confirm")}
          </Button>
          <p className="text-[10px] text-slate-400 mt-2">{t("business.scan.tokenCost")}</p>
        </div>

        {/* Result */}
        {result && (
          <Card className={result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
            <CardContent className="p-4 text-center">
              {result.success ? (
                <>
                  <p className="text-3xl mb-2">✅</p>
                  <p className="text-lg font-semibold text-green-800">{t("business.scan.success")}</p>
                  <p className="text-sm text-green-700 mt-1">{result.couponTitle}</p>
                  <p className="text-2xl font-bold text-green-900 mt-2">¥{result.value?.toFixed(0)}</p>
                  {result.tokenBalance !== undefined && (
                    <Badge variant="slate" className="mt-2">{t("business.scan.tokenBalance", { tokens: String(result.tokenBalance) })}</Badge>
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

        {/* Tips */}
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
    </div>
  );
}

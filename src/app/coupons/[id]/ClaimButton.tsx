"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useLang } from "@/components/i18n/LanguageProvider";

export function ClaimButton({ couponId, pointsRequired, soldOut, expired }: {
  couponId: string; pointsRequired: number; soldOut: boolean; expired: boolean;
}) {
  const router = useRouter();
  const { t } = useLang();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; message?: string; error?: string; gift?: { type: string; data: any; message: string } } | null>(null);

  async function handleClaim() {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/coupons/${couponId}/claim`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const giftMsg = data.data?.gift?.message || "";
        setResult({ success: true, message: t("coupon.claim.success") + (giftMsg ? ` ${giftMsg}` : ""), gift: data.data?.gift });
        setTimeout(() => router.push("/wallet"), 1200);
      } else {
        setResult({ success: false, error: data.error || t("coupon.claim.failed") });
      }
    } catch {
      setResult({ success: false, error: t("coupon.claim.networkError") });
    }
    setLoading(false);
  }

  const disabled = soldOut || expired || loading;

  return (
    <div className="space-y-3">
      <Button
        className="w-full"
        size="lg"
        onClick={handleClaim}
        loading={loading}
        disabled={disabled}
      >
        {soldOut ? t("coupon.detail.soldOut") : expired ? t("coupon.detail.expired") : t("coupon.claim.button", { points: pointsRequired })}
      </Button>

      {result && (
        <div className={`text-center p-4 rounded-xl text-sm ${result.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
          {result.success ? result.message : result.error}
          {result.success && result.gift && (
            <div className="mt-2 pt-2 border-t border-green-200 flex items-center justify-center gap-2">
              <span className="text-xl">{result.gift.type === "points" ? "⭐" : result.gift.type === "lottery" ? result.gift.data.icon || "🎰" : result.gift.data.icon || "🎁"}</span>
              <span className="text-xs">{result.gift.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

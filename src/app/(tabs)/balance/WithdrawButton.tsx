"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useLang } from "@/components/i18n/LanguageProvider";

export function WithdrawButton({
  voucherId,
  balanceSgd,
  mode = "draw",
}: {
  voucherId: string;
  balanceSgd: string;
  /** kept for call-site compatibility; prefer useLang */
  lang?: string;
  /** draw = 5% with small pool; voucher = 2% no pool */
  mode?: "draw" | "voucher";
}) {
  const { t } = useLang();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const feeHint =
    mode === "voucher" ? t("balance.feeHintVoucher") : t("balance.feeHintDraw");

  async function handleWithdraw() {
    const ok = window.confirm(
      mode === "draw"
        ? t("balance.confirmDraw", { amount: balanceSgd, fee: feeHint })
        : t("balance.confirmVoucher", { amount: balanceSgd, fee: feeHint })
    );
    if (!ok) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/voucher/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voucherId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error || t("balance.withdrawFail"));
      } else {
        setMsg(
          t("balance.withdrawOk", {
            net: json.data.netSgd,
            fee: json.data.feeSgd,
          })
        );
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch {
      setMsg(t("balance.networkError"));
    }
    setLoading(false);
  }

  return (
    <div className="mt-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full text-xs"
        loading={loading}
        onClick={handleWithdraw}
      >
        {mode === "voucher" ? t("balance.withdrawVoucher") : t("balance.withdrawDraw")}
      </Button>
      {msg && <p className="text-[10px] text-slate-500 mt-1 text-center">{msg}</p>}
    </div>
  );
}

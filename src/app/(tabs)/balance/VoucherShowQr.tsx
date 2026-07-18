"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useLang } from "@/components/i18n/LanguageProvider";

export function VoucherShowQr({
  voucherId,
}: {
  voucherId: string;
  /** kept for call-site compatibility; prefer useLang */
  lang?: string;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <Button
        type="button"
        size="sm"
        className="w-full text-xs"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? t("balance.hideQr") : t("balance.showQr")}
      </Button>
      {open && (
        <div className="mt-3 p-3 bg-white rounded-xl border border-slate-100 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/voucher/qr?id=${encodeURIComponent(voucherId)}&size=260`}
            alt="Redeem QR"
            className="w-48 h-48 mx-auto"
          />
          <p className="text-[10px] text-slate-400 mt-2 font-mono break-all">{voucherId}</p>
          <p className="text-[10px] text-slate-500 mt-1">{t("balance.qrNetwork")}</p>
        </div>
      )}
    </div>
  );
}

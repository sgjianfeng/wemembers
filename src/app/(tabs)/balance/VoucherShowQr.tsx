"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useLang } from "@/components/i18n/LanguageProvider";

export function VoucherShowQr({
  voucherId,
  shortCode,
}: {
  voucherId: string;
  /** 6 位短核销码，店员可口播 */
  shortCode?: string | null;
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
        <div className="mt-3 p-3 bg-card rounded-xl border border-border text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/voucher/qr?id=${encodeURIComponent(voucherId)}&size=260`}
            alt="Redeem QR"
            className="w-48 h-48 mx-auto"
          />
          {shortCode ? (
            <>
              <p className="text-2xl font-bold font-mono tracking-[0.25em] text-[#1A6EFF] mt-3">
                {shortCode}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {t("balance.shortCodeHint")}
              </p>
            </>
          ) : (
            <p className="text-[10px] text-muted-foreground mt-2 font-mono break-all">
              {voucherId}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">{t("balance.qrNetwork")}</p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { useLang } from "@/components/i18n/LanguageProvider";

interface Props {
  slug: string;
  campaignName: string;
  sellerId?: string;
}

export function CampaignShare({ slug, campaignName, sellerId }: Props) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const buyUrl = useMemo(() => {
    if (!slug) return "";
    const base = `${origin}/voucher/${encodeURIComponent(slug)}`;
    return sellerId ? `${base}?seller=${encodeURIComponent(sellerId)}` : base;
  }, [origin, slug, sellerId]);

  const qrUrl = useMemo(() => {
    if (!slug) return "";
    const q = new URLSearchParams({ slug, size: "280" });
    if (sellerId) q.set("seller", sellerId);
    return `/api/campaign/qr?${q.toString()}`;
  }, [slug, sellerId]);

  const text = t("share.text", { name: campaignName, url: buyUrl });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(buyUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  function openWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  function openWeChatHint() {
    copyLink();
    alert(t("share.wechatAlert"));
  }

  function openInstagramHint() {
    copyLink();
    alert(t("share.igAlert"));
  }

  async function nativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: campaignName, text, url: buyUrl });
        return;
      } catch {
        /* user cancelled */
      }
    }
    copyLink();
  }

  if (!slug) return null;

  return (
    <Card className="border-slate-100">
      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t("share.title")}</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">{t("share.hint")}</p>
        </div>

        <div className="flex justify-center bg-white p-3 rounded-xl border border-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="Campaign QR" className="w-44 h-44" />
        </div>

        <p className="text-[10px] text-center text-slate-400 font-mono break-all px-1">
          {buyUrl || "…"}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={openWhatsApp}>
            WhatsApp
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={openWeChatHint}>
            {t("share.wechat")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={openInstagramHint}>
            Instagram
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={nativeShare}>
            {t("share.system")}
          </Button>
        </div>

        <Button type="button" className="w-full" size="sm" onClick={copyLink}>
          {copied ? t("share.copied") : t("share.copy")}
        </Button>

        <a
          href={qrUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs text-[#1A6EFF]"
        >
          {t("share.openPrint")}
        </a>
      </CardContent>
    </Card>
  );
}

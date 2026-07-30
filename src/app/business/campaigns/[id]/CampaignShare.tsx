"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { useLang } from "@/components/i18n/LanguageProvider";
import {
  buildCampaignPosterCopy,
  fillShareTemplate,
} from "@/lib/campaign-poster-copy";

interface Props {
  slug: string;
  campaignName: string;
  sellerId?: string;
  /** 活动 id，用于跳转台卡/分发打印页 */
  campaignId?: string;
  type?: string;
  endDate?: string | Date | null;
  rulesSnapshot?: string | null;
  voucherTiers?: string | null;
}

export function CampaignShare({
  slug,
  campaignName,
  sellerId,
  campaignId,
  type,
  endDate,
  rulesSnapshot,
  voucherTiers,
}: Props) {
  const { t, lang } = useLang();
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

  const posterShare = useMemo(() => {
    if (!type || !endDate) return null;
    return buildCampaignPosterCopy({
      type,
      name: campaignName,
      endDate,
      rulesSnapshot,
      voucherTiers,
      lang: lang === "en" ? "en" : "zh",
    });
  }, [type, endDate, campaignName, rulesSnapshot, voucherTiers, lang]);

  const text = posterShare
    ? fillShareTemplate(posterShare.shareTemplates[0], buyUrl)
    : t("share.text", { name: campaignName, url: buyUrl });

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
    <Card className="border-border">
      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("share.title")}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">{t("share.hint")}</p>
        </div>

        {/* white bg kept intentionally — QR codes need light-on-dark contrast to scan */}
        <div className="flex justify-center bg-card p-3 rounded-xl border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="Campaign QR" className="w-44 h-44" />
        </div>

        <p className="text-[10px] text-center text-muted-foreground font-mono break-all px-1">
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

        {campaignId ? (
          <a
            href={`/business/campaigns/${campaignId}/print`}
            className="block w-full text-center rounded-full bg-primary text-primary-foreground text-xs font-semibold py-2.5 active:scale-[0.98] transition-transform"
          >
            {lang === "en"
              ? "Print / PNG · sell points & distributors"
              : "打印/PNG · 卖点台卡与分发版"}
          </a>
        ) : (
          <a
            href={qrUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-xs text-primary"
          >
            {t("share.openPrint")}
          </a>
        )}
        {posterShare && (
          <p className="text-[11px] text-center font-medium text-foreground/80">
            {posterShare.benefitLine}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
          {lang === "en"
            ? "Activity card ≠ paper ticket (PT-). Distributor cards bind seller for commission."
            : "活动卡 ≠ 实体券 PT-。分发版绑定推广人/店员，核销后计佣。"}
        </p>
      </CardContent>
    </Card>
  );
}

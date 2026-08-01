"use client";

/**
 * 推广人 / 卖家侧复用活动广告导出（与商家打印页同一套文案 + PNG 引擎）
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  buildCampaignPosterCopy,
  fillShareTemplate,
} from "@/lib/campaign-poster-copy";
import {
  drawCampaignPosterPng,
  type CampaignPosterLayoutId,
} from "@/lib/campaign-poster-export";

export type SellerPosterCampaign = {
  name: string;
  slug: string;
  type: string;
  color?: string | null;
  endDate: string | Date;
  rulesSnapshot?: string | null;
  voucherTiers?: string | null;
  businessName?: string | null;
  businessLogo?: string | null;
};

export function SellerPosterActions({
  campaign,
  sellerId,
  sellerLabel,
  lang = "zh",
  origin,
}: {
  campaign: SellerPosterCampaign;
  sellerId: string;
  sellerLabel?: string;
  lang?: "zh" | "en";
  origin: string;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const buyUrl = useMemo(() => {
    const base = `${origin}/voucher/${encodeURIComponent(campaign.slug)}`;
    return `${base}?seller=${encodeURIComponent(sellerId)}`;
  }, [origin, campaign.slug, sellerId]);

  const copy = useMemo(
    () =>
      buildCampaignPosterCopy({
        type: campaign.type,
        name: campaign.name,
        endDate: campaign.endDate,
        rulesSnapshot: campaign.rulesSnapshot,
        voucherTiers: campaign.voucherTiers,
        lang,
      }),
    [campaign, lang]
  );

  const accent =
    campaign.color && /^#[0-9A-Fa-f]{6}$/.test(campaign.color)
      ? campaign.color
      : campaign.type === "lucky_draw_v2" || campaign.type === "lucky_draw"
        ? "#7C3AED"
        : "#E85D04";

  const distLabel =
    sellerLabel ||
    (lang === "en" ? "Promoter" : "推广");

  async function download(layout: CampaignPosterLayoutId) {
    setBusy(true);
    try {
      const q = new URLSearchParams({
        slug: campaign.slug,
        size: "640",
        format: "png",
        seller: sellerId,
      });
      await drawCampaignPosterPng({
        layout,
        campaignName: campaign.name,
        businessName: campaign.businessName || "Store",
        businessLogo: campaign.businessLogo || null,
        buyUrl,
        qrSrc: `/api/campaign/qr?${q.toString()}`,
        copy,
        distLabel,
        isDist: true,
        accent,
        surface:
          campaign.type === "lucky_draw_v2" || campaign.type === "lucky_draw"
            ? "dark"
            : "light",
        lang,
      });
    } catch (e) {
      console.error(e);
      alert(lang === "en" ? "Export failed" : "导出失败");
    }
    setBusy(false);
  }

  async function copyShare() {
    const text = fillShareTemplate(copy.shareTemplates[0], buyUrl);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert(text);
    }
  }

  return (
    <div className="space-y-2 pt-1 border-t border-border/60">
      <p className="text-[11px] font-medium text-foreground/90">
        {copy.benefitLine}
      </p>
      <p className="text-[10px] text-muted-foreground leading-snug">
        {copy.headline} · {copy.sub}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="text-[11px] h-8"
          disabled={busy}
          onClick={() => download("sticker")}
        >
          {busy
            ? "…"
            : lang === "en"
              ? "Social PNG"
              : "社交 PNG"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="text-[11px] h-8"
          disabled={busy}
          onClick={() => download("a4")}
        >
          {lang === "en" ? "A4 PNG" : "A4 PNG"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="text-[11px] h-8"
          disabled={busy}
          onClick={() => download("tent")}
        >
          {lang === "en" ? "Tent PNG" : "台卡 PNG"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="text-[11px] h-8"
          disabled={busy}
          onClick={() => download("vhd")}
        >
          {lang === "en" ? "Portrait HD" : "竖版招贴"}
        </Button>
        <Button
          type="button"
          size="sm"
          className="text-[11px] h-8"
          onClick={copyShare}
        >
          {copied
            ? lang === "en"
              ? "Copied"
              : "已复制"
            : lang === "en"
              ? "Copy pitch"
              : "复制卖点文案"}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { useLang } from "@/components/i18n/LanguageProvider";

interface SellerMe {
  eligible: boolean;
  kind: "business" | "promoter" | null;
  displayName: string | null;
  shareHint: string | null;
  userId: string;
  stats: {
    soldCount: number;
    faceTotalSgd: string;
    accruedCommissionSgd: string;
    paidOutCommissionSgd: string;
    availableSgd: string;
    frozenSgd: string;
  };
  recentSales: Array<{
    id: string;
    campaignName?: string;
    commissionSgd: string;
    usedSgd: string;
    balanceSgd: string;
    status: string;
  }>;
  commissionTxs: Array<{
    id: string;
    amountSgd: string;
    description: string;
  }>;
}

interface PromoCampaign {
  id: string;
  name: string;
  slug: string | null;
  type: string;
  businessName: string;
  isOwn: boolean;
  path: string;
}

export default function SellerPage() {
  const { t } = useLang();
  const [data, setData] = useState<SellerMe | null>(null);
  const [campaigns, setCampaigns] = useState<PromoCampaign[]>([]);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState("");
  const [qrSlug, setQrSlug] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    (async () => {
      const res = await fetch("/api/seller/me");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || t("seller.loading"));
        return;
      }
      setData(json.data);
      if (json.data.eligible) {
        const cr = await fetch("/api/seller/campaigns");
        const cj = await cr.json();
        if (cr.ok) setCampaigns(cj.data?.campaigns || []);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copyPath(path: string, id: string) {
    const url = `${origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      /* ignore */
    }
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/auth/login" className="text-sm text-[#1A6EFF] mt-2 inline-block">
          {t("seller.login")}
        </Link>
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-center text-sm text-slate-400">{t("seller.loading")}</div>;
  }

  const kindLabel =
    data.eligible
      ? data.kind === "business"
        ? t("seller.kind.business")
        : t("seller.kind.promoter")
      : t("seller.kind.none");

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <div className="px-4 py-4 border-b border-slate-100 bg-white">
        <h1 className="text-lg font-semibold">{t("seller.title")}</h1>
        <p className="text-xs text-slate-400 mt-0.5">{t("seller.subtitle")}</p>
      </div>

      <div className="px-4 mt-4 space-y-4 max-w-lg mx-auto">
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("seller.eligibility")}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  data.eligible ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {kindLabel}
              </span>
            </div>
            {data.displayName && (
              <p className="text-xs text-slate-500">{data.displayName}</p>
            )}
            {!data.eligible && (
              <div className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3 space-y-2">
                <p>{data.shareHint || t("seller.activateHint")}</p>
                <Link href="/promoter">
                  <Button size="sm" variant="outline" className="w-full">
                    {t("seller.goActivate")}
                  </Button>
                </Link>
              </div>
            )}
            {data.eligible && (
              <p className="text-[11px] text-slate-500 font-mono break-all">
                seller={data.userId}
              </p>
            )}
          </CardContent>
        </Card>

        {data.eligible && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <h2 className="text-sm font-semibold">{t("seller.promoSection")}</h2>
              <p className="text-[10px] text-slate-400">{t("seller.promoHint")}</p>
              {campaigns.length === 0 ? (
                <p className="text-xs text-slate-400">{t("seller.noCampaigns")}</p>
              ) : (
                campaigns.map((c) => {
                  const url = `${origin}${c.path}`;
                  const qrUrl = c.slug
                    ? `/api/campaign/qr?slug=${encodeURIComponent(c.slug)}&seller=${encodeURIComponent(data.userId)}&size=240`
                    : "";
                  const shareText = t("seller.shareText", { name: c.name, url });
                  return (
                    <div
                      key={c.id}
                      className="border border-slate-100 rounded-xl p-3 space-y-2 bg-white"
                    >
                      <div className="flex justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          <p className="text-[10px] text-slate-400">
                            {c.businessName}
                            {c.isOwn ? ` · ${t("seller.ownStore")}` : ""} ·{" "}
                            {c.type === "lucky_draw_v2"
                              ? t("seller.type.draw")
                              : t("seller.type.voucher")}
                          </p>
                        </div>
                      </div>
                      <p className="text-[10px] font-mono text-slate-500 break-all">{url}</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs"
                          onClick={() => copyPath(c.path, c.id)}
                        >
                          {copied === c.id ? t("seller.copied") : t("seller.copyLink")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs"
                          onClick={() => setQrSlug(qrSlug === c.slug ? null : c.slug)}
                          disabled={!c.slug}
                        >
                          {qrSlug === c.slug ? t("seller.hideQr") : t("seller.qr")}
                        </Button>
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1"
                        >
                          <Button size="sm" className="w-full text-xs" type="button">
                            {t("seller.whatsapp")}
                          </Button>
                        </a>
                      </div>
                      {qrSlug === c.slug && qrUrl && (
                        <div className="flex justify-center pt-1">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={qrUrl} alt="QR" className="w-40 h-40" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-slate-400">{t("seller.soldCount")}</p>
              <p className="text-lg font-bold">{data.stats.soldCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-slate-400">{t("seller.accrued")}</p>
              <p className="text-lg font-bold text-green-700">
                S${data.stats.accruedCommissionSgd}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-slate-400">{t("seller.paidOut")}</p>
              <p className="text-lg font-bold">S${data.stats.paidOutCommissionSgd}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-slate-400">{t("seller.wallet")}</p>
              <p className="text-sm font-bold">
                S${data.stats.availableSgd}{" "}
                <span className="text-amber-600 text-xs">/ {data.stats.frozenSgd}</span>
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4 space-y-2">
            <h2 className="text-sm font-semibold">{t("seller.recentSales")}</h2>
            {data.recentSales.length === 0 ? (
              <p className="text-xs text-slate-400">{t("seller.noSales")}</p>
            ) : (
              data.recentSales.map((s) => (
                <div
                  key={s.id}
                  className="flex justify-between text-xs border-b border-slate-50 py-2 gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{s.campaignName || "—"}</p>
                    <p className="text-slate-400">
                      {t("seller.usedBalance", {
                        used: s.usedSgd,
                        balance: s.balanceSgd,
                      })}
                    </p>
                  </div>
                  <p className="text-green-700 font-semibold shrink-0">+S${s.commissionSgd}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Link href="/business/tokens" className="flex-1">
            <Button variant="outline" className="w-full" size="sm">
              {t("seller.walletBtn")}
            </Button>
          </Link>
          <Link href="/promoter" className="flex-1">
            <Button variant="outline" className="w-full" size="sm">
              {t("seller.promoBtn")}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

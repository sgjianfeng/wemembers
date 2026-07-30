"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TopHeader } from "@/components/ui/TopHeader";
import Link from "next/link";
import { useLang } from "@/components/i18n/LanguageProvider";
import { SellerPosterActions } from "@/components/campaign/SellerPosterActions";
import { Copy, Check, Link2 } from "lucide-react";

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
  color?: string | null;
  endDate?: string;
  rulesSnapshot?: string | null;
  voucherTiers?: string | null;
  businessName: string;
  businessLogo?: string | null;
  isOwn: boolean;
  path: string;
}

export default function SellerPage() {
  const { t, lang } = useLang();
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

  async function copyText(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      /* ignore */
    }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-muted/50">
        <TopHeader fallbackUrl="/profile" />
        <div className="p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Link href="/auth/login" className="text-sm text-primary mt-2 inline-block">
            {t("seller.login")}
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-muted/50">
        <TopHeader fallbackUrl="/profile" />
        <div className="p-6 text-center text-sm text-muted-foreground">{t("seller.loading")}</div>
      </div>
    );
  }

  const kindLabel =
    data.eligible
      ? data.kind === "business"
        ? t("seller.kind.business")
        : t("seller.kind.promoter")
      : t("seller.kind.none");

  return (
    <div className="min-h-screen bg-muted/50 pb-10">
      <TopHeader fallbackUrl="/profile" title={t("seller.title")} />
      <div className="px-4 py-4 border-b border-border bg-card">
        <h1 className="text-lg font-semibold text-foreground">{t("seller.title")}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t("seller.subtitle")}</p>
      </div>

      <div className="px-4 mt-4 space-y-4 max-w-lg mx-auto">
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{t("seller.eligibility")}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  data.eligible
                    ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {kindLabel}
              </span>
            </div>
            {data.displayName && (
              <p className="text-xs text-muted-foreground">{data.displayName}</p>
            )}
            {!data.eligible && (
              <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 space-y-2">
                <p>{data.shareHint || t("seller.activateHint")}</p>
                <Link href="/promoter">
                  <Button size="sm" variant="outline" className="w-full active:scale-[0.97] transition-transform">
                    {t("seller.goActivate")}
                  </Button>
                </Link>
              </div>
            )}
            {data.eligible && (
              <button
                type="button"
                onClick={() => copyText(data.userId, "seller-id")}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors active:scale-[0.97]"
              >
                {copied === "seller-id" ? (
                  <Check size={13} className="text-green-600 dark:text-green-400" />
                ) : (
                  <Copy size={13} />
                )}
                {t("seller.myId")}
              </button>
            )}
          </CardContent>
        </Card>

        {data.eligible && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">{t("seller.promoSection")}</h2>
              <p className="text-[10px] text-muted-foreground">{t("seller.promoHint")}</p>
              {campaigns.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("seller.noCampaigns")}</p>
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
                      className="border border-border rounded-xl p-3 space-y-2 bg-card"
                    >
                      <div className="flex justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {c.businessName}
                            {c.isOwn ? ` · ${t("seller.ownStore")}` : ""} ·{" "}
                            {c.type === "lucky_draw_v2"
                              ? t("seller.type.draw")
                              : t("seller.type.voucher")}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyPath(c.path, c.id)}
                        className="w-full flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-2 text-left transition-colors hover:bg-muted active:scale-[0.98]"
                      >
                        <Link2 size={14} className="text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground truncate flex-1">
                          {t("seller.promoLink")}
                        </span>
                        {copied === c.id ? (
                          <Check size={14} className="text-green-600 dark:text-green-400 shrink-0" />
                        ) : (
                          <Copy size={14} className="text-muted-foreground shrink-0" />
                        )}
                      </button>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs active:scale-[0.97] transition-transform"
                          onClick={() => copyPath(c.path, c.id)}
                        >
                          {copied === c.id ? t("seller.copied") : t("seller.copyLink")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs active:scale-[0.97] transition-transform"
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
                          <Button size="sm" className="w-full text-xs active:scale-[0.97] transition-transform" type="button">
                            {t("seller.whatsapp")}
                          </Button>
                        </a>
                      </div>
                      {qrSlug === c.slug && qrUrl && (
                        <div className="flex justify-center pt-1">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={qrUrl} alt="QR" className="w-40 h-40 rounded-lg border border-border" />
                        </div>
                      )}
                      {c.slug && c.endDate && (
                        <SellerPosterActions
                          campaign={{
                            name: c.name,
                            slug: c.slug,
                            type: c.type,
                            color: c.color,
                            endDate: c.endDate,
                            rulesSnapshot: c.rulesSnapshot,
                            voucherTiers: c.voucherTiers,
                            businessName: c.businessName,
                            businessLogo: c.businessLogo,
                          }}
                          sellerId={data.userId}
                          sellerLabel={data.displayName || undefined}
                          lang={lang === "en" ? "en" : "zh"}
                          origin={origin}
                        />
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
              <p className="text-[10px] text-muted-foreground">{t("seller.soldCount")}</p>
              <p className="text-lg font-bold text-foreground nums">{data.stats.soldCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">{t("seller.accrued")}</p>
              <p className="text-lg font-bold text-green-700 dark:text-green-400 nums">
                S${data.stats.accruedCommissionSgd}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">{t("seller.paidOut")}</p>
              <p className="text-lg font-bold text-foreground nums">S${data.stats.paidOutCommissionSgd}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">{t("seller.wallet")}</p>
              <p className="text-sm font-bold text-foreground nums">
                S${data.stats.availableSgd}{" "}
                <span className="text-amber-600 dark:text-amber-400 text-xs">/ {data.stats.frozenSgd}</span>
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4 space-y-2">
            <h2 className="text-sm font-semibold text-foreground">{t("seller.recentSales")}</h2>
            {data.recentSales.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("seller.noSales")}</p>
            ) : (
              data.recentSales.map((s) => (
                <div
                  key={s.id}
                  className="flex justify-between text-xs border-b border-border py-2 gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{s.campaignName || "—"}</p>
                    <p className="text-muted-foreground">
                      {t("seller.usedBalance", {
                        used: s.usedSgd,
                        balance: s.balanceSgd,
                      })}
                    </p>
                  </div>
                  <p className="text-green-700 dark:text-green-400 font-semibold shrink-0 nums">+S${s.commissionSgd}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Link
            href={data.kind === "business" ? "/business/tokens" : "/balance"}
            className="flex-1"
          >
            <Button variant="outline" className="w-full active:scale-[0.97] transition-transform" size="sm">
              {t("seller.walletBtn")}
            </Button>
          </Link>
          <Link href="/promoter" className="flex-1">
            <Button variant="outline" className="w-full active:scale-[0.97] transition-transform" size="sm">
              {t("seller.promoBtn")}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

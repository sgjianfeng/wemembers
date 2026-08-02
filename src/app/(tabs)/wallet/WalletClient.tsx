"use client";

import { useState } from "react";
import Link from "next/link";
import { ActivityEntitlementCard } from "@/components/activity/ActivityEntitlementCard";
import type { ActivityBundle } from "@/lib/activity-entitlements";
import { buildCustomerActivityBundles } from "@/lib/activity-entitlements";
import { useLang } from "@/components/i18n/LanguageProvider";

export type WalletClaim = {
  id: string;
  status: string;
  qrCode: string;
  coupon: {
    title: string;
    valueCents: number;
    validUntil: string;
    businessName: string | null;
    campaignId: string | null;
    campaignName: string | null;
    campaignType: string | null;
  };
};

type TabKey = "available" | "used" | "expired";

export function WalletClient({
  lang: langProp,
  activeBundles,
  usedClaims,
  expiredClaims,
  availableClaimCount,
  activeEntitlementCount,
}: {
  lang: "zh" | "en";
  /** 可使用：与首页同一套 ActivityBundle */
  activeBundles: ActivityBundle[];
  usedClaims: WalletClaim[];
  expiredClaims: WalletClaim[];
  availableClaimCount: number;
  activeEntitlementCount: number;
}) {
  const { t, lang: hookLang } = useLang();
  const lang = langProp || (hookLang === "en" ? "en" : "zh");
  const zh = lang !== "en";
  const [tab, setTab] = useState<TabKey>("available");

  const usedBundles = buildCustomerActivityBundles({
    lang,
    claims: usedClaims.map((c) => ({
      id: c.id,
      status: c.status,
      qrCode: c.qrCode,
      campaignId: c.coupon.campaignId,
      campaignName: c.coupon.campaignName,
      campaignType: c.coupon.campaignType,
      businessName: c.coupon.businessName,
      title: c.coupon.title,
      valueCents: c.coupon.valueCents,
      validUntil: c.coupon.validUntil,
      href: null,
    })),
    draws: [],
  });

  const expiredBundles = buildCustomerActivityBundles({
    lang,
    claims: expiredClaims.map((c) => ({
      id: c.id,
      status: "expired",
      qrCode: c.qrCode,
      campaignId: c.coupon.campaignId,
      campaignName: c.coupon.campaignName,
      campaignType: c.coupon.campaignType,
      businessName: c.coupon.businessName,
      title: c.coupon.title,
      valueCents: c.coupon.valueCents,
      validUntil: c.coupon.validUntil,
      href: null,
    })),
    draws: [],
  });

  const tabs: { key: TabKey; label: string; count: number }[] = [
    {
      key: "available",
      label: t("wallet.available"),
      // 可使用 = 权益条数（赠券+抽奖+余额），与首页「项权益」一致
      count: activeEntitlementCount,
    },
    {
      key: "used",
      label: t("wallet.used"),
      count: usedClaims.length,
    },
    {
      key: "expired",
      label: t("wallet.expired"),
      count: expiredClaims.length,
    },
  ];

  const bundles =
    tab === "available"
      ? activeBundles
      : tab === "used"
        ? usedBundles
        : expiredBundles;

  const emptyKey =
    tab === "available"
      ? "wallet.noCoupons"
      : tab === "used"
        ? "wallet.noUsed"
        : "wallet.noExpired";

  return (
    <div className="pb-4">
      <div className="px-4 py-4 border-b border-border">
        <h1 className="text-lg font-semibold">{t("wallet.title")}</h1>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
          {zh
            ? "与首页一致：按活动分组 · 展开见赠送券 / 抽奖资格 / 预付余额"
            : "Same as home: by activity · expand gift / draw / prepaid"}
        </p>
        {tab === "available" && availableClaimCount === 0 && activeEntitlementCount > 0 && (
          <p className="text-[10px] text-muted-foreground mt-1">
            {zh
              ? "当前可使用以抽奖资格与余额为主；赠送抵扣券为 0"
              : "Active perks are mostly draw entries & balances"}
          </p>
        )}
      </div>

      <div className="px-4 py-3 flex gap-1 bg-card border-b border-slate-50 overflow-x-auto">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              tab === item.key
                ? "bg-[#1A6EFF] text-white"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {item.label} · {item.count}
          </button>
        ))}
      </div>

      <div className="px-4 mt-3 space-y-2.5">
        {bundles.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-4xl mb-2">🎫</p>
            <p className="text-sm">{t(emptyKey)}</p>
            {tab === "available" && (
              <Link
                href="/home"
                className="inline-block mt-3 text-xs font-semibold text-primary"
              >
                {zh ? "回首页看活动 →" : "Back to home activities →"}
              </Link>
            )}
          </div>
        ) : (
          bundles.map((b) => (
            <ActivityEntitlementCard
              key={b.key}
              bundle={b}
              lang={lang}
              mode="customer"
              defaultOpen={
                tab === "available" &&
                (b.tone === "ndp" ||
                  b.tone === "draw" ||
                  b.entitlements.length <= 3)
              }
            />
          ))
        )}
      </div>

      {tab === "available" && activeBundles.length > 0 && (
        <p className="px-4 mt-4 text-[10px] text-muted-foreground text-center leading-relaxed">
          {zh
            ? "点「预付余额」→ 余额页核销 · 点「大奖资格 / 看倒计时」→ 活动奖池"
            : "Prepaid → Balance · Draw entry / Countdown → prize pool"}
        </p>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
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

export type WalletDrawEntry = {
  id: string;
  campaignId: string;
  campaignName: string | null;
  businessName: string | null;
  drawWeight: number;
  shortCode: string | null;
  status: string;
  createdAt: string;
  /** gift path: paidCents=0 and marketing/free */
  isGiftEntry: boolean;
  amountCents: number;
  balanceCents: number;
};

type TabKey = "available" | "used" | "expired";

type ActivityGroup = {
  key: string;
  campaignId: string | null;
  title: string;
  businessName: string | null;
  claims: WalletClaim[];
  draws: WalletDrawEntry[];
};

function effectiveStatus(
  claim: WalletClaim,
  now: number
): "available" | "used" | "expired" {
  if (claim.status === "used" || claim.status === "gifted") return "used";
  if (claim.status === "expired") return "expired";
  if (new Date(claim.coupon.validUntil).getTime() < now) return "expired";
  return "available";
}

export function WalletClient({
  claims,
  drawEntries = [],
}: {
  claims: WalletClaim[];
  drawEntries?: WalletDrawEntry[];
}) {
  const { t, lang } = useLang();
  const [tab, setTab] = useState<TabKey>("available");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const dateLocale = lang === "en" ? "en-US" : "zh-CN";
  const zh = lang !== "en";
  const now = Date.now();

  const available = claims.filter((c) => effectiveStatus(c, now) === "available");
  const used = claims.filter((c) => effectiveStatus(c, now) === "used");
  const expired = claims.filter((c) => effectiveStatus(c, now) === "expired");

  const lists: Record<TabKey, WalletClaim[]> = {
    available,
    used,
    expired,
  };

  const emptyKeys: Record<TabKey, string> = {
    available: "wallet.noCoupons",
    used: "wallet.noUsed",
    expired: "wallet.noExpired",
  };

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "available", label: t("wallet.available"), count: available.length },
    { key: "used", label: t("wallet.used"), count: used.length },
    { key: "expired", label: t("wallet.expired"), count: expired.length },
  ];

  const list = lists[tab];

  /** 活动分组：有 campaign 的券 + 同 campaign 抽奖签 */
  const groups: ActivityGroup[] = useMemo(() => {
    const map = new Map<string, ActivityGroup>();

    for (const claim of list) {
      const cid = claim.coupon.campaignId;
      const key = cid || `solo-${claim.id}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          campaignId: cid,
          title:
            claim.coupon.campaignName ||
            claim.coupon.title ||
            (zh ? "优惠" : "Offer"),
          businessName: claim.coupon.businessName,
          claims: [],
          draws: [],
        });
      }
      map.get(key)!.claims.push(claim);
    }

    // 可用 Tab 才挂抽奖签；已用/过期不混入未开奖签
    if (tab === "available") {
      for (const d of drawEntries) {
        if (d.status !== "active") continue;
        const key = d.campaignId;
        if (!map.has(key)) {
          map.set(key, {
            key,
            campaignId: d.campaignId,
            title: d.campaignName || (zh ? "大奖活动" : "Grand draw"),
            businessName: d.businessName,
            claims: [],
            draws: [],
          });
        }
        // 避免重复
        const g = map.get(key)!;
        if (!g.draws.some((x) => x.id === d.id)) {
          g.draws.push(d);
        }
      }
    }

    // 有活动名的优先，组内多权益的优先展开感
    return Array.from(map.values()).sort((a, b) => {
      const score = (g: ActivityGroup) =>
        (g.campaignId ? 10 : 0) + g.claims.length + g.draws.length;
      return score(b) - score(a);
    });
  }, [list, drawEntries, tab, zh]);

  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function isOpen(g: ActivityGroup): boolean {
    if (expanded[g.key] !== undefined) return expanded[g.key];
    // 多权益默认展开；单张可收起
    return g.claims.length + g.draws.length > 1;
  }

  return (
    <div className="pb-4">
      <div className="px-4 py-4 border-b border-border">
        <h1 className="text-lg font-semibold">{t("wallet.title")}</h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {zh
            ? "与首页一致：活动分类 · 展开权益券（赠送 / 抽奖 / 使用）"
            : "Same as home: by activity · expand gift / draw / use"}
        </p>
      </div>
      <div className="px-4 py-3 flex gap-1 bg-card border-b border-slate-50 overflow-x-auto">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              item.key === tab
                ? "bg-[#1A6EFF] text-white"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {item.label} · {item.count}
          </button>
        ))}
      </div>
      <div className="px-4 mt-3 space-y-3">
        {groups.map((g) => {
          const open = isOpen(g);
          const entCount = g.claims.length + g.draws.length;
          const multi = entCount > 1 || Boolean(g.campaignId);

          if (!multi && g.claims.length === 1) {
            // 单张无活动：保持扁平卡片
            return (
              <ClaimCard
                key={g.claims[0].id}
                claim={g.claims[0]}
                tab={tab}
                dateLocale={dateLocale}
                zh={zh}
                t={t}
              />
            );
          }

          return (
            <Card
              key={g.key}
              className="border-l-4 border-l-[#E11D48] overflow-hidden"
            >
              <button
                type="button"
                className="w-full text-left p-3 flex items-start justify-between gap-2"
                onClick={() => toggle(g.key)}
              >
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">
                    {g.businessName || "—"}
                  </p>
                  <p className="text-base font-semibold text-foreground mt-0.5 truncate">
                    {g.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {zh
                      ? `${entCount} 项权益`
                      : `${entCount} entitlement${entCount > 1 ? "s" : ""}`}
                    {g.claims.some(
                      (c) => effectiveStatus(c, now) === "available"
                    ) &&
                      ` · ${zh ? "含可抵扣" : "spendable"}`}
                    {g.draws.length > 0 &&
                      ` · ${zh ? "含抽奖" : "draw"}`}
                  </p>
                </div>
                {open ? (
                  <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
                )}
              </button>
              {open && (
                <div className="px-3 pb-3 space-y-2 border-t border-dashed border-border pt-2">
                  {g.claims.map((claim) => (
                    <ClaimCard
                      key={claim.id}
                      claim={claim}
                      tab={tab}
                      dateLocale={dateLocale}
                      zh={zh}
                      t={t}
                      nested
                    />
                  ))}
                  {g.draws.map((d) => (
                    <DrawEntryCard
                      key={d.id}
                      entry={d}
                      zh={zh}
                      dateLocale={dateLocale}
                    />
                  ))}
                </div>
              )}
            </Card>
          );
        })}
        {groups.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-4xl mb-2">🎫</p>
            <p className="text-sm">{t(emptyKeys[tab])}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ClaimCard({
  claim,
  tab,
  dateLocale,
  zh,
  t,
  nested,
}: {
  claim: WalletClaim;
  tab: TabKey;
  dateLocale: string;
  zh: boolean;
  t: (k: string) => string;
  nested?: boolean;
}) {
  const isAvailable = tab === "available";
  const statusBadge =
    tab === "used"
      ? t("wallet.usedLabel")
      : tab === "expired"
        ? t("wallet.expiredLabel")
        : null;

  const inner = (
    <Card
      className={`border-l-4 transition-colors ${
        nested ? "border-l-[#FF6B35] shadow-none" : ""
      } ${
        isAvailable
          ? "border-l-[#FF6B35] hover:border-[#1A6EFF]"
          : "border-l-slate-200 opacity-80"
      }`}
    >
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div>
            {!nested && (
              <p className="text-xs text-muted-foreground">
                {claim.coupon.businessName}
              </p>
            )}
            {claim.coupon.campaignId && (
              <p className="text-[10px] font-medium text-rose-600/90 tracking-wide">
                {claim.coupon.title}
              </p>
            )}
            {!claim.coupon.campaignId && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {claim.coupon.title}
              </p>
            )}
            <p className="text-lg font-bold text-foreground mt-0.5 tabular-nums">
              S${(claim.coupon.valueCents / 100).toFixed(0)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {zh
                ? "有效至以本券为准（领取时已算好）"
                : "Valid-until on this perk is final"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium text-muted-foreground">
              {zh ? "有效至" : "Valid until"}
            </p>
            <p className="text-sm font-bold tabular-nums text-foreground">
              {new Date(claim.coupon.validUntil).toLocaleDateString(dateLocale)}
            </p>
            {isAvailable ? (
              <span className="inline-block mt-2 px-3 py-1 bg-[#1A6EFF] text-white text-xs rounded-full">
                {t("wallet.useNow")}
              </span>
            ) : statusBadge ? (
              <span className="inline-block mt-2 px-3 py-1 bg-muted text-muted-foreground text-xs rounded-full">
                {statusBadge}
              </span>
            ) : null}
          </div>
        </div>
        {isAvailable && (
          <div className="mt-2 pt-2 border-t border-dashed border-border flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground font-mono">
              {claim.qrCode}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {t("wallet.gift")}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return isAvailable ? (
    <Link href={`/redeem/${claim.id}`}>{inner}</Link>
  ) : (
    <div>{inner}</div>
  );
}

function DrawEntryCard({
  entry,
  zh,
  dateLocale,
}: {
  entry: WalletDrawEntry;
  zh: boolean;
  dateLocale: string;
}) {
  return (
    <Card className="border-l-4 border-l-violet-500 bg-violet-50/40">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-medium text-violet-700 uppercase tracking-wide">
              {entry.isGiftEntry
                ? zh
                  ? "赠送 · 大奖资格"
                  : "Gift · Grand draw"
                : zh
                  ? "购券 · 大奖资格"
                  : "Paid · Grand draw"}
            </p>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              {zh ? "1 次大奖抽奖机会" : "1 grand draw chance"}
            </p>
            {entry.isGiftEntry && (
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                {zh
                  ? "购券可获约 5 倍机会（优先权）"
                  : "Buy voucher for ~5× chance (priority)"}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-muted-foreground">
              {new Date(entry.createdAt).toLocaleDateString(dateLocale)}
            </p>
            {entry.shortCode && (
              <p className="font-mono text-xs mt-1">{entry.shortCode}</p>
            )}
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <Link
            href="/balance"
            className="text-xs font-medium text-[#1A6EFF] px-3 py-1 rounded-full bg-white border border-border"
          >
            {zh ? "看倒计时" : "Countdown"}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

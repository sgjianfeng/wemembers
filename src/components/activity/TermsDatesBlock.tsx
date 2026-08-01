"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { TermsDatesView } from "@/lib/validity";
import { cn } from "@/lib/utils";

/**
 * 统一四行：活动期 · 售卖期 · 核销怎么算 · 条款
 * 客户只再配合券上的一个「有效至」
 */
export function TermsDatesBlock({
  view,
  lang = "zh",
  /** 已发权益时的唯一主日期 */
  validUntil,
  validUntilHint,
  compact,
  defaultOpen,
  className,
}: {
  view: TermsDatesView;
  lang?: "zh" | "en";
  validUntil?: Date | string | null;
  /** 如「自领取日起 30 天」 */
  validUntilHint?: string | null;
  compact?: boolean;
  defaultOpen?: boolean;
  className?: string;
}) {
  const zh = lang !== "en";
  // compact 默认收起；显式 defaultOpen 优先
  const [open, setOpen] = useState(
    defaultOpen !== undefined ? defaultOpen : !compact
  );

  const activityPeriod = zh ? view.activityPeriodZh : view.activityPeriodEn;
  const salePeriod = zh ? view.salePeriodZh : view.salePeriodEn;
  const redeemRule = zh ? view.redeemRuleZh : view.redeemRuleEn;
  const activityTerms = zh ? view.activityTermsZh : view.activityTermsEn;
  const entitlementTerms = zh
    ? view.entitlementTermsZh
    : view.entitlementTermsEn;
  const storeScope = zh ? view.storeScopeZh : view.storeScopeEn;

  const validUntilDate = validUntil
    ? typeof validUntil === "string"
      ? new Date(validUntil)
      : validUntil
    : null;

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card overflow-hidden",
        className
      )}
    >
      {validUntilDate && !Number.isNaN(validUntilDate.getTime()) && (
        <div className="px-3 py-2.5 bg-emerald-50 border-b border-emerald-100">
          <p className="text-[10px] font-medium text-emerald-800/80 uppercase tracking-wide">
            {zh ? "有效至（以本券为准）" : "Valid until (this perk)"}
          </p>
          <p className="text-lg font-bold tabular-nums text-emerald-900 mt-0.5">
            {validUntilDate.toLocaleDateString(zh ? "zh-CN" : "en-SG", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
          {validUntilHint && (
            <p className="text-[11px] text-emerald-800/90 mt-0.5 leading-snug">
              {validUntilHint}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-xs font-semibold text-foreground">
          {zh ? "详细规则（点击展开）" : "Full rules (tap to expand)"}
        </span>
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-border pt-2">
          <Row
            label={zh ? "活动期" : "Activity"}
            value={activityPeriod}
            hint={
              zh
                ? "此期间可参与 / 领取；结束后停止新领"
                : "Join/claim only in this window"
            }
          />
          <Row
            label={zh ? "售卖期" : "Sale"}
            value={salePeriod}
            hint={
              zh ? "此期间可购买关联预付/抽奖券" : "When linked vouchers can be bought"
            }
          />
          <Row
            label={zh ? "核销怎么算" : "How long to use"}
            value={redeemRule}
            hint={
              zh
                ? "相对有效优先；仅双重保护时才与活动截止取较早"
                : "Relative days first; activity end only if dual protection"
            }
          />
          <Row
            label={zh ? "适用门店" : "Stores"}
            value={storeScope}
          />

          <div className="pt-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              {zh ? "活动条款" : "Activity terms"}
            </p>
            <ul className="mt-1 space-y-1">
              {activityTerms.map((t) => (
                <li
                  key={t}
                  className="text-[11px] text-muted-foreground leading-relaxed pl-2 border-l-2 border-slate-200"
                >
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              {zh ? "权益条款" : "Perk terms"}
            </p>
            <ul className="mt-1 space-y-1">
              {entitlementTerms.map((t) => (
                <li
                  key={t}
                  className="text-[11px] text-muted-foreground leading-relaxed pl-2 border-l-2 border-orange-200"
                >
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
      <p className="text-xs font-semibold text-foreground mt-0.5 leading-snug">
        {value}
      </p>
      {hint && (
        <p className="text-[10px] text-muted-foreground/80 mt-0.5">{hint}</p>
      )}
    </div>
  );
}

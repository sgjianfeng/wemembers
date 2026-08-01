"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TermsDatesBlock } from "@/components/activity/TermsDatesBlock";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { SingaporeFlagBackdrop } from "@/components/campaign/SingaporeFlagBackdrop";
import type { TermsDatesView } from "@/lib/validity";
import { SG_NDP_RED } from "@/lib/visual-templates";

type Props = {
  lang: "zh" | "en";
  from: "table" | "counter";
  campaign: {
    id: string;
    name: string;
    description: string | null;
    slug: string | null;
    businessName: string;
    businessLogo: string | null;
    startDate: string;
    endDate: string;
  };
  rules: {
    minSpendSgd: number;
    giftSgd: number;
    validDays: number;
    weightMultiple: number;
    dualProtection?: boolean;
  };
  termsView: TermsDatesView;
  latestValidUntil?: string | null;
  buyPath: string | null;
  isLoggedIn: boolean;
  /** 当前 session 是企业/店员（非顾客） */
  isBusinessSession?: boolean;
  businessSessionLabel?: string | null;
  customerPhone: string | null;
  myGiftCount: number;
  myDrawWeight: number;
  loginRedirect: string;
};

export function NdpLandingClient({
  lang,
  from,
  campaign,
  rules,
  termsView,
  latestValidUntil,
  buyPath,
  isLoggedIn,
  isBusinessSession = false,
  businessSessionLabel = null,
  customerPhone,
  myGiftCount,
  myDrawWeight,
  loginRedirect,
}: Props) {
  const zh = lang === "zh";
  const gift = rules.giftSgd.toFixed(0);
  const minSpend = rules.minSpendSgd.toFixed(0);
  const mult = Math.max(5, Math.round(rules.weightMultiple * 10) / 10);
  const endLabel = new Date(campaign.endDate).toLocaleDateString(
    zh ? "zh-CN" : "en-SG",
    { year: "numeric", month: "short", day: "numeric" }
  );

  const authQs = new URLSearchParams({
    tab: "customer",
    intent: "customer",
    redirect: loginRedirect,
  });
  const loginHref = `/auth/login?${authQs.toString()}`;
  const registerHref = `/auth/register?${authQs.toString()}`;
  const logoutThenCustomer = `/api/auth/logout?next=${encodeURIComponent(loginHref)}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 via-background to-background pb-16">
      {/* Hero · 国庆 / SG61 */}
      <div className="relative overflow-hidden text-white">
        <SingaporeFlagBackdrop
          red={SG_NDP_RED}
          className="absolute inset-0 min-h-full"
        />
        <div className="relative z-[1] px-4 pt-4 pb-6">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold tracking-wide text-white/95">
              {from === "table"
                ? zh
                  ? "桌边扫码 · 先注册再结账"
                  : "Table · register first"
                : zh
                  ? "前台扫码 · 结账领券"
                  : "Counter · claim at pay"}
            </p>
            <LanguageSwitcher variant="light" />
          </div>

          <div className="flex items-center gap-3 mt-4">
            {campaign.businessLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={campaign.businessLogo}
                alt=""
                className="w-12 h-12 rounded-xl bg-white object-contain p-0.5 border border-white/40"
              />
            ) : null}
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/90">
                SG{gift} · {zh ? "国庆满赠" : "National Day"}
              </p>
              <h1 className="text-2xl font-bold mt-0.5 leading-tight drop-shadow-sm">
                {campaign.name}
              </h1>
              <p className="text-sm text-white/90 mt-0.5 truncate">
                {campaign.businessName}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-white/15 backdrop-blur border border-white/25 px-4 py-3">
            <p className="text-[11px] text-white/85">
              {zh ? "本单满额即送" : "Spend & get"}
            </p>
            <p className="text-2xl font-bold tabular-nums mt-0.5">
              S${minSpend} → S${gift}
              <span className="ml-2 text-base font-semibold text-white/90">
                SG{gift}
              </span>
            </p>
            <p className="text-[11px] text-white/90 mt-1.5 leading-relaxed">
              {zh
                ? `赠券下次再用 · 领后 ${rules.validDays} 天有效 · 至 ${endLabel}`
                : `Use next visit · ${rules.validDays}d from claim · until ${endLabel}`}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-2 space-y-3 relative z-[1]">
        {/* 企业 session 隔离提示 */}
        {isBusinessSession && (
          <Card className="border-amber-300 bg-amber-50 shadow-sm">
            <CardContent className="p-4">
              <p className="font-semibold text-amber-950">
                {zh ? "当前是企业账号" : "Business account signed in"}
              </p>
              <p className="text-xs text-amber-900/90 mt-1 leading-relaxed">
                {zh
                  ? `${businessSessionLabel || "企业账号"}不能领取顾客赠券。请退出后，用顾客手机号登录。`
                  : `${businessSessionLabel || "This account"} cannot claim customer gifts. Sign out and use a customer mobile number.`}
              </p>
              <div className="flex flex-col gap-2 mt-3">
                <a href={logoutThenCustomer}>
                  <Button className="w-full rounded-full h-11">
                    {zh
                      ? "退出企业 · 以顾客身份继续"
                      : "Sign out · continue as customer"}
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 顾客已登录状态 */}
        {isLoggedIn && (
          <Card className="border-emerald-200 bg-emerald-50/90 shadow-sm">
            <CardContent className="p-3 text-sm">
              <p className="font-semibold text-emerald-900">
                {zh ? "已登录" : "Signed in"}
                {customerPhone ? ` · ${customerPhone}` : ""}
              </p>
              <p className="text-xs text-emerald-800/85 mt-1">
                {myGiftCount > 0
                  ? zh
                    ? `钱包里有 ${myGiftCount} 张 S$${gift} 赠送券`
                    : `${myGiftCount} × S$${gift} gift coupon(s) in wallet`
                  : zh
                    ? `结账满 S$${minSpend} 后发放 S$${gift} 赠券`
                    : `S$${gift} gift after spend ≥ S$${minSpend}`}
              </p>
              <Link
                href="/wallet"
                className="inline-block mt-2 text-xs font-semibold text-[#1A6EFF]"
              >
                {zh ? "打开我的钱包 →" : "Open wallet →"}
              </Link>
            </CardContent>
          </Card>
        )}

        {/* 主 CTA：注册（未登录且非企业 session） */}
        {!isLoggedIn && !isBusinessSession && (
          <Card className="border-[#1A6EFF]/30 shadow-md bg-card">
            <CardContent className="p-4">
              <p className="text-[10px] font-bold text-[#1A6EFF] uppercase tracking-wide">
                {zh ? "开始参加" : "Get started"}
              </p>
              <h2 className="text-lg font-bold text-foreground mt-0.5">
                {zh ? "用手机号注册 / 登录" : "Register or log in with mobile"}
              </h2>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                {zh
                  ? "权益记在您的账号。结账时出示手机号或本页即可领券。"
                  : "Rewards go to your account. Show your number or this page at the counter."}
              </p>
              <div className="flex gap-2 mt-3">
                <Link href={registerHref} className="flex-1">
                  <Button className="w-full rounded-full h-12 text-base font-semibold">
                    {zh ? "注册" : "Register"}
                  </Button>
                </Link>
                <Link href={loginHref} className="flex-1">
                  <Button
                    variant="outline"
                    className="w-full rounded-full h-12 text-base font-semibold"
                  >
                    {zh ? "登录" : "Log in"}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 怎么玩：白话三步 */}
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <h3 className="text-sm font-bold text-foreground">
              {zh ? "怎么参加" : "How to join"}
            </h3>
            <ol className="mt-2.5 space-y-2.5 text-sm text-foreground/90">
              <li className="flex gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-600 text-[11px] font-bold text-white">
                  1
                </span>
                <span>
                  {zh
                    ? "注册 / 登录（用手机号）"
                    : "Register or log in with mobile"}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-600 text-[11px] font-bold text-white">
                  2
                </span>
                <span>
                  {zh
                    ? `到店消费满 S$${minSpend}（购券或现金都可以）`
                    : `Spend S$${minSpend}+ in store (voucher or cash)`}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-600 text-[11px] font-bold text-white">
                  3
                </span>
                <span>
                  {zh
                    ? `前台确认后，S$${gift} 进钱包 · 下次再用`
                    : `Counter confirms → S$${gift} in wallet for next visit`}
                </span>
              </li>
            </ol>
          </CardContent>
        </Card>

        {/* 路径 A：购券 */}
        <Card className="border-l-4 border-l-[#1A6EFF] shadow-sm">
          <CardContent className="p-4 space-y-2">
            <p className="text-[10px] font-bold text-[#1A6EFF] uppercase tracking-wide">
              {zh ? "方式一 · 推荐" : "Option 1 · Recommended"}
            </p>
            <h2 className="text-base font-bold text-foreground">
              {zh ? "先买预付券再消费" : "Buy a store voucher first"}
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {zh
                ? `线上买券 → 到店核销。本单核销满 S$${minSpend} 自动送 S$${gift}。购券还可参加倒计时大奖（机会约是现金领券的 ${mult} 倍）。`
                : `Buy online → redeem in store. Redeem ≥ S$${minSpend} auto-gifts S$${gift}. Voucher path also joins the grand countdown (~${mult}× the cash-claim chance).`}
            </p>
            {buyPath ? (
              <Link
                href={
                  isLoggedIn
                    ? buyPath
                    : isBusinessSession
                      ? logoutThenCustomer
                      : loginHref
                }
              >
                <Button className="w-full rounded-full h-12 mt-1 text-base font-semibold">
                  {zh ? "去购券" : "Buy voucher"}
                </Button>
              </Link>
            ) : (
              <p className="text-xs text-amber-800 bg-amber-50 rounded-xl p-2.5 mt-1">
                {zh
                  ? "购券入口暂未配置，请到前台咨询购券。"
                  : "Buy link not set up yet — ask the counter."}
              </p>
            )}
          </CardContent>
        </Card>

        {/* 路径 B：现金 */}
        <Card className="border-l-4 border-l-rose-500 shadow-sm">
          <CardContent className="p-4 space-y-2">
            <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wide">
              {zh ? "方式二" : "Option 2"}
            </p>
            <h2 className="text-base font-bold text-foreground">
              {zh ? "正常结账 · 前台领赠券" : "Pay as usual · claim at counter"}
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {zh
                ? `付账后出示本页或手机号。店员确认小票 ≥ S$${minSpend} 后，发放 S$${gift} 赠券到您钱包（下次到店使用）。`
                : `After paying, show this page or your mobile. Staff confirms receipt ≥ S$${minSpend}, then S$${gift} lands in your wallet for next visit.`}
            </p>
            <div className="rounded-2xl bg-rose-50 border border-rose-100 p-3 mt-1">
              <p className="text-sm font-semibold text-rose-900">
                {from === "table"
                  ? zh
                    ? "吃完请到收银台办理"
                    : "Please go to the cashier after your meal"
                  : zh
                    ? "请让店员为您办理发券"
                    : "Ask staff to issue your gift"}
              </p>
              {isLoggedIn && customerPhone && (
                <p className="mt-2 text-lg font-bold tabular-nums text-foreground tracking-wide">
                  {customerPhone}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 详细规则：默认折叠 */}
        <TermsDatesBlock
          view={termsView}
          lang={lang}
          validUntil={latestValidUntil}
          validUntilHint={
            latestValidUntil
              ? zh
                ? `自领取起 ${rules.validDays} 天 · 以本券有效至为准`
                : `${rules.validDays} days from claim · this date is final`
              : zh
                ? `领取后钱包显示：自领取起 ${rules.validDays} 天`
                : `After claim, wallet shows claim + ${rules.validDays} days`
          }
          defaultOpen={false}
        />

        {campaign.description && (
          <p className="text-[11px] text-muted-foreground px-1 leading-relaxed">
            {campaign.description}
          </p>
        )}

        <p className="text-[10px] text-center text-muted-foreground pt-1 pb-2">
          {zh
            ? "细则以门店与系统记录为准 · WeMembers"
            : "Subject to store & system records · WeMembers"}
        </p>
      </div>
    </div>
  );
}

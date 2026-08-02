"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TopHeader } from "@/components/ui/TopHeader";
import { TermsDatesBlock } from "@/components/activity/TermsDatesBlock";
import { SingaporeCrescentStars } from "@/components/campaign/SingaporeFlagBackdrop";
import type { TermsDatesView } from "@/lib/validity";
import { SG_NDP_RED } from "@/lib/visual-templates";
import { resolveUploadUrl } from "@/lib/utils";
import { withActivityBuyContext } from "@/lib/activity-buy-context";

type Props = {
  lang: "zh" | "en";
  from: "table" | "counter";
  /** 从门店顾客页进入时回门店；否则首页/我的 */
  backHref?: string | null;
  storePath?: string | null;
  storeName?: string | null;
  campaign: {
    id: string;
    name: string;
    description: string | null;
    slug: string | null;
    /** 顾客可见品牌名（displayName），非公司注册名 */
    brandName: string;
    /** 参与门店名 */
    storeNames: string[];
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
  backHref = null,
  storePath = null,
  storeName = null,
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
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);
  /** 客户端再确认一次会话（SSR 与扫码进 Safari 后返回等场景） */
  const [loggedIn, setLoggedIn] = useState(isLoggedIn);
  const [bizSession, setBizSession] = useState(isBusinessSession);
  const [phoneLabel, setPhoneLabel] = useState(customerPhone);

  const gift = rules.giftSgd.toFixed(0);
  const minSpend = rules.minSpendSgd.toFixed(0);
  const mult = Math.max(5, Math.round(rules.weightMultiple * 10) / 10);
  const endLabel = new Date(campaign.endDate).toLocaleDateString(
    zh ? "zh-CN" : "en-SG",
    { year: "numeric", month: "short", day: "numeric" }
  );

  /** 顶栏登录：回到本活动页 */
  const headerAuthQs = new URLSearchParams({
    tab: "customer",
    intent: "customer",
    redirect: loginRedirect,
  });
  const headerLoginHref = `/auth/login?${headerAuthQs.toString()}`;

  /**
   * 购券入口：带 from=ndp，购券页保持国庆活动语境，不「跳戏」
   * 登录成功后仍回到带参数的购券 URL
   */
  const buyHref = withActivityBuyContext(buyPath, {
    from: "ndp",
    activityId: campaign.id,
    activitySlug: campaign.slug,
    activityName: campaign.name,
    brandName: campaign.brandName,
    storePath: storePath || undefined,
    storeName: storeName || undefined,
    ndpSlug: campaign.slug || campaign.id,
    ndpFrom: from,
    minSpendSgd: rules.minSpendSgd,
    giftSgd: rules.giftSgd,
  });

  const buyAuthQs = new URLSearchParams({
    tab: "customer",
    intent: "customer",
    redirect: buyHref || loginRedirect,
  });
  const buyLoginHref = `/auth/login?${buyAuthQs.toString()}`;
  const buyRegisterHref = `/auth/register?${buyAuthQs.toString()}`;
  const logoutThenBuy = `/api/auth/logout?next=${encodeURIComponent(buyLoginHref)}`;
  const logoutThenCustomer = `/api/auth/logout?next=${encodeURIComponent(headerLoginHref)}`;

  /** 顶栏返回：门店货架 > 已登录首页 > 落地 */
  const homeHref =
    backHref && backHref.startsWith("/")
      ? backHref
      : loggedIn
        ? "/home"
        : "/";

  // 挂载 / 回到前台时拉 /api/auth/me，避免「其实已登录仍弹登录」
  useEffect(() => {
    let cancelled = false;
    async function refreshSession() {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          setLoggedIn(false);
          setBizSession(false);
          setPhoneLabel(null);
          return;
        }
        const j = await res.json();
        const role = j.data?.role as string | undefined;
        if (role === "customer") {
          setLoggedIn(true);
          setBizSession(false);
          setPhoneLabel(
            typeof j.data?.phone === "string" ? j.data.phone : null
          );
        } else if (role === "business" || role === "staff") {
          setLoggedIn(false);
          setBizSession(true);
          setPhoneLabel(null);
        } else {
          setLoggedIn(false);
          setBizSession(false);
          setPhoneLabel(null);
        }
      } catch {
        /* 保持 SSR 初值 */
      }
    }
    void refreshSession();
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshSession();
    };
    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onVis);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Escape / body scroll lock for auth sheet
  useEffect(() => {
    if (!authOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAuthOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [authOpen]);

  function handleBuyClick() {
    if (!buyHref) return;
    if (loggedIn) {
      router.push(buyHref);
      return;
    }
    if (bizSession) {
      // 企业号不能购顾客券：先退出再走登录
      window.location.href = logoutThenBuy;
      return;
    }
    setAuthOpen(true);
  }

  const sessionChip = loggedIn ? (
    <Link
      href="/home"
      className="flex items-center gap-1 max-w-[7.5rem] text-left hover:opacity-90 transition-opacity"
      title={phoneLabel || (zh ? "已登录" : "Signed in")}
    >
      <span className="shrink-0 text-[9px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 border border-emerald-500/25">
        {zh ? "已登录" : "In"}
      </span>
      <span className="text-[11px] font-medium text-foreground truncate">
        {phoneLabel || (zh ? "我的" : "Me")}
      </span>
    </Link>
  ) : bizSession ? (
    <span
      className="text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 border border-amber-500/30"
      title={businessSessionLabel || undefined}
    >
      {zh ? "企业" : "Biz"}
    </span>
  ) : (
    <Link
      href={headerLoginHref}
      className="text-[11px] font-semibold text-primary hover:text-primary/80 px-2 py-1 rounded-full border border-border"
    >
      {zh ? "登录" : "Log in"}
    </Link>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 via-background to-background pb-16">
      <TopHeader
        variant="default"
        title={zh ? "国庆满赠" : "National Day"}
        fallbackUrl={homeHref}
        preferFallback
      >
        {sessionChip}
      </TopHeader>

      {/*
        Hero：整块国庆红（不用国旗半白底）
        品牌 displayName + 门店；右上角星月装饰（不挡 logo）
      */}
      <div
        className="relative overflow-hidden text-white"
        style={{ backgroundColor: SG_NDP_RED }}
      >
        {/*
          星月：固定右上角小徽章（约 56px），不进文档流、不挡文案。
          用 inline 尺寸避免 % 宽高在 absolute 容器里被撑大。
        */}
        <div
          className="pointer-events-none absolute right-2.5 top-2.5 z-0 opacity-70"
          style={{ width: 56, height: 56 }}
          aria-hidden
        >
          <SingaporeCrescentStars
            red={SG_NDP_RED}
            size={56}
            className="block"
          />
        </div>

        <div className="relative z-[1] px-4 pt-3 pb-5">
          <p className="text-[11px] font-semibold tracking-wide text-white/95 pr-16">
            {from === "table"
              ? zh
                ? "桌边扫码 · 结账满额即送"
                : "Table · spend & get"
              : zh
                ? "前台扫码 · 结账领券"
                : "Counter · claim at pay"}
          </p>

          <div className="flex items-center gap-3 mt-3 pr-14">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-white/40">
              {campaign.businessLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={
                    resolveUploadUrl(campaign.businessLogo) ||
                    campaign.businessLogo
                  }
                  alt={campaign.brandName || ""}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="grid h-full w-full place-items-center bg-white/15 text-lg font-bold">
                  {(campaign.brandName || "M").slice(0, 1)}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/90">
                SG{gift} · {zh ? "国庆满赠" : "National Day"}
              </p>
              <h1 className="text-xl font-bold mt-0.5 leading-snug truncate">
                {campaign.brandName || campaign.name}
              </h1>
              {campaign.storeNames?.length > 0 ? (
                <p className="text-[12px] text-white/90 mt-0.5 truncate">
                  {campaign.storeNames.slice(0, 2).join(" · ")}
                </p>
              ) : null}
            </div>
          </div>

          {/* 实色底，避免星月透过半透明卡「盖住」满赠数字 */}
          <div className="mt-3 rounded-2xl bg-white/18 border border-white/30 px-4 py-3 backdrop-blur-[2px] shadow-sm">
            <p className="text-[11px] text-white/90">{campaign.name}</p>
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
        {/* 企业 session 隔离提示（仅企业号时） */}
        {bizSession && (
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

        {/* 已登录：轻量状态（有赠券时更有用） */}
        {loggedIn && myGiftCount > 0 && (
          <Card className="border-emerald-200 bg-emerald-50/90 shadow-sm">
            <CardContent className="p-3 text-sm">
              <p className="font-semibold text-emerald-900">
                {zh
                  ? `钱包里有 ${myGiftCount} 张 S$${gift} 赠送券`
                  : `${myGiftCount} × S$${gift} gift coupon(s) in wallet`}
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

        {/* 路径 A：购券（主 CTA，未登录时弹窗） */}
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
            {buyHref ? (
              <Button
                type="button"
                onClick={handleBuyClick}
                className="w-full rounded-full h-12 mt-1 text-base font-semibold"
              >
                {zh ? "去购券" : "Buy voucher"}
              </Button>
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
              {loggedIn && phoneLabel && (
                <p className="mt-2 text-lg font-bold tabular-nums text-foreground tracking-wide">
                  {phoneLabel}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 怎么玩：白话三步（不先逼注册） */}
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
                    ? `购券或到店消费，满 S$${minSpend}`
                    : `Buy a voucher or spend S$${minSpend}+ in store`}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-600 text-[11px] font-bold text-white">
                  2
                </span>
                <span>
                  {zh
                    ? "前台确认后，赠券进钱包"
                    : "Counter confirms → gift lands in wallet"}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-600 text-[11px] font-bold text-white">
                  3
                </span>
                <span>
                  {zh
                    ? `S$${gift} 下次再用 · 领后 ${rules.validDays} 天有效`
                    : `S$${gift} next visit · ${rules.validDays} days from claim`}
                </span>
              </li>
            </ol>
          </CardContent>
        </Card>

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

      {/* 购券前：注册 / 登录弹窗 */}
      {authOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ndp-auth-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label={zh ? "关闭" : "Close"}
            onClick={() => setAuthOpen(false)}
          />
          <div className="relative z-[1] w-full max-w-sm mx-auto rounded-t-3xl sm:rounded-3xl bg-card border border-border shadow-xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-200">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted sm:hidden" />
            <p className="text-[10px] font-bold text-[#1A6EFF] uppercase tracking-wide">
              {zh ? "继续购券" : "Continue to buy"}
            </p>
            <h2
              id="ndp-auth-title"
              className="text-lg font-bold text-foreground mt-0.5"
            >
              {zh ? "登录或注册后购买" : "Log in or register to buy"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              {zh
                ? "券和赠送权益会记在您的账号。完成后自动进入购券页。"
                : "Vouchers and gifts go to your account. You’ll land on the purchase page after."}
            </p>
            <p className="text-[11px] text-amber-900/90 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-3 leading-relaxed">
              {zh
                ? "提示：用相机扫桌码会打开系统浏览器。主屏幕 App 与浏览器的登录互不同步（手机系统限制）。在浏览器里登录一次后，约 90 天内再扫码一般不用重登。"
                : "Tip: Camera opens the system browser. Home-screen App and browser logins are separate (OS limit). Log in once here; about 90 days before you need to again."}
            </p>
            <div className="flex flex-col gap-2 mt-4">
              <Link href={buyLoginHref} className="w-full">
                <Button className="w-full rounded-full h-12 text-base font-semibold">
                  {zh ? "已有账号 · 登录" : "I have an account · Log in"}
                </Button>
              </Link>
              <Link href={buyRegisterHref} className="w-full">
                <Button
                  variant="outline"
                  className="w-full rounded-full h-12 text-base font-semibold"
                >
                  {zh ? "新用户 · 注册" : "New · Register"}
                </Button>
              </Link>
              <button
                type="button"
                onClick={() => setAuthOpen(false)}
                className="text-xs font-medium text-muted-foreground py-2"
              >
                {zh ? "稍后再说" : "Not now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

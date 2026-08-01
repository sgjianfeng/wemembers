"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

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
  };
  buyPath: string | null;
  isLoggedIn: boolean;
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
  buyPath,
  isLoggedIn,
  customerPhone,
  myGiftCount,
  myDrawWeight,
  loginRedirect,
}: Props) {
  const zh = lang === "zh";
  const mult = Math.max(5, Math.round(rules.weightMultiple * 10) / 10);

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 via-background to-background pb-16">
      {/* Hero */}
      <div className="px-4 pt-6 pb-5 bg-gradient-to-br from-rose-600 to-red-700 text-white">
        <p className="text-[11px] font-medium opacity-90 uppercase tracking-wide">
          {from === "table"
            ? zh
              ? "桌边扫码 · 先注册再结账"
              : "Table QR · register first"
            : zh
              ? "前台扫码 · 结账领券"
              : "Counter QR · claim at pay"}
        </p>
        <h1 className="text-2xl font-bold mt-1 leading-tight">{campaign.name}</h1>
        <p className="text-sm opacity-90 mt-1">{campaign.businessName}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/15 backdrop-blur px-3 py-2.5">
            <p className="text-[10px] opacity-80">{zh ? "满消费送" : "Spend & get"}</p>
            <p className="text-xl font-bold tabular-nums">
              S${rules.minSpendSgd.toFixed(0)} → S${rules.giftSgd.toFixed(0)}
            </p>
          </div>
          <div className="rounded-2xl bg-white/15 backdrop-blur px-3 py-2.5">
            <p className="text-[10px] opacity-80">{zh ? "购券中奖机会" : "Buy = chance"}</p>
            <p className="text-xl font-bold">
              {zh ? `约 ${mult}×` : `~${mult}×`}
            </p>
          </div>
        </div>
        <p className="text-[11px] mt-3 opacity-85 leading-relaxed">
          {zh
            ? `赠送券自领取起 ${rules.validDays} 天有效 · 仅倒计时大奖 · 无小奖`
            : `Gift voucher valid ${rules.validDays} days · grand prize only · no small prizes`}
        </p>
      </div>

      <div className="px-4 -mt-3 space-y-3">
        {/* Status if logged in */}
        {isLoggedIn && (
          <Card className="border-emerald-200 bg-emerald-50/80 shadow-sm">
            <CardContent className="p-3 text-sm">
              <p className="font-semibold text-emerald-900">
                {zh ? "已登录" : "Signed in"}
                {customerPhone ? ` · ${customerPhone}` : ""}
              </p>
              <p className="text-xs text-emerald-800/80 mt-1">
                {myGiftCount > 0
                  ? zh
                    ? `钱包里有 ${myGiftCount} 张国庆赠送券`
                    : `${myGiftCount} NDP gift coupon(s) in wallet`
                  : zh
                    ? "尚未获得 S$61 赠送券（结账达标后发放）"
                    : "No S$61 gift yet (issued after qualifying checkout)"}
                {myDrawWeight > 0
                  ? zh
                    ? ` · 已有大奖权重 ${myDrawWeight}`
                    : ` · draw weight ${myDrawWeight}`
                  : ""}
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

        {!isLoggedIn && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4">
              <p className="font-semibold text-foreground">
                {zh ? "第 1 步：注册 / 登录" : "Step 1: Register / Log in"}
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {zh
                  ? "用手机号完成验证，权益会记在您的账号。吃完到前台出示本页或手机号即可续办。"
                  : "Verify mobile so rewards go to your account. Show this page or your number at the counter."}
              </p>
              <div className="flex gap-2 mt-3">
                <Link
                  href={`/auth/register?redirect=${encodeURIComponent(loginRedirect)}`}
                  className="flex-1"
                >
                  <Button className="w-full rounded-full h-11">
                    {zh ? "注册" : "Register"}
                  </Button>
                </Link>
                <Link
                  href={`/auth/login?redirect=${encodeURIComponent(loginRedirect)}`}
                  className="flex-1"
                >
                  <Button variant="outline" className="w-full rounded-full h-11">
                    {zh ? "登录" : "Log in"}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Path A: buy voucher */}
        <Card className="border-l-4 border-l-[#1A6EFF] shadow-sm">
          <CardContent className="p-4 space-y-2">
            <p className="text-[10px] font-bold text-[#1A6EFF] uppercase tracking-wide">
              {zh ? "路径 A · 推荐" : "Path A · Recommended"}
            </p>
            <h2 className="text-base font-bold text-foreground">
              {zh ? "购券冲大奖" : "Buy voucher · grand draw"}
            </h2>
            <ul className="text-xs text-muted-foreground space-y-1 leading-relaxed list-disc pl-4">
              <li>
                {zh
                  ? `PayNow 购券 → 自动获得付费大奖资格（约 ${mult} 倍于赠送）`
                  : `PayNow buy → paid grand entry (~${mult}× gift chance)`}
              </li>
              <li>
                {zh
                  ? `到前台出示券码核销；本单核销 ≥ S$${rules.minSpendSgd.toFixed(0)} 自动送 S$${rules.giftSgd.toFixed(0)}`
                  : `Redeem at counter; bill redeem ≥ S$${rules.minSpendSgd.toFixed(0)} auto-issues S$${rules.giftSgd.toFixed(0)}`}
              </li>
              <li>{zh ? "无即时小奖，专注倒计时大奖" : "No small prizes — grand countdown only"}</li>
            </ul>
            {buyPath ? (
              <Link
                href={
                  isLoggedIn
                    ? buyPath
                    : `/auth/login?redirect=${encodeURIComponent(buyPath)}`
                }
              >
                <Button className="w-full rounded-full h-12 mt-2 text-base font-semibold">
                  {zh ? "去购券" : "Buy voucher"}
                </Button>
              </Link>
            ) : (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-xl p-2 mt-2">
                {zh
                  ? "购券链接尚未配置。请企业在活动 rules 中设置 buyVoucherSlug，或到前台购券。"
                  : "Buy link not configured. Set buyVoucherSlug on campaign or buy at counter."}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Path B: counter cash */}
        <Card className="border-l-4 border-l-rose-500 shadow-sm">
          <CardContent className="p-4 space-y-2">
            <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wide">
              {zh ? "路径 B" : "Path B"}
            </p>
            <h2 className="text-base font-bold text-foreground">
              {zh ? "前台结账 · 凭票领券" : "Pay at counter · claim gift"}
            </h2>
            <ul className="text-xs text-muted-foreground space-y-1 leading-relaxed list-disc pl-4">
              <li>
                {zh
                  ? `正常付账后，出示本页或手机号`
                  : "After paying, show this page or your mobile"}
              </li>
              <li>
                {zh
                  ? `店员确认小票 ≥ S$${rules.minSpendSgd.toFixed(0)} → 发 S$${rules.giftSgd.toFixed(0)} + 赠送大奖机会（权重较低）`
                  : `Staff confirms receipt ≥ S$${rules.minSpendSgd.toFixed(0)} → S$${rules.giftSgd.toFixed(0)} + gift draw entry (lower weight)`}
              </li>
            </ul>
            <div className="rounded-2xl bg-rose-50 border border-rose-100 p-3 mt-2">
              <p className="text-sm font-semibold text-rose-900">
                {zh ? "请到前台办理" : "Please proceed to counter"}
              </p>
              <p className="text-[11px] text-rose-800/80 mt-1 leading-relaxed">
                {from === "table"
                  ? zh
                    ? "吃完带上手机到收银台。店员会绑定手机并确认金额后发券。"
                    : "Bring your phone to the cashier after your meal."
                  : zh
                    ? "请让店员打开「国庆满赠发券」，录入手机与金额。"
                    : "Ask staff to open NDP gift issue and enter your mobile + amount."}
              </p>
              {isLoggedIn && customerPhone && (
                <p className="mt-2 text-lg font-bold tabular-nums text-foreground tracking-wide">
                  {customerPhone}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* How it works */}
        <Card className="border-slate-100">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold">
              {zh ? "怎么玩（30 秒）" : "How it works"}
            </h3>
            <ol className="mt-2 space-y-2 text-xs text-muted-foreground">
              <li>
                <span className="font-semibold text-foreground">1. </span>
                {zh ? "扫码注册（桌上或前台）" : "Scan & register (table or counter)"}
              </li>
              <li>
                <span className="font-semibold text-foreground">2. </span>
                {zh
                  ? "选购券冲大奖，或前台付账后凭票领"
                  : "Buy voucher for bigger chance, or pay cash & claim gift"}
              </li>
              <li>
                <span className="font-semibold text-foreground">3. </span>
                {zh
                  ? "前台核销/确认后，S$61 进钱包；下次再来用"
                  : "After counter confirm, S$61 lands in wallet for next visit"}
              </li>
            </ol>
          </CardContent>
        </Card>

        {campaign.description && (
          <p className="text-[11px] text-muted-foreground px-1 leading-relaxed">
            {campaign.description}
          </p>
        )}

        <p className="text-[10px] text-center text-muted-foreground pt-2">
          {zh
            ? "细则以门店与系统记录为准 · WeMembers"
            : "Terms subject to store & system records · WeMembers"}
        </p>
      </div>
    </div>
  );
}

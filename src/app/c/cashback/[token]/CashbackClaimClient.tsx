"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatSgd } from "@/lib/utils";
import { toast } from "sonner";

type ClaimResult = {
  amountCents: number;
  storeName: string | null;
  cashbackCents: number;
  cashbackPercent: number;
  shortCode: string | null;
  pointsAwarded: number;
  newTier: string | null;
  fundingTier: string;
  cappedByDaily: boolean;
  instantPrize: {
    id: string;
    name: string;
    icon: string;
    valueCents: number;
  } | null;
  grandProgress: {
    tierId: string;
    tierName: string;
    tierIcon: string;
    poolCents: number;
    targetCents: number;
    progressPercent: number;
  } | null;
};

export function CashbackClaimClient({
  token,
  state,
  stateMessage,
  amountCents,
  storeName,
  businessName,
  estimatedCashbackCents,
  cashbackPercent,
  inactivityMonths,
  myPhone,
}: {
  token: string;
  state: string;
  stateMessage: string | null;
  amountCents: number;
  storeName: string | null;
  businessName: string | null;
  estimatedCashbackCents: number;
  cashbackPercent: number;
  inactivityMonths: number;
  myPhone: string | null;
}) {
  const [phone, setPhone] = useState(myPhone || "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClaimResult | null>(null);

  async function claim() {
    const p = phone.trim();
    if (!p || p.replace(/\D/g, "").length < 8) {
      return toast.error("请输入正确的手机号");
    }
    setLoading(true);
    try {
      const res = await fetch("/api/cashback/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, phone: p }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "领取失败");
        return;
      }
      setResult(json.data);
    } catch {
      toast.error("网络错误");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="p-4 min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardContent className="p-8 text-center space-y-4">
            <p className="text-5xl">🎉</p>
            <div>
              <p className="text-sm text-muted-foreground">已到账</p>
              <p className="text-4xl font-bold text-emerald-600">
                {formatSgd(result.cashbackCents)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                消费 {formatSgd(result.amountCents)} · 返 {result.cashbackPercent}%
              </p>
            </div>

            {result.instantPrize && (
              <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 p-4">
                <p className="text-xs text-muted-foreground">当场抽中</p>
                <p className="text-2xl font-bold text-amber-600">
                  {result.instantPrize.icon} {result.instantPrize.name}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  已并入你的抵扣额度
                </p>
              </div>
            )}

            {result.grandProgress && (
              <div className="rounded-2xl border p-4 text-left">
                <div className="flex justify-between text-sm">
                  <span>
                    {result.grandProgress.tierIcon} {result.grandProgress.tierName}
                  </span>
                  <span className="text-muted-foreground">
                    {result.grandProgress.progressPercent}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted mt-2 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                    style={{ width: `${result.grandProgress.progressPercent}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  大奖池 {formatSgd(result.grandProgress.poolCents)} /{" "}
                  {formatSgd(result.grandProgress.targetCents)}
                </p>
              </div>
            )}

            {result.cappedByDaily && (
              <p className="text-xs text-amber-600">
                本次已达当日返额上限
              </p>
            )}
            {result.fundingTier !== "full" && (
              <p className="text-xs text-amber-600">
                本次为优惠调整期，返额有所调整
              </p>
            )}

            <div className="text-sm space-y-1 border-t pt-4">
              {result.shortCode && (
                <p>
                  核销码 <span className="font-mono font-bold">{result.shortCode}</span>
                </p>
              )}
              <p className="text-muted-foreground">
                获得 {result.pointsAwarded} 积分
                {result.newTier ? ` · 升级为 ${result.newTier}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                下次消费时抵扣 · 只要保持使用就长期有效
                （{inactivityMonths} 个月无任何消费或使用则失效）
              </p>
            </div>

            <Link href="/balance">
              <Button className="w-full">查看我的额度</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state !== "pending") {
    return (
      <div className="p-4 min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardContent className="p-8 text-center space-y-2">
            <p className="text-4xl">⌛</p>
            <p className="font-semibold">{stateMessage}</p>
            <p className="text-sm text-muted-foreground">
              请让店员重新生成二维码
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6 space-y-5">
          <div className="text-center space-y-1">
            <p className="text-sm text-muted-foreground">
              {businessName}
              {storeName ? ` · ${storeName}` : ""}
            </p>
            <p className="text-sm text-muted-foreground">本次消费</p>
            <p className="text-3xl font-bold">{formatSgd(amountCents)}</p>
          </div>

          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">可领取抵扣额度</p>
            <p className="text-3xl font-bold text-emerald-600">
              {formatSgd(estimatedCashbackCents)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              消费返 {cashbackPercent}% · 下次消费时使用
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">手机号</label>
            <Input
              type="tel"
              inputMode="numeric"
              placeholder="8 位手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!!myPhone}
              className="h-12 text-center text-lg"
            />
            {myPhone && (
              <p className="text-xs text-muted-foreground text-center">
                已登录账号
              </p>
            )}
          </div>

          <Button className="w-full h-12" onClick={claim} disabled={loading}>
            {loading ? "领取中…" : "立即领取"}
          </Button>

          <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
            抵扣额度用于下次到店消费，不可提现、不可转让。
            只要保持使用就长期有效（{inactivityMonths} 个月无任何消费或使用则失效）。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

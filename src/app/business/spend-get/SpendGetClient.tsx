"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { formatSgd } from "@/lib/utils";
import { toast } from "sonner";

type SpendGetData = {
  campaign: {
    id: string;
    name: string;
    slug: string | null;
    status: string;
    startDate: string;
    endDate: string;
  } | null;
  rules?: {
    minSpendCents: number;
    giftCouponCents: number;
    validDays: number;
    dualProtection: boolean;
  };
  enabled?: boolean;
  nominalCostPercent?: number;
  liability?: {
    issuedCents: number;
    redeemedCents: number;
    businessOutstandingCents: number;
    maxOutstandingCents: number | null;
  };
};

export function SpendGetClient() {
  const [data, setData] = useState<SpendGetData | null>(null);
  const [minSpend, setMinSpend] = useState(120);
  const [gift, setGift] = useState(61);
  const [validDays, setValidDays] = useState(30);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/business/spend-get");
      const json = await res.json();
      if (!res.ok || cancelled) return;
      const d: SpendGetData = json.data;
      setData(d);
      if (d.rules) {
        setMinSpend(d.rules.minSpendCents / 100);
        setGift(d.rules.giftCouponCents / 100);
        setValidDays(d.rules.validDays);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/business/spend-get", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        minSpendCents: Math.round(minSpend * 100),
        giftCouponCents: Math.round(gift * 100),
        validDays,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast.error(json.error || "保存失败");
      return;
    }
    toast.success("已保存");
    reload();
  }

  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">加载中…</div>;
  }

  if (!data.campaign) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-muted-foreground">还没有满赠活动</p>
        <Link
          href="/business/campaigns"
          className="inline-block mt-3 text-sm text-[#1A6EFF]"
        >
          去活动列表开通 →
        </Link>
      </div>
    );
  }

  const costPercent = minSpend > 0 ? (gift / minSpend) * 100 : 0;
  const outstanding = data.liability?.businessOutstandingCents ?? 0;
  const cap = data.liability?.maxOutstandingCents ?? null;

  return (
    <div className="pb-8">
      <div className="px-4 py-3 border-b border-border sticky top-0 bg-card z-10">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-foreground">满赠</h1>
          <Badge variant={data.campaign.status === "active" ? "green" : "slate"}>
            {data.campaign.status === "active" ? "进行中" : "未启用"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {data.campaign.name}
        </p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">规则</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                顾客本单照原价付，拿到的是<span className="font-medium text-foreground">下次消费</span>用的额度。本单不打折。
              </p>
            </div>

            <Input
              label="消费门槛"
              type="number"
              value={minSpend}
              onChange={(e) => setMinSpend(Number(e.target.value))}
              prefix="S$"
            />
            <Input
              label="赠送额度"
              type="number"
              value={gift}
              onChange={(e) => setGift(Number(e.target.value))}
              prefix="S$"
            />
            <Input
              label="赠券有效期（天）"
              type="number"
              min={1}
              max={365}
              value={validDays}
              onChange={(e) => setValidDays(Number(e.target.value))}
              prefix="📅"
            />

            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-foreground">
                满 {formatSgd(Math.round(minSpend * 100))} 送{" "}
                {formatSgd(Math.round(gift * 100))} · {validDays} 天内用
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                名义成本 {costPercent.toFixed(1)}%
                {costPercent > 60 && (
                  <span className="text-red-500"> · 超过门槛的 60%，无法保存</span>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                对照：消费返（cashback）是连续的百分比，满赠是阶梯的。
                阶梯会制造凑单，但顾客会把每单压到刚好过线。
              </p>
            </div>

            <Button className="w-full" onClick={save} loading={saving}>
              保存
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              已发出的赠券按发放当时的面额与有效期执行，改这里不追溯
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-foreground">负债</p>
            <p className="text-xs text-muted-foreground mt-0.5 mb-3">
              满赠发的额度和消费返的额度是同一种负债，合并计算
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-muted-foreground">本活动已发</p>
                <p className="text-base font-semibold tabular-nums">
                  {formatSgd(data.liability?.issuedCents ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">本活动已核销</p>
                <p className="text-base font-semibold tabular-nums">
                  {formatSgd(data.liability?.redeemedCents ?? 0)}
                </p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-[11px] text-muted-foreground">
                全店未核销额度（满赠 + 消费返）
              </p>
              <p className="text-lg font-bold tabular-nums">
                {formatSgd(outstanding)}
                {cap != null && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {" "}
                    / 上限 {formatSgd(cap)}
                  </span>
                )}
              </p>
              {cap != null && outstanding >= cap && (
                <p className="text-[11px] text-red-500 mt-1">
                  已达上限，暂停发放。请先让顾客来核销
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {data.campaign.slug && (
          <Link
            href={`/spend-get/${data.campaign.slug}`}
            className="block text-center text-sm text-[#1A6EFF] py-2"
          >
            查看顾客活动页 →
          </Link>
        )}
      </div>
    </div>
  );
}

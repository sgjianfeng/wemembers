"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { formatSgd } from "@/lib/utils";
import { toast } from "sonner";

type Setup = {
  campaign: {
    id: string;
    name: string;
    status: string;
    transferPricingMode: string;
    cashbackIssuedCents: number;
    cashbackRedeemedCents: number;
    outstandingCents: number;
  } | null;
  rules: { cashbackPercent: number; drawPercent: number };
  stores: { id: string; name: string }[];
  selectedStoreIds: string[] | null;
  limits: { totalPercentMin: number; totalPercentMax: number; inactivityMonths: number };
  platform: {
    mtdGmvCents: number;
    owedCents: number;
    minMonthlyCents: number;
    gmvToReachMinimumCents: number;
    policy: {
      kind: string;
      percentOverride: number | null;
      waiveMinimum: boolean;
      endsAt: string | null;
      reason: string;
    } | null;
  };
};

type ReportRow = {
  storeId: string;
  storeName: string;
  gmvCents: number;
  issuedCents: number;
  redeemedCents: number;
  netCents: number;
};

/** 平台阶梯：首 S$30k 1%，S$30k–100k 0.7%，>S$100k 0.5% */
function platformFeeFor(mtdGmvCents: number, amountCents: number): number {
  const tiers = [
    { upTo: 3_000_000, pct: 1.0 },
    { upTo: 10_000_000, pct: 0.7 },
    { upTo: Infinity, pct: 0.5 },
  ];
  let cursor = mtdGmvCents;
  let remaining = amountCents;
  let fee = 0;
  for (const t of tiers) {
    if (remaining <= 0) break;
    const room = t.upTo - cursor;
    if (room <= 0) continue;
    const take = Math.min(remaining, room);
    fee += Math.floor((take * t.pct) / 100);
    cursor += take;
    remaining -= take;
  }
  return fee;
}

export function CashbackSetupClient() {
  const [data, setData] = useState<Setup | null>(null);
  const [cashback, setCashback] = useState(3);
  const [draw, setDraw] = useState(2);
  const [storeIds, setStoreIds] = useState<string[] | null>(null);
  const [monthlyGmv, setMonthlyGmv] = useState("60000");
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<ReportRow[] | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/business/cashback/setup");
      const json = await res.json();
      if (!res.ok || cancelled) return;
      const d: Setup = json.data;
      setData(d);
      setCashback(d.rules.cashbackPercent);
      setDraw(d.rules.drawPercent);
      setStoreIds(d.selectedStoreIds);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const loadReport = useCallback(async () => {
    const res = await fetch("/api/business/cashback/store-report?days=30");
    const json = await res.json();
    if (res.ok) setReport(json.data?.rows || []);
  }, []);

  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">加载中…</div>;
  }

  const total = cashback + draw;
  const min = data.limits.totalPercentMin;
  const max = data.limits.totalPercentMax;
  const valid = total >= min && total <= max;

  // 成本预览
  const gmvCents = Math.max(0, Math.round(Number(monthlyGmv) * 100) || 0);
  const cashbackCost = Math.floor((gmvCents * cashback) / 100);
  const drawCost = Math.floor((gmvCents * draw) / 100);
  let platformCost = platformFeeFor(0, gmvCents);
  const policy = data.platform.policy;
  let platformNote = "";
  if (policy?.kind === "waive_all") {
    platformCost = 0;
    platformNote = "促销期全免";
  } else if (policy?.kind === "rate_override" && policy.percentOverride != null) {
    platformCost = Math.min(
      platformCost,
      Math.floor((gmvCents * policy.percentOverride) / 100)
    );
    platformNote = `促销费率 ${policy.percentOverride}%`;
  }
  const belowMinimum =
    platformCost < data.platform.minMonthlyCents &&
    !(policy?.waiveMinimum || policy?.kind === "waive_all");
  if (belowMinimum) platformCost = data.platform.minMonthlyCents;

  async function save(status: "draft" | "active") {
    if (!valid) return toast.error(`返利 + 抽奖合计须在 ${min}%–${max}% 之间`);
    setSaving(true);
    try {
      const res = await fetch("/api/business/cashback/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashbackPercent: cashback,
          drawPercent: draw,
          storeIds,
          status,
        }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error(json.error || "保存失败");
      toast.success(status === "active" ? "活动已启用" : "已保存草稿");
      load();
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">消费返 + 抽奖</h1>
          <p className="text-xs text-muted-foreground">
            顾客正常消费即返抵扣额度，无需先买券
          </p>
        </div>
        {data.campaign && (
          <Badge variant={data.campaign.status === "active" ? "default" : "secondary"}>
            {data.campaign.status === "active" ? "运行中" : "草稿"}
          </Badge>
        )}
      </div>

      {/* 费率 */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium">消费返利</span>
              <span className="font-bold">{cashback}%</span>
            </div>
            <input
              type="range" min={0} max={max} step={0.5}
              value={cashback}
              onChange={(e) => setCashback(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground mt-1">
              有沉淀损耗，且顾客回来用额度时又产生新消费 → 拉动复购
            </p>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium">抽奖充值</span>
              <span className="font-bold">{draw}%</span>
            </div>
            <input
              type="range" min={0} max={max} step={0.5}
              value={draw}
              onChange={(e) => setDraw(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground mt-1">
              奖池最终 100% 发出，成本实打实；换来的是话题和传播
            </p>
          </div>

          <div className={`rounded-xl p-3 text-sm ${valid ? "bg-muted" : "bg-red-50 dark:bg-red-950/30 text-red-600"}`}>
            合计 <span className="font-bold">{total}%</span>
            {!valid && `（须在 ${min}%–${max}% 之间）`}
          </div>
        </CardContent>
      </Card>

      {/* 成本预览 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="font-medium text-sm">月成本预览</p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">预估月流水 S$</span>
            <Input
              type="number"
              value={monthlyGmv}
              onChange={(e) => setMonthlyGmv(e.target.value)}
              className="h-9 w-32"
            />
          </div>
          <div className="space-y-1.5 text-sm">
            <Row label={`消费返利 ${cashback}%`} value={cashbackCost} muted="记账负债，不预扣现金" />
            <Row label={`抽奖充值 ${draw}%`} value={drawCost} muted="额度形式发放" />
            <Row
              label="平台费"
              value={platformCost}
              muted={
                platformNote ||
                (belowMinimum
                  ? `未达月保底，按 ${formatSgd(data.platform.minMonthlyCents)} 计`
                  : "阶梯：首 S$30k 1% / 至 S$100k 0.7% / 以上 0.5%")
              }
            />
            <div className="border-t pt-2 flex justify-between font-bold">
              <span>合计</span>
              <span>{formatSgd(cashbackCost + drawCost + platformCost)}</span>
            </div>
          </div>
          {policy?.endsAt && (
            <p className="text-xs text-amber-600">
              促销「{policy.reason}」至 {new Date(policy.endsAt).toLocaleDateString("zh-SG")}，到期后恢复标准费率
            </p>
          )}
        </CardContent>
      </Card>

      {/* 门店 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">参与门店</p>
            <button
              className="text-xs text-primary"
              onClick={() => setStoreIds(storeIds === null ? [] : null)}
            >
              {storeIds === null ? "改为指定门店" : "改为全部门店"}
            </button>
          </div>
          {storeIds === null ? (
            <p className="text-sm text-muted-foreground">全部门店参与</p>
          ) : (
            <div className="space-y-2">
              {data.stores.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={storeIds.includes(s.id)}
                    onChange={(e) =>
                      setStoreIds(
                        e.target.checked
                          ? [...storeIds, s.id]
                          : storeIds.filter((x) => x !== s.id)
                      )
                    }
                  />
                  {s.name}
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            费率由品牌统一，分店只能选择参与与否
          </p>
        </CardContent>
      </Card>

      {/* 负债概览 */}
      {data.campaign && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="font-medium text-sm">额度负债</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="累计发放" value={data.campaign.cashbackIssuedCents} />
              <Stat label="已核销" value={data.campaign.cashbackRedeemedCents} />
              <Stat label="未核销" value={data.campaign.outstandingCents} />
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={loadReport}>
              查看门店对账
            </Button>
            {report && (
              <div className="space-y-1 pt-2">
                <p className="text-xs text-muted-foreground">
                  近 30 天 · 正数 = 本店净输出额度，负数 = 本店净承接
                </p>
                {report.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">暂无数据</p>
                ) : (
                  report.map((r) => (
                    <div key={r.storeId} className="flex justify-between text-sm py-1 border-b last:border-0">
                      <span>{r.storeName}</span>
                      <span className={r.netCents >= 0 ? "text-emerald-600" : "text-amber-600"}>
                        {r.netCents >= 0 ? "+" : ""}{formatSgd(r.netCents)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => save("draft")} disabled={saving}>
          存草稿
        </Button>
        <Button className="flex-1" onClick={() => save("active")} disabled={saving || !valid}>
          {data.campaign?.status === "active" ? "保存" : "启用活动"}
        </Button>
      </div>

      <Link href="/business/cashback-desk">
        <Button variant="outline" className="w-full">去收银台出码</Button>
      </Link>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: string }) {
  return (
    <div className="flex justify-between items-start">
      <div>
        <p>{label}</p>
        {muted && <p className="text-xs text-muted-foreground">{muted}</p>}
      </div>
      <span>{formatSgd(value)}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-muted p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-bold text-sm">{formatSgd(value)}</p>
    </div>
  );
}

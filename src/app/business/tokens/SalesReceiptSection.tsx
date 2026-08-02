"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { timeAgo } from "@/lib/utils";

export type SaleRow = {
  id: string;
  shortCode: string | null;
  paidCents: number;
  amountCents: number;
  balanceCents: number;
  usedCents: number;
  productKind: string;
  paymentMethod: string | null;
  status: string;
  createdAt: string;
  campaignName: string | null;
  customerName: string | null;
  customerPhone: string | null;
};

type Filter = "all" | "equity" | "realized" | "partial";

function equityState(s: SaleRow): "equity" | "partial" | "realized" {
  const bal = s.balanceCents;
  const used = s.usedCents;
  if (bal > 0 && used > 0) return "partial";
  if (bal > 0) return "equity";
  return "realized";
}

export function SalesReceiptSection({
  lang,
  sales,
  selfSoldTodayCents,
  selfSoldTodayCount,
  selfPendingCents,
  selfSoldAllCents,
  selfSoldAllCount,
  distSoldAllCents,
  distSoldAllCount,
}: {
  lang: "zh" | "en";
  sales: SaleRow[];
  selfSoldTodayCents: number;
  selfSoldTodayCount: number;
  selfPendingCents: number;
  selfSoldAllCents: number;
  selfSoldAllCount: number;
  distSoldAllCents: number;
  distSoldAllCount: number;
}) {
  const zh = lang !== "en";
  const [filter, setFilter] = useState<Filter>("all");

  const stats = useMemo(() => {
    let paid = 0;
    let equity = 0;
    let used = 0;
    let equityCount = 0;
    let realizedCount = 0;
    let partialCount = 0;
    for (const s of sales) {
      paid += s.paidCents;
      equity += Math.max(0, s.balanceCents);
      used += Math.max(0, s.usedCents);
      const st = equityState(s);
      if (st === "equity") equityCount += 1;
      else if (st === "partial") partialCount += 1;
      else realizedCount += 1;
    }
    return {
      paid,
      equity,
      used,
      equityCount,
      realizedCount,
      partialCount,
      count: sales.length,
    };
  }, [sales]);

  const filtered = useMemo(() => {
    if (filter === "all") return sales;
    return sales.filter((s) => equityState(s) === filter);
  }, [sales, filter]);

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: zh ? "全部" : "All", count: stats.count },
    {
      key: "equity",
      label: zh ? "仍是权益" : "Still equity",
      count: stats.equityCount,
    },
    {
      key: "partial",
      label: zh ? "部分核销" : "Partial",
      count: stats.partialCount,
    },
    {
      key: "realized",
      label: zh ? "已花完/已结算" : "Fully used",
      count: stats.realizedCount,
    },
  ];

  return (
    <div className="space-y-3">
      <Card className="border-border">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {zh ? "收款总计" : "Collections summary"}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                {zh
                  ? "实付收款 vs 顾客未花完权益。独享/自用未核销不算可提现收益。"
                  : "Paid-in vs unspent customer credit. Unredeemed exclusive is not withdrawable."}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-muted-foreground">
                {zh ? "实付合计" : "Paid total"}
              </p>
              <p className="text-lg font-bold tabular-nums text-foreground">
                S${(stats.paid / 100).toFixed(2)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {stats.count} {zh ? "笔" : "orders"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 p-3">
              <p className="text-[10px] font-medium text-amber-900/80">
                {zh ? "仍是顾客权益" : "Still customer equity"}
              </p>
              <p className="text-xl font-bold tabular-nums text-amber-900 mt-0.5">
                S${(stats.equity / 100).toFixed(2)}
              </p>
              <p className="text-[10px] text-amber-800/70 mt-0.5">
                {stats.equityCount + stats.partialCount}{" "}
                {zh ? "笔有剩余余额" : "with balance left"}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 p-3">
              <p className="text-[10px] font-medium text-emerald-900/80">
                {zh ? "已核销（顾客已花）" : "Already redeemed"}
              </p>
              <p className="text-xl font-bold tabular-nums text-emerald-900 mt-0.5">
                S${(stats.used / 100).toFixed(2)}
              </p>
              <p className="text-[10px] text-emerald-800/70 mt-0.5">
                {zh
                  ? "店内履约完成部分"
                  : "Consumed at store"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg bg-muted/50 px-2.5 py-2">
              <span className="text-muted-foreground">
                {zh ? "自用/独享实付" : "Self/excl. paid"}
              </span>
              <p className="font-semibold tabular-nums mt-0.5">
                {selfSoldAllCount} · S${(selfSoldAllCents / 100).toFixed(2)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {zh ? "今日" : "Today"} S$
                {(selfSoldTodayCents / 100).toFixed(2)} ({selfSoldTodayCount}
                {zh ? "笔" : ""})
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 px-2.5 py-2">
              <span className="text-muted-foreground">
                {zh ? "分发实付" : "Distribution paid"}
              </span>
              <p className="font-semibold tabular-nums mt-0.5">
                {distSoldAllCount} · S${(distSoldAllCents / 100).toFixed(2)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {zh ? "待核销权益(自用)" : "Pending equity"} S$
                {(selfPendingCents / 100).toFixed(2)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <div className="flex items-end justify-between gap-2 mb-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {zh ? "收款明细" : "Collection details"}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">
                {filtered.length}/{stats.count}
              </span>
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {zh
                ? "筛选：仍是权益 = 顾客还能花；已花完 = 余额 0"
                : "Filter: equity = balance left; fully used = no balance"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-2">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                filter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {f.label}
              <span className="ml-1 opacity-80 tabular-nums">{f.count}</span>
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3 py-4 bg-card rounded-lg border border-border text-center">
            {zh ? "该筛选下暂无记录" : "No rows for this filter"}
          </p>
        ) : (
          <div className="space-y-1">
            {filtered.map((sale) => {
              const st = equityState(sale);
              const isSelf = sale.productKind === "self_use";
              const pay =
                sale.paymentMethod === "stripe"
                  ? "Stripe/PayNow"
                  : sale.paymentMethod === "cash"
                    ? zh
                      ? "现金"
                      : "Cash"
                    : sale.paymentMethod || "—";
              const who =
                sale.customerName ||
                sale.customerPhone ||
                (zh ? "顾客" : "Customer");
              const stateLabel =
                st === "equity"
                  ? zh
                    ? "仍是权益"
                    : "Equity"
                  : st === "partial"
                    ? zh
                      ? "部分核销"
                      : "Partial"
                    : zh
                      ? "已花完"
                      : "Used up";
              const stateVariant =
                st === "equity"
                  ? "amber"
                  : st === "partial"
                    ? "blue"
                    : "green";

              return (
                <div
                  key={sale.id}
                  className="flex items-start justify-between gap-2 px-3 py-2.5 bg-card rounded-lg border border-border"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">
                      {sale.campaignName || "—"}
                      {sale.shortCode ? (
                        <span className="font-mono text-primary ml-1.5 tracking-wider">
                          {sale.shortCode}
                        </span>
                      ) : null}
                    </p>
                    <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1">
                      <Badge variant="slate" size="sm">
                        {isSelf
                          ? zh
                            ? "自用/独享"
                            : "Self/Excl."
                          : zh
                            ? "分发"
                            : "Dist."}
                      </Badge>
                      <Badge variant={stateVariant} size="sm">
                        {stateLabel}
                      </Badge>
                      <span>{pay}</span>
                      <span>·</span>
                      <span className="truncate max-w-[7rem]">{who}</span>
                      <span>·</span>
                      <span>{timeAgo(new Date(sale.createdAt))}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] tabular-nums">
                      <span className="text-muted-foreground">
                        {zh ? "实付" : "Paid"}{" "}
                        <span className="font-semibold text-foreground">
                          S${(sale.paidCents / 100).toFixed(2)}
                        </span>
                      </span>
                      <span className="text-amber-800">
                        {zh ? "权益剩" : "Equity"}{" "}
                        <span className="font-semibold">
                          S${(sale.balanceCents / 100).toFixed(2)}
                        </span>
                      </span>
                      <span className="text-emerald-800">
                        {zh ? "已核销" : "Used"}{" "}
                        <span className="font-semibold">
                          S${(sale.usedCents / 100).toFixed(2)}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums text-foreground">
                      S${(sale.paidCents / 100).toFixed(2)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {zh ? "收款" : "In"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

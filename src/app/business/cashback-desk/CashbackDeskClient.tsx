"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { formatSgd } from "@/lib/utils";
import { toast } from "sonner";

type StoreOpt = { id: string; name: string };

type IssuedToken = {
  id: string;
  token: string;
  url: string;
  qrSvg: string;
  expiresAt: string;
  amountCents: number;
  estimatedCashbackCents: number;
};

type TodayRow = {
  id: string;
  token: string;
  amountCents: number;
  status: string;
  claimedAt: string | null;
  receiptNote: string | null;
  createdAt: string;
};

const QUICK_AMOUNTS = [10, 20, 50, 100, 200];

export function CashbackDeskClient({
  role,
  stores,
  initialStoreId,
  campaignActive,
  campaignName,
  cashbackPercent,
  drawPercent,
}: {
  role: string;
  stores: StoreOpt[];
  initialStoreId: string | null;
  campaignActive: boolean;
  campaignName: string | null;
  cashbackPercent: number;
  drawPercent: number;
}) {
  const [storeId, setStoreId] = useState(initialStoreId || "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [issued, setIssued] = useState<IssuedToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [today, setToday] = useState<TodayRow[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const fetchToday = useCallback(async (id: string): Promise<TodayRow[]> => {
    if (!id) return [];
    try {
      const res = await fetch(
        `/api/business/cashback/issue-token?storeId=${encodeURIComponent(id)}`
      );
      const json = await res.json();
      return res.ok ? json.data?.tokens || [] : [];
    } catch {
      // 静默：列表失败不该打断收银
      return [];
    }
  }, []);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchToday(storeId).then((rows) => {
      if (!cancelled) setToday(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [storeId, refreshKey, fetchToday]);

  // 二维码倒计时：只在 interval 回调里 setState
  useEffect(() => {
    if (!issued) return;
    const deadline = new Date(issued.expiresAt).getTime();
    const t = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [issued]);

  const amountCents = Math.round(Number(amount) * 100);
  const estimate = Number.isFinite(amountCents)
    ? Math.floor((amountCents * cashbackPercent) / 100)
    : 0;

  async function issue() {
    if (!storeId) return toast.error("请选择门店");
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return toast.error("请输入消费金额");
    }
    setLoading(true);
    try {
      const res = await fetch("/api/business/cashback/issue-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, amountCents, receiptNote: note }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "生成失败");
        return;
      }
      setIssued(json.data);
      setSecondsLeft(
        Math.max(
          0,
          Math.floor(
            (new Date(json.data.expiresAt).getTime() - Date.now()) / 1000
          )
        )
      );
      setAmount("");
      setNote("");
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error("网络错误");
    } finally {
      setLoading(false);
    }
  }

  if (!campaignActive) {
    return (
      <div className="p-4 space-y-4">
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <p className="text-2xl">💤</p>
            <p className="font-semibold">「消费返 + 抽奖」活动未启用</p>
            <p className="text-sm text-muted-foreground">
              {role === "business"
                ? "请先在活动配置页设置返利比例并启用"
                : "请联系企业主启用该活动"}
            </p>
            {role === "business" && (
              <Link href="/business/cashback">
                <Button className="mt-2">去配置</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">消费返收银台</h1>
          <p className="text-xs text-muted-foreground">
            {campaignName} · 返 {cashbackPercent}% · 抽奖 {drawPercent}%
          </p>
        </div>
        {role === "business" && (
          <Link href="/business/cashback">
            <Button variant="outline" size="sm">配置</Button>
          </Link>
        )}
      </div>

      {stores.length > 1 && role === "business" && (
        <select
          className="w-full h-11 rounded-full border px-4 text-sm bg-background"
          value={storeId}
          onChange={(e) => {
            setStoreId(e.target.value);
            setIssued(null);
          }}
        >
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      )}

      {issued ? (
        <Card>
          <CardContent className="p-6 space-y-4 text-center">
            <p className="text-sm text-muted-foreground">请顾客扫码领取</p>
            <div
              className="mx-auto w-[260px] h-[260px] [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: issued.qrSvg }}
            />
            <div className="space-y-1">
              <p className="text-2xl font-bold">
                {formatSgd(issued.amountCents)}
              </p>
              <p className="text-sm text-emerald-600 font-medium">
                预计返 {formatSgd(issued.estimatedCashbackCents)}
              </p>
              <p className="font-mono text-lg tracking-widest">{issued.token}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {secondsLeft > 0
                ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")} 后失效`
                : "已失效，请重新生成"}
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setIssued(null);
                setRefreshKey((k) => k + 1);
              }}
            >
              下一位顾客
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 space-y-3">
            <label className="text-sm font-medium">消费金额 (S$)</label>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-2xl h-14 text-center font-bold"
            />
            <div className="flex gap-2 flex-wrap">
              {QUICK_AMOUNTS.map((v) => (
                <Button
                  key={v}
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount(String(v))}
                >
                  S${v}
                </Button>
              ))}
            </div>
            {amountCents > 0 && (
              <p className="text-sm text-emerald-600">
                顾客将获得约 {formatSgd(estimate)} 抵扣额度
              </p>
            )}
            <Input
              placeholder="单号后四位（选填，防重复）"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={40}
            />
            <Button className="w-full h-12" onClick={issue} disabled={loading}>
              {loading ? "生成中…" : "生成二维码"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">今日出码</p>
        {today.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            暂无记录
          </p>
        ) : (
          today.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{formatSgd(r.amountCents)}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {r.token}
                    {r.receiptNote ? ` · ${r.receiptNote}` : ""}
                  </p>
                </div>
                <Badge
                  variant={r.status === "claimed" ? "default" : "secondary"}
                >
                  {r.status === "claimed"
                    ? "已领取"
                    : r.status === "expired"
                      ? "已过期"
                      : "待领取"}
                </Badge>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

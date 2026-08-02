"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { formatMoney } from "@/lib/utils";

type TicketData = {
  code: string;
  status: string;
  type: string;
  title: string;
  description: string | null;
  valueCents: number;
  storeName: string;
  businessName: string | null;
  validUntil: string | null;
  canClaim: boolean;
  claimedByYou?: boolean;
};

export default function PhysicalClaimPage() {
  const params = useParams();
  const router = useRouter();
  const code = decodeURIComponent(String(params.code || ""));
  const [data, setData] = useState<TicketData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/physical/${encodeURIComponent(code)}`);
      const j = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(j.error || "无效券码");
        setData(null);
      } else {
        setData(j.data);
        setError("");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function claim() {
    setClaiming(true);
    setMsg("");
    const res = await fetch(`/api/physical/${encodeURIComponent(code)}`, {
      method: "POST",
    });
    const j = await res.json();
    setClaiming(false);
    if (res.status === 401) {
      router.push(
        `/auth/login?redirect=${encodeURIComponent(`/c/${code}`)}`
      );
      return;
    }
    if (!res.ok) {
      setMsg(j.error || "绑定失败");
      return;
    }
    setMsg(j.data?.message || "绑定成功");
    setData((d) =>
      d
        ? {
            ...d,
            status: "claimed",
            canClaim: false,
            claimedByYou: true,
          }
        : d
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <p className="text-sm text-red-500">{error || "无效"}</p>
        <Link href="/" className="mt-4 text-sm text-[#1A6EFF]">
          返回首页
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-8 max-w-md mx-auto">
      <p className="text-[11px] font-semibold tracking-wider text-amber-700 dark:text-amber-400 uppercase text-center">
        WeMembers
      </p>
      <h1 className="text-xl font-bold text-center text-foreground mt-2">
        {data.title}
      </h1>
      <p className="text-center text-xs text-muted-foreground mt-1">
        {data.businessName || "商家"} · 🏪 {data.storeName}
      </p>

      <Card className="mt-6">
        <CardContent className="p-5 space-y-3">
          {data.type === "voucher" ? (
            <p className="text-3xl font-bold text-[#1A6EFF] text-center">
              S${formatMoney(data.valueCents)}
            </p>
          ) : (
            <p className="text-center text-violet-600 font-semibold">
              🎰 抽奖券 · 绑定后可看大奖
            </p>
          )}
          <p className="text-xs text-center text-muted-foreground leading-relaxed">
            {/国庆|满赠|赠送/.test(data.title || "")
              ? "国庆满赠纸质版 · 绑定后进券包 · 与线上赠送券一致"
              : data.type === "draw"
                ? "抽奖实体 · 绑后进余额/资格"
                : "自用券打印版 · 同品牌可核 · 绑后进余额"}
          </p>
          <p className="text-[11px] text-center font-mono text-muted-foreground break-all">
            {data.code}
          </p>
          <p className="text-xs text-center">
            状态：{" "}
            <span className="font-semibold">
              {data.status === "printed"
                ? "未售出/未绑定"
                : data.status === "sold"
                  ? "已售出 · 可绑定"
                  : data.status === "claimed"
                    ? "已绑定"
                    : data.status === "redeemed"
                      ? "已核销"
                      : data.status}
            </span>
          </p>

          {data.canClaim && (
            <>
              <Button className="w-full" size="lg" onClick={claim} loading={claiming}>
                绑定到我的账号
              </Button>
              <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                未登录将跳转登录/注册。绑后与线上券一致：满赠进券包，预付进余额。
              </p>
              <div className="flex gap-2 justify-center text-xs">
                <Link
                  href={`/auth/login?redirect=${encodeURIComponent(`/c/${code}`)}`}
                  className="text-[#1A6EFF]"
                >
                  登录
                </Link>
                <span className="text-muted-foreground">|</span>
                <Link
                  href={`/auth/register?redirect=${encodeURIComponent(`/c/${code}`)}`}
                  className="text-[#1A6EFF]"
                >
                  注册
                </Link>
              </div>
            </>
          )}

          {data.status === "claimed" && data.claimedByYou && (
            <div className="space-y-2">
              <p className="text-sm text-emerald-600 dark:text-emerald-400 text-center font-medium">
                {msg ||
                  (data.type === "draw"
                    ? "已绑定 · 线上抽奖资格已同步"
                    : /国庆|满赠|赠送/.test(data.title || "")
                      ? "已绑定 · 国庆赠送券已进券包"
                      : "已绑定 · 线上预付余额已同步")}
              </p>
              <Link
                href={
                  data.type === "draw"
                    ? "/home"
                    : /国庆|满赠|赠送/.test(data.title || "")
                      ? "/wallet"
                      : "/balance"
                }
              >
                <Button className="w-full" variant="outline">
                  {data.type === "draw"
                    ? "查看活动/首页"
                    : /国庆|满赠|赠送/.test(data.title || "")
                      ? "打开券包"
                      : "打开预付余额"}
                </Button>
              </Link>
            </div>
          )}

          {data.status === "claimed" && !data.claimedByYou && (
            <p className="text-sm text-amber-700 dark:text-amber-400 text-center font-medium bg-amber-50 dark:bg-amber-950/35 rounded-lg p-3">
              该券已绑定其他账号，无法再绑。请使用持有人账号登录查看。
            </p>
          )}

          {data.status === "redeemed" && (
            <p className="text-sm text-muted-foreground text-center">该券已在店内核销</p>
          )}

          {msg && (
            <p className="text-xs text-center text-muted-foreground bg-muted/50 rounded-lg p-2">
              {msg}
            </p>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground text-center mt-6 leading-relaxed px-4">
        到店可直接给店员扫码核销代金券（可不绑定）。  
        抽奖建议绑定，方便查看大奖与中奖记录。
      </p>
    </div>
  );
}

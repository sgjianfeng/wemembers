"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TopHeader } from "@/components/ui/TopHeader";
import {
  Link2,
  Share2,
  Coins,
  CreditCard,
  Eye,
  CheckCircle2,
  Clock,
  Gift,
  Dices,
  Copy,
  Check,
} from "lucide-react";

export default function PromoterPage() {
  const router = useRouter();
  const [account, setAccount] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [accRes, dashRes] = await Promise.all([
        fetch("/api/promoter/activate"),
        fetch("/api/promoter/dashboard"),
      ]);
      const acc = await accRes.json();
      setAccount(acc.data || null);
      try { const dash = await dashRes.json(); setDashboard(dash.data); } catch {}
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function togglePromoter() {
    setActivating(true);
    await fetch("/api/promoter/activate", { method: "POST" });
    await fetchData();
    setActivating(false);
  }

  async function generateLink(couponId: string) {
    setGenerating(couponId);
    await fetch("/api/promoter/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ couponId }) });
    await fetchData();
    setGenerating(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/50">
        <TopHeader fallbackUrl="/profile" />
        <div className="p-8 text-center text-foreground">加载中...</div>
      </div>
    );
  }

  const isActive = account?.isActive ?? false;

  if (!isActive) {
    const steps = [
      { icon: Link2, title: "生成推广链接", desc: "一键生成专属推广链接或二维码" },
      { icon: Share2, title: "分享到微信/朋友圈", desc: "把链接发给朋友、微信群、朋友圈" },
      { icon: Coins, title: "核销后自动到账", desc: "好友领券并到店核销，佣金自动计入你的账户" },
      { icon: CreditCard, title: "随时提现", desc: "满 S$10 即可提现到微信或支付宝" },
    ];
    return (
      <div className="min-h-screen flex flex-col bg-muted/50">
        <TopHeader fallbackUrl="/profile" />
        <div className="flex-1 flex flex-col justify-center px-6">
        <div className="text-center">
          <div className="mx-auto mb-4 grid place-items-center h-14 w-14 rounded-2xl bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400">
            <Coins size={28} strokeWidth={1.9} />
          </div>
          <h1 className="text-xl font-bold text-foreground">推广赚钱</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
            分享代金券给好友，每核销一张你就能赚取佣金。随时随地，动动手指就能赚钱。
          </p>

          <div className="mt-8 space-y-3 text-left max-w-sm mx-auto">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-3 bg-card p-3 rounded-xl border border-border">
                <div className="grid place-items-center h-9 w-9 rounded-full bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400 shrink-0">
                  <step.icon size={18} strokeWidth={1.9} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <Button className="mt-8 w-full active:scale-[0.97] transition-transform" size="lg" onClick={togglePromoter} loading={activating}>
            开启推广模式
          </Button>

          <p className="text-xs text-muted-foreground mt-4">开启即表示同意推广协议 · 零成本 · 零风险</p>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-4 min-h-screen">
      <TopHeader fallbackUrl="/profile" title="推广中心" />
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">推广中心</h1>
        <Badge variant="green">已开启</Badge>
      </div>

      <div className="px-4 mt-4">
        {/* 活动卖点海报：与卖家中心同一套引擎 */}
        <a
          href="/seller"
          className="mb-4 block rounded-xl border border-green-200 dark:border-green-900 bg-green-50/80 dark:bg-green-950/30 p-3 active:scale-[0.99] transition-transform"
        >
          <p className="text-sm font-semibold text-foreground">活动推广素材（推荐）</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            代金券/抽奖活动的卖点文案、社交 PNG、A4 墙贴 —— 与商家打印同一套，带你的分佣链接。
          </p>
          <p className="text-xs font-medium text-green-700 dark:text-green-400 mt-1.5">
            打开卖家中心 →
          </p>
        </a>

        {/* 收益概览 */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-400 rounded-xl p-5 text-white mb-4">
          <div className="flex justify-between">
            <div>
              <p className="text-white/70 text-xs">今日收益</p>
              <p className="text-3xl font-bold mt-1 nums">S${((dashboard?.todayEarnings || 0) / 100).toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-white/70 text-xs">可提现余额</p>
              <p className="text-3xl font-bold mt-1 nums">S${((account?.availableBalance || 0) / 100).toFixed(2)}</p>
              {account.availableBalance >= 1000 && (
                <button onClick={() => router.push("/promoter/withdraw")} className="mt-2 px-3 py-1 bg-white/20 text-white text-xs rounded-full active:scale-[0.97] transition-transform">提现 →</button>
              )}
            </div>
          </div>
          <div className="flex gap-4 mt-3 text-white/80 text-xs nums">
            <span>累计: S${((account?.totalEarned || 0) / 100).toFixed(2)}</span>
            <span>等级: Lv{account?.level || 1}</span>
          </div>
        </div>

        {/* 我的推广链接 */}
        {dashboard?.links?.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <Link2 size={15} className="text-muted-foreground" /> 我的推广链接
            </h3>
            <div className="space-y-2">
              {dashboard.links.map((link: any) => (
                <Card key={link.id} className="hover:border-green-200 dark:hover:border-green-900 transition-colors">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{link.coupon?.business?.businessName}</p>
                        <p className="text-sm font-semibold text-foreground truncate">{link.coupon?.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground">码: {link.code}</span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Eye size={11} /> {link.clicks}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <CheckCircle2 size={11} /> {link.redemptions}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`wemembers://promo/${link.code}`);
                          setCopiedId(link.id);
                          setTimeout(() => setCopiedId((v) => (v === link.id ? null : v)), 2000);
                        }}
                        className="flex items-center gap-1 px-3 py-1 text-xs bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400 rounded-full shrink-0 ml-2 active:scale-[0.97] transition-transform"
                      >
                        {copiedId === link.id ? <Check size={12} /> : <Copy size={12} />}
                        {copiedId === link.id ? "已复制" : "复制"}
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* 可推广的券 */}
        <h3 className="text-sm font-semibold text-foreground mt-5 mb-2 flex items-center gap-1.5">
          <Gift size={15} className="text-muted-foreground" /> 可推广的代金券
        </h3>
        <div className="space-y-2">
          {dashboard?.promotableCoupons?.map((coupon: any) => {
            const rt = coupon.rewardType || "cash";
            const RewardIcon = rt === "item" ? Gift : rt === "lottery" ? Dices : Coins;
            const rewardLabel = rt === "item" ? `${coupon.itemRewardName || "奖品"}/张`
              : rt === "lottery" ? "抽奖机会/张"
              : coupon.commissionType === "percentage" ? `${coupon.commissionValue}%（≈S$${((coupon.valueCents * (coupon.commissionValue || 0)) / 10000).toFixed(2)}/张）`
              : `S$${((coupon.commissionValue || 0) / 100).toFixed(2)}/张`;
            return (
              <Card key={coupon.id} className="hover:border-green-200 dark:hover:border-green-900 transition-colors">
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{coupon.business?.businessName}</p>
                    <p className="text-sm font-medium text-foreground">{coupon.title}</p>
                    <Badge variant="green" size="sm" className="mt-1 gap-1">
                      <RewardIcon size={11} /> {rewardLabel}
                    </Badge>
                  </div>
                  <Button size="sm" className="active:scale-[0.97] transition-transform" onClick={() => generateLink(coupon.id)} loading={generating === coupon.id}>
                    推广此券
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* 最近收益 */}
        {dashboard?.recentEarnings?.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-foreground mt-5 mb-2 flex items-center gap-1.5">
              <Coins size={15} className="text-muted-foreground" /> 最近收益
            </h3>
            <div className="space-y-1">
              {dashboard.recentEarnings.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between px-3 py-2 bg-card rounded-lg border border-border text-xs">
                  <span className={`flex items-center gap-1 nums ${e.status === "confirmed" ? "text-green-600 dark:text-green-400" : e.status === "pending" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                    {e.status === "confirmed" ? (
                      <CheckCircle2 size={12} />
                    ) : e.status === "pending" ? (
                      <Clock size={12} />
                    ) : (
                      <CreditCard size={12} />
                    )}
                    S${(e.amountCents / 100).toFixed(2)}
                  </span>
                  <span className="text-muted-foreground">
                    {e.status === "pending" ? "待核销" : e.status === "confirmed" ? "已确认" : "已提现"}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

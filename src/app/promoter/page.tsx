"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TopHeader } from "@/components/ui/TopHeader";

export default function PromoterPage() {
  const router = useRouter();
  const [account, setAccount] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);

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
      <div className="min-h-screen bg-slate-50">
        <TopHeader fallbackUrl="/profile" />
        <div className="p-8 text-center text-slate-400">加载中...</div>
      </div>
    );
  }

  const isActive = account?.isActive ?? false;

  if (!isActive) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <TopHeader fallbackUrl="/profile" />
        <div className="flex-1 flex flex-col justify-center px-6">
        <div className="text-center">
          <p className="text-6xl mb-4">💸</p>
          <h1 className="text-xl font-bold text-slate-900">推广赚钱</h1>
          <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto">
            分享代金券给好友，每核销一张你就能赚取佣金。随时随地，动动手指就能赚钱。
          </p>

          <div className="mt-8 space-y-3 text-left max-w-sm mx-auto">
            {[
              { icon: "🔗", title: "生成推广链接", desc: "一键生成专属推广链接或二维码" },
              { icon: "📱", title: "分享到微信/朋友圈", desc: "把链接发给朋友、微信群、朋友圈" },
              { icon: "💰", title: "核销后自动到账", desc: "好友领券并到店核销，佣金自动计入你的账户" },
              { icon: "💳", title: "随时提现", desc: "满 S$10 即可提现到微信或支付宝" },
            ].map((step, i) => (
              <div key={i} className="flex gap-3 bg-white p-3 rounded-xl border border-slate-100">
                <span className="text-2xl">{step.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                  <p className="text-xs text-slate-500">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <Button className="mt-8 w-full" size="lg" onClick={togglePromoter} loading={activating}>
            🚀 开启推广模式
          </Button>

          <p className="text-xs text-slate-400 mt-4">开启即表示同意推广协议 · 零成本 · 零风险</p>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-4 min-h-screen">
      <TopHeader fallbackUrl="/profile" title="推广中心" />
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h1 className="text-lg font-semibold">推广中心</h1>
        <Badge variant="green">已开启</Badge>
      </div>

      <div className="px-4 mt-4">
        {/* 收益概览 */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-400 rounded-xl p-5 text-white mb-4">
          <div className="flex justify-between">
            <div>
              <p className="text-white/70 text-xs">今日收益</p>
              <p className="text-3xl font-bold mt-1">S${((dashboard?.todayEarnings || 0) / 100).toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-white/70 text-xs">可提现余额</p>
              <p className="text-3xl font-bold mt-1">S${((account?.availableBalance || 0) / 100).toFixed(2)}</p>
              {account.availableBalance >= 1000 && (
                <button onClick={() => router.push("/promoter/withdraw")} className="mt-2 px-3 py-1 bg-white/20 text-white text-xs rounded-full">提现 →</button>
              )}
            </div>
          </div>
          <div className="flex gap-4 mt-3 text-white/80 text-xs">
            <span>累计: S${((account?.totalEarned || 0) / 100).toFixed(2)}</span>
            <span>等级: Lv{account?.level || 1}</span>
          </div>
        </div>

        {/* 我的推广链接 */}
        {dashboard?.links?.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">📎 我的推广链接</h3>
            <div className="space-y-2">
              {dashboard.links.map((link: any) => (
                <Card key={link.id} className="hover:border-green-200 transition-colors">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">{link.coupon?.business?.businessName}</p>
                        <p className="text-sm font-semibold text-slate-900 truncate">{link.coupon?.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-slate-400">码: {link.code}</span>
                          <span className="text-[10px] text-slate-400">👁 {link.clicks}</span>
                          <span className="text-[10px] text-slate-400">✅ {link.redemptions}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => navigator.clipboard.writeText(`wemembers://promo/${link.code}`)}
                        className="px-3 py-1 text-xs bg-green-50 text-green-600 rounded-full shrink-0 ml-2"
                      >
                        复制
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* 可推广的券 */}
        <h3 className="text-sm font-semibold text-slate-900 mt-5 mb-2">🎫 可推广的代金券</h3>
        <div className="space-y-2">
          {dashboard?.promotableCoupons?.map((coupon: any) => {
            const rt = coupon.rewardType || "cash";
            const rewardLabel = rt === "item" ? `🎁 ${coupon.itemRewardName || "奖品"}/张`
              : rt === "lottery" ? "🎰 抽奖机会/张"
              : coupon.commissionType === "percentage" ? `${coupon.commissionValue}%（≈S$${((coupon.valueCents * (coupon.commissionValue || 0)) / 10000).toFixed(2)}/张）`
              : `💰 S$${((coupon.commissionValue || 0) / 100).toFixed(2)}/张`;
            return (
              <Card key={coupon.id} className="hover:border-green-200 transition-colors">
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">{coupon.business?.businessName}</p>
                    <p className="text-sm font-medium text-slate-900">{coupon.title}</p>
                    <Badge variant="green" size="sm" className="mt-1">{rewardLabel}</Badge>
                  </div>
                  <Button size="sm" onClick={() => generateLink(coupon.id)} loading={generating === coupon.id}>
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
            <h3 className="text-sm font-semibold text-slate-900 mt-5 mb-2">💰 最近收益</h3>
            <div className="space-y-1">
              {dashboard.recentEarnings.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-slate-50 text-xs">
                  <span className={e.status === "confirmed" ? "text-green-600" : e.status === "pending" ? "text-amber-600" : "text-slate-400"}>
                    {e.status === "confirmed" ? "✅" : e.status === "pending" ? "⏳" : "💳"} S${(e.amountCents / 100).toFixed(2)}
                  </span>
                  <span className="text-slate-400">
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

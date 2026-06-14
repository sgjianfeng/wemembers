"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

export default function DrawPage() {
  const { slug } = useParams<{ slug: string }>();
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [myTickets, setMyTickets] = useState<any[]>([]);
  const [showTickets, setShowTickets] = useState(false);

  useEffect(() => {
    fetch(`/api/draw/${slug}`)
      .then((r) => r.json())
      .then((d) => { setCampaign(d.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  async function loadMyTickets() {
    const res = await fetch(`/api/draw/${slug}/my-tickets`);
    const d = await res.json();
    if (d.data) {
      setMyTickets(d.data);
      setShowTickets(true);
    }
  }

  async function submit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("请输入金额"); return; }

    setSubmitting(true);
    setError("");
    setResult(null);

    const res = await fetch(`/api/draw/${slug}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiptAmount: Math.round(amt * 100) }),
    });

    const d = await res.json();
    setSubmitting(false);

    if (res.ok) {
      setResult(d.data);
      setAmount("");
    } else {
      setError(d.error || "提交失败");
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400"><p>加载中...</p></div>;
  }

  if (!campaign) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-center text-slate-400"><p className="text-4xl mb-2">🎰</p><p className="text-sm">活动不存在或已过期</p></div></div>;
  }

  const minSpendSgd = (campaign.receiptMinSpend || 5000) / 100;
  const isActive = campaign.status === "active" && new Date() < new Date(campaign.endDate);
  const prizes = campaign.prizes || [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FF6B35] via-orange-50 to-white">
      {/* Header */}
      <div className="px-4 pt-8 pb-4 text-center text-white">
        <p className="text-5xl mb-3">🎰</p>
        <h1 className="text-2xl font-bold">{campaign.name}</h1>
        <p className="text-white/70 text-sm mt-1">{campaign.businessName}</p>
        {campaign.description && <p className="text-white/70 text-xs mt-2">{campaign.description}</p>}
        <div className="flex items-center justify-center gap-3 mt-3 text-xs text-white/60">
          <span>S${minSpendSgd.toFixed(0)} = 1 张券</span>
          {campaign.drawDate && (
            <>
              <span>·</span>
              <span>开奖：{new Date(campaign.drawDate).toLocaleDateString("zh-CN")}</span>
            </>
          )}
        </div>
      </div>

      <div className="px-4 -mt-2 pb-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-white/80 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-[#FF6B35]">{campaign.totalTicketCount || 0}</p>
            <p className="text-[10px] text-slate-400">已发票数</p>
          </div>
          <div className="bg-white/80 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-[#FF6B35]">{campaign.entryCount || 0}</p>
            <p className="text-[10px] text-slate-400">参与人次</p>
          </div>
          <div className="bg-white/80 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-[#FF6B35]">{prizes.length}</p>
            <p className="text-[10px] text-slate-400">奖品种类</p>
          </div>
        </div>

        {/* Prize Pool */}
        {prizes.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">🏆 奖品列表</h3>
            <div className="space-y-1.5">
              {prizes.map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-slate-50 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{p.icon || "🎁"}</span>
                    <span className="font-medium text-slate-700">{p.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {p.totalStock ? `×${p.totalStock}` : "不限量"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Submit Section */}
        {isActive ? (
          <Card className="mb-4">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">📸 上传消费记录</h3>
              <p className="text-xs text-slate-400 mb-3">
                每满 S${minSpendSgd.toFixed(0)} 获得 1 张抽奖券
              </p>

              <div className="flex items-center gap-2 mb-3">
                <span className="text-slate-400 text-sm">S$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`消费金额，至少 S$${minSpendSgd.toFixed(0)}`}
                  className="flex-1 h-10 px-3 rounded-lg border border-slate-200 text-sm"
                />
              </div>

              {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

              <Button className="w-full" size="lg" onClick={submit} loading={submitting}>
                🎫 获得抽奖券
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="text-center p-6 bg-white rounded-xl mb-4">
            <p className="text-2xl mb-2">🔒</p>
            <p className="text-sm text-slate-400">活动已结束</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <Card className="mb-4 border-green-200 bg-green-50">
            <CardContent className="p-4 text-center">
              <p className="text-3xl mb-2">🎉</p>
              <p className="text-lg font-semibold text-green-800">获得 {result.ticketCount} 张抽奖券！</p>
              <div className="mt-2 space-y-1">
                {result.tickets.map((t: any) => (
                  <p key={t.ticketNo} className="text-sm font-mono font-bold text-green-700">
                    🎫 {t.ticketNo}
                  </p>
                ))}
              </div>
              <p className="text-xs text-green-600 mt-2">开奖日请留意中奖通知</p>
            </CardContent>
          </Card>
        )}

        {/* My Tickets Button */}
        <button
          onClick={() => showTickets ? setShowTickets(false) : loadMyTickets()}
          className="w-full p-3 bg-white rounded-xl text-sm text-[#1A6EFF] font-medium mb-4 border border-[#1A6EFF]/20"
        >
          {showTickets ? "隐藏" : "📋 查看我的券"}
        </button>

        {/* My Tickets */}
        {showTickets && (
          <div className="space-y-3 mb-4">
            {myTickets.length > 0 ? (
              myTickets.map((entry: any) => (
                <Card key={entry.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-400">
                        S${(entry.receiptAmount / 100).toFixed(2)} · {entry.ticketCount}张券
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(entry.createdAt).toLocaleDateString("zh-CN")}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {entry.tickets.map((t: any) => (
                        <span
                          key={t.ticketNo}
                          className={`px-2 py-1 rounded text-[10px] font-mono font-medium ${
                            t.won
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {t.ticketNo}
                          {t.won && ` ${t.prizeIcon || "🎉"}`}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="text-center text-sm text-slate-400 py-4">还没有参与记录</p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-300 mt-4">
          Powered by WeMembers
        </div>
      </div>
    </div>
  );
}

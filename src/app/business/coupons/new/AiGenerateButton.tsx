"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface CouponData {
  title: string; type: "fixed_amount" | "percentage" | "free_item";
  valueCents: number; pointsRequired: number; validDays: number; description: string;
}

export function AiGenerateButton({ onFill }: { onFill: (data: CouponData) => void }) {
  const [show, setShow] = useState(false);
  const [goal, setGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CouponData | null>(null);

  async function generate() {
    if (!goal) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/coupon-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, businessCategory: "cafe", businessName: "我的店铺" }),
      });
      const d = await res.json();
      if (d.data) setResult(d.data);
    } catch {}
    setLoading(false);
  }

  function apply() {
    if (result) onFill(result);
  }

  return (
    <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-4 border border-purple-100">
      {!show ? (
        <button onClick={() => setShow(true)} className="w-full flex items-center justify-center gap-2 text-sm font-medium text-purple-600">
          <span className="text-lg">🤖</span> AI 快速生成代金券
        </button>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🤖</span>
            <span className="text-sm font-semibold text-purple-700">AI 代金券生成器</span>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            描述你的目标，AI 自动生成最优代金券配置
          </p>

          {!result ? (
            <>
              <Input
                placeholder="如：下午茶时段人少，想增加2-5点客流"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="mb-2"
              />
              <Button size="sm" onClick={generate} loading={loading} className="w-full">
                生成方案
              </Button>
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between text-xs"><span className="text-slate-500">标题</span><span className="text-slate-900 font-medium">{result.title}</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-500">类型</span><span className="text-slate-900">{{ fixed_amount: "定额减免", percentage: "折扣券", free_item: "免单券" }[result.type]}</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-500">面值/折扣</span><span className="text-slate-900 font-bold">S${(result.valueCents / 100).toFixed(0)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-500">所需积分</span><span className="text-[#FF6B35] font-bold">{result.pointsRequired}⭐</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-500">有效期</span><span className="text-slate-900">{result.validDays}天</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-500">说明</span><span className="text-slate-500 text-[11px]">{result.description}</span></div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => { setResult(null); setGoal(""); }}>重试</Button>
                <Button size="sm" className="flex-1" onClick={apply}>✅ 使用此方案</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

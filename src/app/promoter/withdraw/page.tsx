"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { TopHeader } from "@/components/ui/TopHeader";

export default function WithdrawPage() {
  const router = useRouter();
  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("paynow");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; error?: string; message?: string } | null>(null);

  useEffect(() => {
    fetch("/api/promoter/activate").then((r) => r.json()).then((d) => {
      setBalance(d.data?.availableBalance || 0);
    });
  }, []);

  async function withdraw() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setLoading(true);
    setResult(null);

    const res = await fetch("/api/promoter/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amt, method }),
    });
    const data = await res.json();

    if (res.ok) {
      setResult({ success: true, message: data.data.message });
      setBalance(data.data.newBalance);
      setAmount("");
    } else {
      setResult({ success: false, error: data.error || "提现失败" });
    }
    setLoading(false);
  }

  return (
    <div className="pb-4 min-h-screen">
      <TopHeader fallbackUrl="/promoter" title="提现" />
      <div className="px-4 py-3 border-b border-slate-100">
        <h1 className="text-lg font-semibold">提现</h1>
      </div>

      <div className="px-4 mt-6">
        <div className="text-center mb-6">
          <p className="text-sm text-slate-500">可提现余额</p>
          <p className="text-4xl font-bold text-green-600 mt-1">S${(balance / 100).toFixed(2)}</p>
        </div>

        <div className="space-y-4">
          <Input
            label="提现金额 (元)"
            type="number"
            placeholder="最低 S$10.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            prefix="S$"
          />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">到账方式（申请后人工打款）</label>
            <div className="flex gap-2">
              {[
                { key: "paynow", label: "PayNow", icon: "🇸🇬" },
                { key: "bank", label: "银行转账", icon: "🏦" },
                { key: "wechat", label: "微信", icon: "💬" },
              ].map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMethod(m.key)}
                  className={`flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                    method === m.key ? "border-green-400 bg-green-50 text-green-700" : "border-slate-100 text-slate-400"
                  }`}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-2 text-center">
              MVP：先扣推广余额并记录申请，财务按方式人工到账（非自动 Stripe）
            </p>
          </div>

          {result && (
            <div className={`p-4 rounded-xl text-sm text-center ${result.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
              {result.success ? result.message : result.error}
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={withdraw}
            loading={loading}
            disabled={!amount || parseFloat(amount) < 10 || parseFloat(amount) > balance / 100}
          >
            确认提现
          </Button>

          <div className="text-center">
            <button onClick={() => router.push("/promoter")} className="text-xs text-slate-400">
              ← 返回推广中心
            </button>
          </div>

          {/* Quick amounts */}
          <div className="flex gap-2 justify-center mt-2">
            {[10, 50, 100].map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(preset.toString())}
                className="px-4 py-1.5 bg-slate-100 rounded-full text-xs text-slate-600 hover:bg-slate-200"
                disabled={preset > balance / 100}
              >
                S${preset}
              </button>
            ))}
            {balance > 0 && (
              <button
                onClick={() => setAmount((balance / 100).toFixed(2))}
                className="px-4 py-1.5 bg-green-100 text-green-600 rounded-full text-xs font-medium hover:bg-green-200"
              >
                全部提现
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

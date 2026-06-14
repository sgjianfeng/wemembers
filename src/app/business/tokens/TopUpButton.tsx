"use client";

import { useState } from "react";

const QUICK_AMOUNTS = [10, 20, 50, 100, 200, 500];

export function TopUpButton() {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(20);
  const [loading, setLoading] = useState(false);

  async function topUp(amountSgd: number) {
    setLoading(true);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountSgd }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.data?.url) {
      window.location.href = data.data.url;
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex-1 py-3 bg-[#1A6EFF] text-white rounded-full font-medium text-sm"
      >
        💳 充值
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end" onClick={() => setOpen(false)}>
      <div className="w-full bg-white rounded-t-2xl p-5 max-w-lg mx-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">充值金额 (SGD)</h3>
        <p className="text-xs text-slate-400 mb-3">支持信用卡和 PayNow</p>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {QUICK_AMOUNTS.map((a) => (
            <button
              key={a}
              onClick={() => setAmount(a)}
              className={`py-2 rounded-xl text-sm font-medium transition-colors ${
                amount === a ? "bg-[#1A6EFF] text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              S${a}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span className="text-slate-400 text-sm">S$</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="flex-1 h-10 px-3 rounded-lg border border-slate-200 text-sm"
            min={1}
          />
        </div>

        <button
          onClick={() => topUp(amount)}
          disabled={loading || amount < 1}
          className="w-full py-3 bg-[#1A6EFF] text-white rounded-full font-medium text-sm disabled:opacity-50"
        >
          {loading ? "跳转中..." : `💳 支付 S$${amount}`}
        </button>
        <button onClick={() => setOpen(false)} className="w-full py-2 text-sm text-slate-400 mt-1">
          取消
        </button>
      </div>
    </div>
  );
}

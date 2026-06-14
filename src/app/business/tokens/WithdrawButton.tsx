"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function WithdrawButton({ balance }: { balance: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function withdraw() {
    const amountCents = Math.round(amount * 100);
    if (amountCents <= 0) return;

    setLoading(true);
    setMessage("");

    const res = await fetch("/api/stripe/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      setMessage(`✅ 提现 S$${data.data.amount} 成功！1-2 个工作日到账`);
      setTimeout(() => { setOpen(false); router.refresh(); }, 2000);
    } else {
      setMessage(`❌ ${data.error || "提现失败"}`);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-full font-medium text-sm"
      >
        🏦 提现
      </button>
    );
  }

  const balanceSgd = balance / 100;
  const amountSgd = amount;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end" onClick={() => setOpen(false)}>
      <div className="w-full bg-white rounded-t-2xl p-5 max-w-lg mx-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">提现到银行卡</h3>
        <p className="text-xs text-slate-400 mb-3">可用余额 S${balanceSgd.toFixed(2)}</p>

        <div className="flex items-center gap-2 mb-1">
          <span className="text-slate-400 text-sm">S$</span>
          <input
            type="number"
            value={amount || ""}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="flex-1 h-10 px-3 rounded-lg border border-slate-200 text-sm"
            placeholder="提现金额"
            min={10}
            max={balanceSgd}
          />
        </div>
        <p className="text-[10px] text-slate-400 mb-3">最低提现 S$10.00</p>

        {amountSgd > 0 && amountSgd <= balanceSgd && (
          <div className="mb-3 p-2 bg-slate-50 rounded-lg text-xs text-slate-500">
            预计 1-2 个工作日到账
          </div>
        )}

        {message && (
          <div className={`mb-3 text-center p-2 rounded-lg text-xs ${message.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-500"}`}>
            {message}
          </div>
        )}

        <button
          onClick={withdraw}
          disabled={loading || amountSgd < 10 || amountSgd > balanceSgd}
          className="w-full py-3 bg-[#1A6EFF] text-white rounded-full font-medium text-sm disabled:opacity-50"
        >
          {loading ? "处理中..." : `🏦 提现 S$${amountSgd.toFixed(2)}`}
        </button>
        <button onClick={() => setOpen(false)} className="w-full py-2 text-sm text-slate-400 mt-1">
          取消
        </button>
      </div>
    </div>
  );
}

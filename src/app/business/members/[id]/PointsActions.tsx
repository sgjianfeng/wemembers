"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PointsActions({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "grant" | "deduct">("none");
  const [amount, setAmount] = useState(100);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(actualAmount: number) {
    setLoading(true);
    setMessage("");

    const res = await fetch(`/api/business/members/${customerId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: actualAmount,
        reason: reason || undefined,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      setMessage(`✅ ${actualAmount > 0 ? "发放" : "扣减"}成功`);
      setMode("none");
      setAmount(100);
      setReason("");
      router.refresh();
    } else {
      setMessage(`❌ ${data.error || "操作失败"}`);
    }
  }

  if (mode === "grant" || mode === "deduct") {
    const isGrant = mode === "grant";
    return (
      <div className="space-y-2">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-center"
          min={1}
          autoFocus
          placeholder="积分数量"
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs"
          placeholder={
            isGrant ? "发放原因（如：消费满100）" : "扣减原因（如：退货退款）"
          }
        />
        <div className="flex gap-2">
          <button
            onClick={() => submit(isGrant ? amount : -amount)}
            disabled={loading || amount <= 0}
            className="flex-1 h-8 text-xs font-medium text-white bg-[#1A6EFF] rounded-full disabled:opacity-50"
          >
            {loading
              ? "处理中..."
              : isGrant
              ? `✓ 发放 ${amount} 积分`
              : `✓ 扣减 ${amount} 积分`}
          </button>
          <button
            onClick={() => {
              setMode("none");
              setMessage("");
            }}
            className="flex-1 h-8 text-xs font-medium text-slate-500 bg-slate-100 rounded-full"
          >
            取消
          </button>
        </div>
        {message && (
          <p
            className={`text-xs text-center ${
              message.startsWith("✅") ? "text-green-600" : "text-red-500"
            }`}
          >
            {message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => setMode("grant")}
        className="flex-1 h-8 text-xs font-medium text-white bg-[#1A6EFF] rounded-full"
      >
        ⭐ 发放积分
      </button>
      <button
        onClick={() => setMode("deduct")}
        className="flex-1 h-8 text-xs font-medium text-slate-500 bg-slate-100 rounded-full"
      >
        📉 扣减积分
      </button>
    </div>
  );
}

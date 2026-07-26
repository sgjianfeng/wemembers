"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, TrendingDown, CheckCircle2, XCircle } from "lucide-react";

export function PointsActions({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "grant" | "deduct">("none");
  const [amount, setAmount] = useState(100);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageOk, setMessageOk] = useState(true);

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
      setMessageOk(true);
      setMessage(`${actualAmount > 0 ? "发放" : "扣减"}成功`);
      setMode("none");
      setAmount(100);
      setReason("");
      router.refresh();
    } else {
      setMessageOk(false);
      setMessage(data.error || "操作失败");
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
          className="w-full h-9 px-3 rounded-lg border border-border text-sm text-center nums"
          min={1}
          autoFocus
          placeholder="积分数量"
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full h-9 px-3 rounded-lg border border-border text-xs"
          placeholder={
            isGrant ? "发放原因（如：消费满100）" : "扣减原因（如：退货退款）"
          }
        />
        <div className="flex gap-2">
          <button
            onClick={() => submit(isGrant ? amount : -amount)}
            disabled={loading || amount <= 0}
            className="flex-1 h-8 text-xs font-medium text-primary-foreground bg-primary rounded-full disabled:opacity-50 active:scale-[0.97] transition-transform"
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
            className="flex-1 h-8 text-xs font-medium text-muted-foreground bg-muted rounded-full active:scale-[0.97] transition-transform"
          >
            取消
          </button>
        </div>
        {message && (
          <p
            className={`text-xs text-center flex items-center justify-center gap-1 ${
              messageOk ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"
            }`}
          >
            {messageOk ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
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
        className="flex-1 h-8 flex items-center justify-center gap-1 text-xs font-medium text-primary-foreground bg-primary rounded-full active:scale-[0.97] transition-transform"
      >
        <Star size={12} /> 发放积分
      </button>
      <button
        onClick={() => setMode("deduct")}
        className="flex-1 h-8 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground bg-muted rounded-full active:scale-[0.97] transition-transform"
      >
        <TrendingDown size={12} /> 扣减积分
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AwardPointsButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [showInput, setShowInput] = useState(false);
  const [amount, setAmount] = useState(100);
  const [loading, setLoading] = useState(false);

  async function award() {
    setLoading(true);
    await fetch(`/api/business/members/${customerId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, reason: "手动发放" }),
    });
    setShowInput(false);
    setLoading(false);
    router.refresh();
  }

  if (!showInput) {
    return (
      <button onClick={() => setShowInput(true)} className="flex-1 h-8 text-xs font-medium text-white bg-[#1A6EFF] rounded-full">
        ⭐ 发放积分
      </button>
    );
  }

  return (
    <div className="flex-1 flex items-center gap-1">
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        className="w-full h-8 px-2 text-xs rounded-full border border-slate-200 text-center"
        autoFocus
      />
      <button onClick={award} disabled={loading} className="h-8 px-3 bg-[#16A34A] text-white text-xs rounded-full shrink-0">
        ✓
      </button>
    </div>
  );
}

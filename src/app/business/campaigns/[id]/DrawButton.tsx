"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DrawButton({ campaignId, entryCount }: { campaignId: string; entryCount: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ totalEntries?: number; wonCount?: number } | null>(null);

  async function handleDraw() {
    if (!confirm(`确定要开奖吗？当前有 ${entryCount} 人参与。开奖后活动将自动结束。`)) return;

    setLoading(true);
    const res = await fetch(`/api/business/campaigns/${campaignId}/draw`, { method: "POST" });
    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      setResult(data.data);
      router.refresh();
    } else {
      alert(data.error || "开奖失败");
    }
  }

  if (result) {
    return (
      <div className="text-center p-4 bg-green-50 rounded-xl">
        <p className="text-2xl mb-2">🎉</p>
        <p className="text-sm font-semibold text-green-800">开奖完成！</p>
        <p className="text-xs text-green-600 mt-1">
          {result.totalEntries} 人参与，{result.wonCount} 人中奖
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={handleDraw}
      disabled={loading || entryCount === 0}
      className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full font-semibold text-sm disabled:opacity-50 active:scale-95 transition-transform"
    >
      {loading ? "🎰 开奖中..." : entryCount === 0 ? "暂无参与者" : `🎰 立即开奖 (${entryCount}人参与)`}
    </button>
  );
}

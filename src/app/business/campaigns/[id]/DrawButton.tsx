"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dices, PartyPopper } from "lucide-react";

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
      <div className="text-center p-4 bg-green-50 dark:bg-green-950/40 rounded-xl">
        <PartyPopper size={26} className="mx-auto mb-2 text-green-700 dark:text-green-400" />
        <p className="text-sm font-semibold text-green-800 dark:text-green-300">开奖完成！</p>
        <p className="text-xs text-green-600 dark:text-green-400 mt-1 nums">
          {result.totalEntries} 人参与，{result.wonCount} 人中奖
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={handleDraw}
      disabled={loading || entryCount === 0}
      className="w-full inline-flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-full font-semibold text-sm disabled:opacity-50 active:scale-[0.97] transition-transform"
    >
      <Dices size={16} />
      <span className="nums">
        {loading ? "开奖中..." : entryCount === 0 ? "暂无参与者" : `立即开奖 (${entryCount}人参与)`}
      </span>
    </button>
  );
}

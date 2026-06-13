"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Prize {
  name: string;
  icon: string;
  type: string;
  valueCents: number;
  weight: number;
  totalStock: number | null;
}

export function PrizeEditor({ campaignId, currentPrizes }: { campaignId: string; currentPrizes: Prize[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prizes, setPrizes] = useState<Prize[]>(
    currentPrizes.length > 0 ? currentPrizes : [
      { name: "一等奖", icon: "🥇", type: "item", valueCents: 0, weight: 5, totalStock: 1 },
      { name: "二等奖", icon: "🥈", type: "item", valueCents: 0, weight: 15, totalStock: 3 },
      { name: "三等奖", icon: "🥉", type: "item", valueCents: 0, weight: 30, totalStock: 5 },
      { name: "参与奖", icon: "🎁", type: "item", valueCents: 0, weight: 50, totalStock: null },
    ]
  );
  const [loading, setLoading] = useState(false);

  function update(i: number, field: keyof Prize, value: any) {
    const next = [...prizes];
    (next[i] as any)[field] = value;
    setPrizes(next);
  }

  function add() {
    setPrizes([...prizes, { name: "", icon: "🎁", type: "item", valueCents: 0, weight: 10, totalStock: null }]);
  }

  function remove(i: number) {
    setPrizes(prizes.filter((_, idx) => idx !== i));
  }

  async function save() {
    setLoading(true);
    const res = await fetch(`/api/business/campaigns/${campaignId}/prizes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prizes }),
    });
    if (res.ok) {
      setOpen(false);
      router.refresh();
    }
    setLoading(false);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-[#1A6EFF] font-medium">
        {currentPrizes.length > 0 ? "编辑" : "+ 设置奖池"}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-auto">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
        <h2 className="text-sm font-semibold">设置奖池</h2>
        <button onClick={() => setOpen(false)} className="text-xs text-slate-500">取消</button>
      </div>

      <div className="p-4 space-y-3">
        {prizes.map((p, i) => (
          <div key={i} className="p-3 bg-slate-50 rounded-xl space-y-2">
            <div className="flex items-center gap-2">
              <input value={p.icon} onChange={(e) => update(i, "icon", e.target.value)} className="w-10 h-8 text-center rounded border border-slate-200 text-sm" placeholder="🎁" />
              <input value={p.name} onChange={(e) => update(i, "name", e.target.value)} className="flex-1 h-8 px-2 rounded border border-slate-200 text-sm" placeholder="奖品名称" />
              <select value={p.type} onChange={(e) => update(i, "type", e.target.value)} className="h-8 px-1 rounded border border-slate-200 text-xs">
                <option value="item">实物</option>
                <option value="cash">现金</option>
                <option value="coupon">代金券</option>
              </select>
              <button onClick={() => remove(i)} className="text-red-400 text-xs shrink-0">✕</button>
            </div>
            <div className="flex gap-2 text-xs">
              <div className="flex-1">
                <label className="text-[10px] text-slate-400">权重</label>
                <input type="number" value={p.weight} onChange={(e) => update(i, "weight", Number(e.target.value))} className="w-full h-7 px-2 rounded border border-slate-200 mt-0.5" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-slate-400">库存 (空=不限)</label>
                <input type="number" value={p.totalStock ?? ""} onChange={(e) => update(i, "totalStock", e.target.value ? Number(e.target.value) : null)} className="w-full h-7 px-2 rounded border border-slate-200 mt-0.5" />
              </div>
              {p.type === "cash" && (
                <div className="flex-1">
                  <label className="text-[10px] text-slate-400">金额(分)</label>
                  <input type="number" value={p.valueCents} onChange={(e) => update(i, "valueCents", Number(e.target.value))} className="w-full h-7 px-2 rounded border border-slate-200 mt-0.5" />
                </div>
              )}
            </div>
          </div>
        ))}

        <button onClick={add} className="w-full p-2 border-2 border-dashed border-slate-200 rounded-xl text-xs text-slate-400">+ 添加奖品</button>
        <button onClick={save} disabled={loading} className="w-full py-3 bg-[#1A6EFF] text-white rounded-full font-medium text-sm disabled:opacity-50">
          {loading ? "保存中..." : "保存奖池"}
        </button>
      </div>
    </div>
  );
}

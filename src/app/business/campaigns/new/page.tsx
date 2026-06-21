"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";

const types = [
  { key: "promotion", icon: "🏷️", label: "促销活动" },
  { key: "seasonal", icon: "🌸", label: "季节限定" },
  { key: "holiday", icon: "🎉", label: "节日活动" },
  { key: "event", icon: "📅", label: "特别事件" },
  { key: "launch", icon: "🚀", label: "新品发布" },
  { key: "lucky_draw", icon: "🎰", label: "幸运抽奖" },
  { key: "lucky_draw_v2", icon: "🎰", label: "幸运抽奖 V2" },
];

const colors = ["#FF6B35", "#1A6EFF", "#16A34A", "#DC2626", "#8B5CF6", "#F59E0B", "#EC4899", "#06B6D4"];

export default function NewCampaignPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("promotion");
  const [color, setColor] = useState("#FF6B35");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [drawDate, setDrawDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [minSpendCents, setMinSpendCents] = useState(0);
  const [maxEntries, setMaxEntries] = useState(0);
  const [entryMethod, setEntryMethod] = useState<"auto" | "receipt">("auto");
  const [receiptMinSpend, setReceiptMinSpend] = useState(5000);
  const [ticketsPerUnit, setTicketsPerUnit] = useState(1);
  const [budgetPercent, setBudgetPercent] = useState(20);
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) { setTags([...tags, t]); setTagInput(""); }
  }

  async function handleCreate() {
    if (!name) { setError("请输入活动名称"); return; }
    setLoading(true); setError("");

    const res = await fetch("/api/business/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, description, type, color, startDate, endDate, tags,
        ...(type === "lucky_draw" || type === "lucky_draw_v2" ? {
          drawDate: drawDate || undefined,
          minSpendCents: minSpendCents > 0 ? minSpendCents : undefined,
          maxEntries: maxEntries > 0 ? maxEntries : undefined,
          entryMethod,
          receiptMinSpend: entryMethod === "receipt" ? receiptMinSpend : undefined,
          ticketsPerUnit: entryMethod === "receipt" ? ticketsPerUnit : undefined,
          budgetPercent: entryMethod === "receipt" ? budgetPercent : undefined,
          slug: slug || undefined,
        } : {}),
      }),
    });

    if (res.ok) {
      const d = await res.json();
      router.push(`/business/campaigns/${d.data.id}`);
    } else {
      const d = await res.json();
      setError(d.error || "创建失败");
    }
    setLoading(false);
  }

  return (
    <div className="pb-4 min-h-screen flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100">
        <h1 className="text-lg font-semibold">创建活动</h1>
        <p className="text-xs text-slate-400 mt-0.5">创建一个活动来批量管理代金券</p>
      </div>

      <div className="flex-1 px-4 mt-4 space-y-4">
        <Input label="活动名称 *" placeholder="如：夏日清凉节" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="活动描述" placeholder="简要描述活动内容" value={description} onChange={(e) => setDescription(e.target.value)} />

        {/* 类型选择 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">活动类型</label>
          <div className="flex gap-1.5 flex-wrap">
            {types.map((t) => (
              <button key={t.key} onClick={() => setType(t.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${type === t.key ? "bg-[#1A6EFF] text-white" : "bg-slate-100 text-slate-500"}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 颜色 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">标签颜色</label>
          <div className="flex gap-2">
            {colors.map((c) => (
              <button key={c} onClick={() => setColor(c)} className={`w-7 h-7 rounded-full transition-transform ${color === c ? "scale-125 ring-2 ring-offset-2 ring-slate-400" : ""}`} style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>

        {/* 日期 */}
        <div className="grid grid-cols-2 gap-3">
          <Input label="开始日期" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="结束日期" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>

        {/* 抽奖专用设置 */}
        {(type === "lucky_draw" || type === "lucky_draw_v2") && (
          <div className="space-y-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
            <h3 className="text-sm font-semibold text-amber-800">🎰 抽奖设置</h3>

            {/* 参与模式 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">参与方式</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEntryMethod("auto")}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    entryMethod === "auto" ? "bg-amber-500 text-white" : "bg-white text-slate-500"
                  }`}
                >
                  🤖 消费自动
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMethod("receipt")}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    entryMethod === "receipt" ? "bg-amber-500 text-white" : "bg-white text-slate-500"
                  }`}
                >
                  📸 收据上传
                </button>
              </div>
            </div>

            <Input label="计划开奖日期" type="date" value={drawDate} onChange={(e) => setDrawDate(e.target.value)} />

            {/* 收据模式专属 */}
            {entryMethod === "receipt" ? (
              <>
                <Input label="公开页面标识 (slug)" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))} placeholder="如: byd-lucky-draw-2026" />
                <Input label="消费门槛 (分)" type="number" value={receiptMinSpend} onChange={(e) => setReceiptMinSpend(Number(e.target.value))} prefix="S$" placeholder="客户消费满多少可获得抽奖券" />
                <Input label="每满门槛得几张券" type="number" value={ticketsPerUnit} onChange={(e) => setTicketsPerUnit(Number(e.target.value))} />
                <Input label="预算占比 (%)" type="number" value={budgetPercent} onChange={(e) => setBudgetPercent(Number(e.target.value))} prefix="%" />
              </>
            ) : (
              <>
                <Input label="消费门槛 (分, 0=无门槛)" type="number" value={minSpendCents} onChange={(e) => setMinSpendCents(Number(e.target.value))} prefix="S$" />
                <Input label="参与上限 (0=不限)" type="number" value={maxEntries} onChange={(e) => setMaxEntries(Number(e.target.value))} />
              </>
            )}
          </div>
        )}

        {/* 标签 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">活动标签</label>
          <div className="flex gap-1 mb-2">
            <Input placeholder="输入标签，回车添加" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} />
            <Button size="sm" variant="outline" onClick={addTag}>添加</Button>
          </div>
          <div className="flex gap-1 flex-wrap">
            {tags.map((t) => (
              <span key={t} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full flex items-center gap-1">
                {t} <button onClick={() => setTags(tags.filter(x => x !== t))} className="text-slate-400">×</button>
              </span>
            ))}
          </div>
        </div>

        {/* 说明 */}
        <Card className="bg-blue-50 border-blue-100">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-blue-700 mb-2">💡 活动创建后可以</p>
            <ul className="text-xs text-blue-600 space-y-1">
              <li>• 批量创建代金券并关联到本活动</li>
              <li>• 统一设置推广奖励和领券赠品</li>
              <li>• 查看活动维度的领取/核销/转化数据</li>
              <li>• 对比不同活动的效果</li>
            </ul>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
      </div>

      <div className="px-4 py-3 border-t border-slate-100 bg-white">
        <Button className="w-full" size="lg" onClick={handleCreate} loading={loading}>创建活动</Button>
      </div>
    </div>
  );
}

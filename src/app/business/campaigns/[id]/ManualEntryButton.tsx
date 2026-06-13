"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ManualEntryButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    if (!name || !phone) return;
    setLoading(true);
    setMessage("");

    const res = await fetch(`/api/business/campaigns/${campaignId}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      setOpen(false);
      setName("");
      setPhone("");
      router.refresh();
    } else {
      setMessage(data.error || "录入失败");
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-[#1A6EFF] font-medium">
        + 手动录入
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-end" onClick={() => setOpen(false)}>
          <div className="w-full bg-white rounded-t-2xl p-5 max-w-lg mx-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">手动录入参与者</h3>
            <div className="space-y-2">
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" placeholder="客户姓名" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" placeholder="手机号" />
              {message && <p className="text-xs text-red-500">{message}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={submit} disabled={loading || !name || !phone} className="flex-1 h-10 bg-[#1A6EFF] text-white text-sm rounded-full disabled:opacity-50">
                  {loading ? "..." : "确认录入"}
                </button>
                <button onClick={() => setOpen(false)} className="flex-1 h-10 bg-slate-100 text-slate-500 text-sm rounded-full">取消</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

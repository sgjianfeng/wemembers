"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function GiftSheet({ claimId, couponTitle }: { claimId: string; couponTitle: string }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; error?: string } | null>(null);

  async function handleGift() {
    if (!phone) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/coupons/${claimId}/gift`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPhone: phone, message }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ success: true });
        setTimeout(() => { setShow(false); router.push("/wallet"); }, 1000);
      } else {
        setResult({ success: false, error: data.error || "转赠失败" });
      }
    } catch {
      setResult({ success: false, error: "网络错误" });
    }
    setLoading(false);
  }

  return (
    <>
      <Button className="w-full" variant="outline" size="lg" onClick={() => setShow(true)}>
        🎁 转赠给好友
      </Button>

      {show && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={() => setShow(false)}>
          <div className="w-full max-w-lg mx-auto bg-white rounded-t-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">转赠代金券</h3>
            <p className="text-sm text-slate-500 mb-4">{couponTitle}</p>

            <Input label="好友手机号" placeholder="输入手机号" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Input label="留言 (选填)" placeholder="如：请你喝杯咖啡~" className="mt-3" value={message} onChange={(e) => setMessage(e.target.value)} />

            {result && (
              <div className={`mt-3 p-3 rounded-xl text-sm text-center ${result.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                {result.success ? "转赠成功！🎉" : result.error}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <Button className="flex-1" variant="outline" onClick={() => setShow(false)}>取消</Button>
              <Button className="flex-1" onClick={handleGift} loading={loading}>确认转赠</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

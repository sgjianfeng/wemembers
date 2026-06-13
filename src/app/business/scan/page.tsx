"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default function ScanPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; couponTitle?: string; value?: number; tokenBalance?: number; error?: string } | null>(null);

  async function handleRedeem() {
    if (!code) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/business/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrCode: code.trim().toUpperCase() }),
      });
      const data = await res.json();
      setResult(data.data || { success: false, error: data.error || "核销失败" });
    } catch {
      setResult({ success: false, error: "网络错误" });
    }
    setLoading(false);
  }

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100">
        <h1 className="text-lg font-semibold">扫码核销</h1>
        <p className="text-xs text-slate-400 mt-0.5">输入客户券上的12位核销码</p>
      </div>

      <div className="px-4 mt-6">
        {/* Manual code entry */}
        <div className="bg-slate-50 rounded-xl p-4 mb-6 text-center">
          <p className="text-4xl mb-3">📷</p>
          <p className="text-sm text-slate-500 mb-4">请输入核销码</p>
          <Input
            placeholder="如: AB3F 9K2M 7W1Q"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="text-center text-lg font-mono tracking-widest"
            onKeyDown={(e) => e.key === "Enter" && handleRedeem()}
          />
          <Button className="w-full mt-3" size="lg" onClick={handleRedeem} loading={loading}>
            ✅ 确认核销
          </Button>
          <p className="text-[10px] text-slate-400 mt-2">消耗 2 🪙 Token</p>
        </div>

        {/* Result */}
        {result && (
          <Card className={result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
            <CardContent className="p-4 text-center">
              {result.success ? (
                <>
                  <p className="text-3xl mb-2">✅</p>
                  <p className="text-lg font-semibold text-green-800">核销成功</p>
                  <p className="text-sm text-green-700 mt-1">{result.couponTitle}</p>
                  <p className="text-2xl font-bold text-green-900 mt-2">¥{result.value?.toFixed(0)}</p>
                  {result.tokenBalance !== undefined && (
                    <Badge variant="slate" className="mt-2">余额: {result.tokenBalance}🪙</Badge>
                  )}
                </>
              ) : (
                <>
                  <p className="text-3xl mb-2">❌</p>
                  <p className="text-sm text-red-600">{result.error}</p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tips */}
        <div className="mt-8 p-4 bg-slate-50 rounded-xl">
          <h3 className="text-xs font-semibold text-slate-500 mb-2">💡 使用说明</h3>
          <ul className="text-xs text-slate-400 space-y-1">
            <li>• 客户出示券上的12位核销码</li>
            <li>• 输入或扫码核销码</li>
            <li>• 确认后券立即标记为已使用</li>
            <li>• 每核销一张券消耗 2 Token</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

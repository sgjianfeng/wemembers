"use client";

import { useState } from "react";

export function StripeSetupButton({ label }: { label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSetup() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/stripe/account", { method: "POST" });
      let data: { data?: { url?: string }; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        setError("服务器响应异常，请稍后重试");
        return;
      }

      if (data.data?.url) {
        window.location.href = data.data.url;
        return;
      }

      setError(
        data.error ||
          (res.ok ? "未获取到设置链接" : `设置失败 (${res.status})，请重试`)
      );
    } catch {
      setError("网络错误，请检查网络后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleSetup}
        disabled={loading}
        className="inline-block px-4 py-2 bg-[#1A6EFF] text-white text-sm rounded-full disabled:opacity-50"
      >
        {loading ? "跳转 Stripe 中…" : label}
      </button>
      {error && (
        <p className="text-xs text-red-600 leading-snug max-w-sm">{error}</p>
      )}
    </div>
  );
}

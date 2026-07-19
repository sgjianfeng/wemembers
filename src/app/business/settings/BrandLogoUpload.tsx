"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

/**
 * 通用企业品牌 Logo 上传 — 写入 User.businessLogo
 * 供：设置页、店铺页、实体券印刷、优惠券卡片等复用。
 */
export function BrandLogoUpload({
  initialUrl,
  lang,
}: {
  initialUrl: string | null;
  lang: "zh" | "en";
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(file: File | null) {
    if (!file) return;
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/business/logo", {
        method: "POST",
        body: form,
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error || (lang === "en" ? "Upload failed" : "上传失败"));
      } else {
        setUrl(j.data?.businessLogo || null);
        setMsg(lang === "en" ? "Logo updated" : "Logo 已更新");
        router.refresh();
      }
    } catch {
      setErr(lang === "en" ? "Network error" : "网络错误");
    }
    setLoading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function clearLogo() {
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/business/logo", { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error || (lang === "en" ? "Failed" : "清除失败"));
      } else {
        setUrl(null);
        setMsg(lang === "en" ? "Logo removed" : "已移除 Logo");
        router.refresh();
      }
    } catch {
      setErr(lang === "en" ? "Network error" : "网络错误");
    }
    setLoading(false);
  }

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            {lang === "en" ? "Brand logo" : "品牌 Logo"}
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
            {lang === "en"
              ? "Used on shop page, physical tickets, and coupons. PNG/JPG/WebP, max 2MB. Square works best."
              : "用于店铺页、实体券印刷、优惠展示等。支持 PNG/JPG/WebP，最大 2MB；建议方形透明底。"}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt="Logo"
                className="w-full h-full object-contain p-1"
              />
            ) : (
              <span className="text-2xl text-slate-300">🏷️</span>
            )}
          </div>
          <div className="flex flex-col gap-2 min-w-0">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] || null)}
            />
            <Button
              type="button"
              size="sm"
              loading={loading}
              onClick={() => inputRef.current?.click()}
            >
              {url
                ? lang === "en"
                  ? "Replace logo"
                  : "更换 Logo"
                : lang === "en"
                  ? "Upload logo"
                  : "上传 Logo"}
            </Button>
            {url && (
              <button
                type="button"
                disabled={loading}
                onClick={clearLogo}
                className="text-xs text-slate-400 hover:text-red-500 text-left"
              >
                {lang === "en" ? "Remove" : "移除"}
              </button>
            )}
          </div>
        </div>

        {err && <p className="text-xs text-red-500">{err}</p>}
        {msg && <p className="text-xs text-emerald-600">{msg}</p>}
      </CardContent>
    </Card>
  );
}

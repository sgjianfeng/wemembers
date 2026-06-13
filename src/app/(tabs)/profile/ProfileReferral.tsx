"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function ProfileReferral() {
  const [code, setCode] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/game/referral").then((r) => r.json()).then((d) => {
      setCode(d.data?.referralCode || null);
      setCount(d.data?.count || 0);
    });
  }, []);

  async function generate() {
    setLoading(true);
    const res = await fetch("/api/game/referral", { method: "POST" });
    const d = await res.json();
    setCode(d.data?.referralCode || null);
    setLoading(false);
  }

  function copyLink() {
    if (!code) return;
    navigator.clipboard.writeText(`wemembers://invite/${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="border-dashed border-amber-200">
      <CardContent className="p-4 text-center">
        <p className="text-sm font-semibold text-slate-900">🎁 邀请好友</p>
        <p className="text-xs text-slate-500 mt-1">你和好友各得 100 积分</p>

        {code ? (
          <div className="mt-3">
            <div className="bg-slate-50 rounded-lg px-3 py-2 font-mono text-sm text-slate-700 tracking-widest">
              {code}
            </div>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={copyLink}>
                {copied ? "已复制 ✓" : "复制链接"}
              </Button>
            </div>
            {count > 0 && <p className="text-xs text-slate-400 mt-2">已邀请 {count} 位好友</p>}
          </div>
        ) : (
          <Button size="sm" variant="primary" className="mt-3" onClick={generate} loading={loading}>
            生成我的邀请码
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

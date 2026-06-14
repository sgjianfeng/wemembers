"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function DiscoverPartnersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState("");

  async function load() {
    setLoading(true);
    const url = `/api/business/partners/discover${search ? `?search=${encodeURIComponent(search)}` : ""}`;
    const res = await fetch(url);
    const data = await res.json();
    setBusinesses(data.data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function invite(partnerId: string) {
    setActing(partnerId);
    await fetch("/api/business/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerId }),
    });
    setActing("");
    router.refresh();
    load();
  }

  const statusLabels: Record<string, { variant: "green" | "orange" | "red" | "slate"; label: string }> = {
    active: { variant: "green", label: "已合作" },
    pending: { variant: "orange", label: "处理中" },
  };

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
        <h1 className="text-lg font-semibold">发现商家</h1>
        <p className="text-xs text-slate-400 mt-0.5">搜索并邀请其他商家建立合作关系</p>
      </div>

      <div className="px-4 pt-3">
        <form
          onSubmit={(e) => { e.preventDefault(); load(); }}
          className="flex gap-2"
        >
          <Input
            placeholder="搜索商家名称..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <Button size="sm" onClick={load} loading={loading}>搜索</Button>
        </form>
      </div>

      <div className="px-4 mt-3 space-y-2">
        {businesses.map((b) => {
          const rel = b.partnership;
          const sb = rel ? (statusLabels[rel.status] || { variant: "slate" as const, label: rel.status }) : null;
          return (
            <Card key={b.id}>
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl shrink-0">🏢</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{b.businessName}</p>
                    <p className="text-[10px] text-slate-400">
                      {b.categoryLabel || b.businessCategory || ""}
                      {b.createdAt && ` · ${new Date(b.createdAt).toLocaleDateString("zh-CN")} 加入`}
                    </p>
                  </div>
                </div>
                {sb ? (
                  <Badge variant={sb.variant} size="sm">{sb.label}</Badge>
                ) : (
                  <button
                    onClick={() => invite(b.id)}
                    disabled={acting === b.id}
                    className="px-3 py-1 bg-[#1A6EFF] text-white text-xs rounded-full disabled:opacity-50 shrink-0"
                  >
                    {acting === b.id ? "..." : "邀请合作"}
                  </button>
                )}
              </CardContent>
            </Card>
          );
        })}
        {businesses.length === 0 && !loading && (
          <div className="text-center py-12 text-slate-400">
            <p className="text-3xl mb-2">🔍</p>
            <p className="text-sm">没有找到商家</p>
          </div>
        )}
      </div>
    </div>
  );
}

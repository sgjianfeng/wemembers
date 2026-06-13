"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";

export function StoreCreateForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full p-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:border-[#1A6EFF] hover:text-[#1A6EFF]"
      >
        + 新增门店
      </button>
    );
  }

  async function handleCreate() {
    if (!name) return;
    setLoading(true);
    const res = await fetch("/api/business/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, address, phone }),
    });
    if (res.ok) {
      setOpen(false);
      setName("");
      setAddress("");
      setPhone("");
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <Input
          label="门店名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如：星巴克·国贸店"
        />
        <Input
          label="地址"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="选填"
        />
        <Input
          label="电话"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="选填"
        />
        <div className="flex gap-2">
          <Button className="flex-1" onClick={handleCreate} loading={loading}>
            创建
          </Button>
          <button
            onClick={() => setOpen(false)}
            className="flex-1 h-10 text-sm text-slate-500 bg-slate-100 rounded-full"
          >
            取消
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

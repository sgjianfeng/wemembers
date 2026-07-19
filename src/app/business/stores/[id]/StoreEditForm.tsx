"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";

interface Props {
  storeId: string;
  initial: {
    name: string;
    address: string;
    phone: string;
  };
  lang: "zh" | "en";
}

export function StoreEditForm({ storeId, initial, lang }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address);
  const [phone, setPhone] = useState(initial.phone);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      setErr(lang === "en" ? "Store name is required" : "请填写门店名称");
      return;
    }
    setLoading(true);
    setMsg(null);
    setErr(null);
    const res = await fetch(`/api/business/stores/${storeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        address: address.trim() || null,
        phone: phone.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setErr(
        (data as { error?: string }).error ||
          (lang === "en" ? "Save failed" : "保存失败")
      );
      return;
    }
    setMsg(lang === "en" ? "Saved" : "已保存");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setMsg(null);
          setErr(null);
        }}
        className="text-xs font-medium text-[#1A6EFF] hover:underline"
      >
        {lang === "en" ? "Edit name / address / phone" : "编辑名称 / 地址 / 电话"}
      </button>
    );
  }

  return (
    <Card className="mt-2 border-slate-200">
      <CardContent className="p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-900">
          {lang === "en" ? "Edit store" : "编辑门店信息"}
        </p>
        <Input
          label={lang === "en" ? "Store name" : "门店名称"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={lang === "en" ? "e.g. Meow BBQ Vivo City" : "如：Meow BBQ Vivo City"}
        />
        <Input
          label={lang === "en" ? "Address" : "地址 / 门牌"}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={
            lang === "en"
              ? "e.g. 1 HarbourFront Walk, #02-156/157 VivoCity"
              : "如：1 HarbourFront Walk, #02-156/157 VivoCity"
          }
        />
        <Input
          label={lang === "en" ? "Phone" : "电话"}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="91251676"
        />
        {err && <p className="text-xs text-red-500">{err}</p>}
        {msg && <p className="text-xs text-emerald-600">{msg}</p>}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={save} loading={loading}>
            {lang === "en" ? "Save" : "保存"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setName(initial.name);
              setAddress(initial.address);
              setPhone(initial.phone);
              setErr(null);
            }}
            className="flex-1 h-10 text-sm text-slate-500 bg-slate-100 rounded-full"
          >
            {lang === "en" ? "Cancel" : "取消"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

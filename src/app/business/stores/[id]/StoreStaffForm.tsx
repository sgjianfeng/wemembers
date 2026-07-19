"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";

/**
 * 企业在门店详情添加店员（手机号 + 可选初始密码）
 */
export function StoreStaffForm({
  storeId,
  lang,
}: {
  storeId: string;
  lang: "zh" | "en";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function submit() {
    setLoading(true);
    setErr("");
    setMsg("");
    const res = await fetch(`/api/business/stores/${storeId}/staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: phone.trim(),
        displayName: displayName.trim() || undefined,
        password: password.trim() || undefined,
      }),
    });
    const j = await res.json();
    setLoading(false);
    if (!res.ok) {
      setErr(j.error || (lang === "en" ? "Failed" : "添加失败"));
      return;
    }
    setMsg(
      lang === "en"
        ? "Staff added. They log in with phone + password (or SMS code)."
        : "已添加。店员用手机号+密码登录（或短信验证码）。"
    );
    setPhone("");
    setDisplayName("");
    setPassword("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-[#1A6EFF] hover:underline"
      >
        {lang === "en" ? "+ Add staff" : "+ 添加店员"}
      </button>
    );
  }

  return (
    <Card className="mt-2 border-slate-200">
      <CardContent className="p-3 space-y-2">
        <p className="text-sm font-semibold text-slate-900">
          {lang === "en" ? "Add store staff" : "添加本店店员"}
        </p>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {lang === "en"
            ? "Phone login · redeem only. Optional password (min 6)."
            : "手机号登录 · 仅核销本店。建议设初始密码（≥6 位），也可用短信验证码登录后设密。"}
        </p>
        <Input
          label={lang === "en" ? "Phone" : "手机号"}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="91251676"
          inputMode="tel"
        />
        <Input
          label={lang === "en" ? "Display name" : "姓名（可选）"}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={lang === "en" ? "e.g. Manager Amy" : "如：店长 Amy"}
        />
        <Input
          label={lang === "en" ? "Initial password" : "初始密码（建议填写）"}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••"
          autoComplete="new-password"
        />
        {err && <p className="text-xs text-red-500">{err}</p>}
        {msg && <p className="text-xs text-emerald-600">{msg}</p>}
        <div className="flex gap-2">
          <Button className="flex-1" size="sm" onClick={submit} loading={loading}>
            {lang === "en" ? "Save" : "保存"}
          </Button>
          <button
            type="button"
            className="flex-1 h-9 text-xs text-slate-500 bg-slate-100 rounded-full"
            onClick={() => setOpen(false)}
          >
            {lang === "en" ? "Cancel" : "取消"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

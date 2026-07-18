"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useLang } from "@/components/i18n/LanguageProvider";

export function ProfileEditName({ initialName }: { initialName: string }) {
  const router = useRouter();
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error || (lang === "en" ? "Failed" : "失败"));
      } else {
        setOpen(false);
        router.refresh();
      }
    } catch {
      setErr(lang === "en" ? "Network error" : "网络错误");
    }
    setLoading(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[10px] text-white/80 underline underline-offset-2"
      >
        {lang === "en" ? "Edit name" : "改昵称"}
      </button>
    );
  }

  return (
    <div className="mt-2 p-3 bg-white/90 rounded-xl space-y-2 text-left">
      <Input
        label={lang === "en" ? "Display name" : "昵称"}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {err && <p className="text-[10px] text-red-500">{err}</p>}
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" loading={loading} onClick={save}>
          {lang === "en" ? "Save" : "保存"}
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
          {lang === "en" ? "Cancel" : "取消"}
        </Button>
      </div>
    </div>
  );
}

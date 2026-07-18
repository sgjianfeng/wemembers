"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { SERVICE_CATEGORIES } from "@/types";
import { useLang } from "@/components/i18n/LanguageProvider";

interface Props {
  initial: {
    businessName: string;
    businessCategory: string;
    displayName: string;
    phone: string;
    email: string;
  };
}

export function SettingsEditForm({ initial }: Props) {
  const router = useRouter();
  const { t, lang } = useLang();
  const [businessName, setBusinessName] = useState(initial.businessName);
  const [businessCategory, setBusinessCategory] = useState(initial.businessCategory);
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [phone, setPhone] = useState(initial.phone);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/business/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, businessCategory, displayName, phone }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error || (lang === "en" ? "Save failed" : "保存失败"));
      } else {
        setMsg(lang === "en" ? "Saved" : "已保存");
        router.refresh();
      }
    } catch {
      setErr(lang === "en" ? "Network error" : "网络错误");
    }
    setLoading(false);
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">
          {t("business.settings.shopInfo") || (lang === "en" ? "Company info" : "店铺信息")}
        </h3>
        <Input
          label={lang === "en" ? "Company name" : "公司名称"}
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
        />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {lang === "en" ? "Category" : "行业"}
          </label>
          <select
            value={businessCategory}
            onChange={(e) => setBusinessCategory(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">{lang === "en" ? "Select" : "选择"}</option>
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {lang === "en" ? c.value : c.label}
              </option>
            ))}
          </select>
        </div>
        <Input
          label={lang === "en" ? "Contact name" : "联系人"}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Input
          label={lang === "en" ? "Phone" : "电话"}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <p className="text-[10px] text-slate-400">
          {lang === "en" ? "Email (read-only)" : "邮箱（只读）"}: {initial.email || "—"}
        </p>
        {msg && <p className="text-xs text-green-600 text-center">{msg}</p>}
        {err && <p className="text-xs text-red-500 text-center">{err}</p>}
        <Button className="w-full" size="sm" loading={loading} onClick={save}>
          {lang === "en" ? "Save" : "保存"}
        </Button>
      </CardContent>
    </Card>
  );
}

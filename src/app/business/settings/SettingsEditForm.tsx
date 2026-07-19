"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { SERVICE_CATEGORIES } from "@/types";
import { useLang } from "@/components/i18n/LanguageProvider";
import { isValidBusinessSlug, toEnglishSlug } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  initial: {
    businessName: string;
    businessSlug: string;
    businessUen: string;
    businessCategory: string;
    displayName: string;
    phone: string;
    email: string;
  };
  shopBaseUrl: string;
}

export function SettingsEditForm({ initial, shopBaseUrl }: Props) {
  const router = useRouter();
  const { lang } = useLang();
  const [businessName, setBusinessName] = useState(initial.businessName);
  const [businessUen, setBusinessUen] = useState(initial.businessUen);
  const [businessSlug, setBusinessSlug] = useState(
    // 若历史 slug 含非英文，预填为净化后的版本方便保存
    toEnglishSlug(initial.businessSlug || initial.businessName || "shop", "shop")
  );
  const [businessCategory, setBusinessCategory] = useState(initial.businessCategory);
  const [displayName, setDisplayName] = useState(
    // 联系人若是邮箱前缀，清空让用户填姓名；登录邮箱单独展示
    initial.displayName &&
      initial.email &&
      initial.displayName === initial.email.split("@")[0]
      ? ""
      : initial.displayName
  );
  const [phone, setPhone] = useState(initial.phone);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const slugPreview = useMemo(() => {
    const s = businessSlug.trim().toLowerCase();
    return s || "your-id";
  }, [businessSlug]);

  function onSlugChange(raw: string) {
    // 只允许输入英文标识相关字符
    const cleaned = raw
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/--+/g, "-")
      .slice(0, 48);
    setBusinessSlug(cleaned);
  }

  function suggestSlugFromName() {
    const s = toEnglishSlug(businessName, "shop");
    if (s) setBusinessSlug(s);
  }

  async function save() {
    setLoading(true);
    setMsg(null);
    setErr(null);

    const slug = businessSlug.trim().toLowerCase().replace(/^-+|-+$/g, "");
    if (!isValidBusinessSlug(slug)) {
      setErr(
        lang === "en"
          ? "English ID: 2–48 chars, a-z, 0-9, hyphens only"
          : "英文标识：2–48 位，仅小写字母、数字、连字符"
      );
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/business/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          businessSlug: slug,
          businessUen,
          businessCategory,
          displayName,
          phone,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error || (lang === "en" ? "Save failed" : "保存失败"));
      } else {
        setMsg(lang === "en" ? "Saved" : "已保存");
        if (json.data?.businessSlug) setBusinessSlug(json.data.businessSlug);
        router.refresh();
      }
    } catch {
      setErr(lang === "en" ? "Network error" : "网络错误");
    }
    setLoading(false);
  }

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardContent className="p-4 space-y-3 min-w-0">
        <h3 className="text-sm font-semibold text-slate-900">
          {lang === "en" ? "Company profile" : "企业信息"}
        </h3>

        <Input
          label={lang === "en" ? "Company name" : "公司名称"}
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder={
            lang === "en" ? "Legal / trading name" : "注册名或经营名（可中英）"
          }
        />

        <Input
          label={lang === "en" ? "Singapore UEN" : "新加坡 UEN"}
          value={businessUen}
          onChange={(e) =>
            setBusinessUen(e.target.value.toUpperCase().replace(/\s+/g, ""))
          }
          placeholder="201912345A"
          className="font-mono tracking-wide"
        />
        <p className="-mt-1 text-[11px] text-slate-400">
          {lang === "en"
            ? "Unique Entity Number — company legal ID"
            : "企业唯一识别号；用于主体识别"}
        </p>

        {/* 英文标识 — 唯一、搜索、二维码 */}
        <div className="w-full min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="block text-sm font-medium text-foreground">
              {lang === "en" ? "Company English ID" : "企业英文标识"}
            </label>
            <button
              type="button"
              onClick={suggestSlugFromName}
              className="text-[11px] font-medium text-[#1A6EFF] shrink-0"
            >
              {lang === "en" ? "From company name" : "从公司名生成"}
            </button>
          </div>
          <div className="flex items-center gap-0 min-w-0 rounded-lg border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-inset">
            <span className="pl-3 pr-1 text-xs text-slate-400 shrink-0 select-none">
              @
            </span>
            <input
              value={businessSlug}
              onChange={(e) => onSlugChange(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="meow-bbq"
              className={cn(
                "flex h-10 w-full min-w-0 flex-1 bg-transparent py-2 pr-3 text-sm",
                "placeholder:text-muted-foreground focus-visible:outline-none"
              )}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400 leading-relaxed break-all">
            {lang === "en" ? "Company / store URLs: " : "企业与门店链接："}
            <span className="font-mono text-slate-600">
              {shopBaseUrl}/shop/{slugPreview}
            </span>
            <span className="text-slate-300"> / </span>
            <span className="font-mono text-slate-500">{"{store-slug}"}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {lang === "en"
              ? "a-z, 0-9, hyphens — company slug is global unique"
              : "仅小写字母、数字、连字符 · 企业标识全局唯一"}
          </p>
        </div>

        <div className="w-full min-w-0">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {lang === "en" ? "Category" : "行业"}
          </label>
          <select
            value={businessCategory}
            onChange={(e) => setBusinessCategory(e.target.value)}
            className="flex h-10 w-full min-w-0 max-w-full box-border rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">{lang === "en" ? "Select" : "选择"}</option>
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {lang === "en" ? c.value : c.label}
              </option>
            ))}
          </select>
        </div>

        {/* 登录邮箱完整展示 */}
        <div className="w-full min-w-0 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
          <p className="text-xs text-slate-400 mb-0.5">
            {lang === "en" ? "Login email" : "登录邮箱"}
          </p>
          <p className="text-sm font-medium text-slate-900 break-all">
            {initial.email || "—"}
          </p>
        </div>

        <Input
          label={lang === "en" ? "Contact person" : "联系人姓名"}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={
            lang === "en" ? "Person in charge (not email)" : "负责人姓名（非邮箱）"
          }
        />
        <Input
          label={lang === "en" ? "Phone" : "联系电话"}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={lang === "en" ? "Optional" : "选填"}
        />

        {msg && <p className="text-xs text-green-600 text-center">{msg}</p>}
        {err && <p className="text-xs text-red-500 text-center break-words">{err}</p>}
        <Button className="w-full" size="sm" loading={loading} onClick={save}>
          {lang === "en" ? "Save changes" : "保存修改"}
        </Button>
      </CardContent>
    </Card>
  );
}

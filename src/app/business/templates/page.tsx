"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { useLang } from "@/components/i18n/LanguageProvider";
import { FEE_PLATFORM_PERCENT } from "@/lib/activity-fees";

type Copyable = {
  id: string;
  nameZh: string;
  nameEn: string;
  icon: string;
  taglineZh: string;
  taglineEn: string;
  kind: string;
  discountPercentDefault: number;
  discountPercentMin: number;
  discountPercentMax: number;
  exclusiveFeeTotalPercent: number | null;
  exclusiveSmallDefault: number | null;
  exclusiveGrandDefault: number | null;
  platformFeeLocked: number;
  tiers: number[];
};

type Mine = {
  id: string;
  name: string;
  baseTemplateId: string;
  baseNameZh: string;
  kind: string;
  discountPercent: number | null;
  exclusiveTotalPercent: number | null;
  exclusiveSmallPrizePercent: number | null;
  exclusivePlatformFeePercent: number;
  exclusiveGrandPoolPercent: number | null;
  enabledTiers: number[];
  isExclusive: boolean;
  isVoucher: boolean;
};

export default function BusinessTemplatesPage() {
  const { lang } = useLang();
  const router = useRouter();
  const [copyable, setCopyable] = useState<Copyable[]>([]);
  const [mine, setMine] = useState<Mine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Copyable | null>(null);
  const [saving, setSaving] = useState(false);

  // form
  const [name, setName] = useState("");
  const [discount, setDiscount] = useState(10);
  const [totalPct, setTotalPct] = useState(15);
  const [smallPct, setSmallPct] = useState(3);
  const [grandPct, setGrandPct] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/business/templates");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "load failed");
        return;
      }
      const j = await res.json();
      setCopyable(j.data?.copyable || []);
      setMine(j.data?.mine || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCopy(c: Copyable) {
    setEditing(c);
    setName(
      lang === "en"
        ? `My ${c.nameEn}`
        : `我的${c.nameZh}`
    );
    setDiscount(c.discountPercentDefault);
    if (c.exclusiveFeeTotalPercent) {
      setTotalPct(c.exclusiveFeeTotalPercent);
      setSmallPct(c.exclusiveSmallDefault ?? 3);
      setGrandPct(c.exclusiveGrandDefault ?? 10);
    }
    setError("");
  }

  // 总率变化时：保持小奖，重算大奖 = total - 2 - small
  function onTotalChange(v: number) {
    setTotalPct(v);
    const g = v - FEE_PLATFORM_PERCENT - smallPct;
    if (g >= 1) setGrandPct(g);
  }

  function onSmallChange(v: number) {
    setSmallPct(v);
    const g = totalPct - FEE_PLATFORM_PERCENT - v;
    if (g >= 1) setGrandPct(g);
  }

  function onGrandChange(v: number) {
    setGrandPct(v);
    const t = v + FEE_PLATFORM_PERCENT + smallPct;
    setTotalPct(t);
  }

  async function saveCopy() {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        baseTemplateId: editing.id,
        name: name.trim(),
        enabledTiers: editing.tiers,
      };
      if (editing.kind === "voucher_discount") {
        body.discountPercent = discount;
      } else {
        body.exclusiveTotalPercent = totalPct;
        body.exclusiveSmallPrizePercent = smallPct;
        body.exclusiveGrandPoolPercent = grandPct;
      }
      const res = await fetch("/api/business/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "save failed");
        return;
      }
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function archive(id: string) {
    if (!confirm(lang === "en" ? "Archive this template?" : "归档此模版？")) return;
    await fetch(`/api/business/templates/${id}`, { method: "DELETE" });
    await load();
  }

  function createCampaign(id: string) {
    router.push(`/business/campaigns/new?businessTemplateId=${id}`);
  }

  const sumOk =
    !editing ||
    editing.kind === "voucher_discount" ||
    smallPct + FEE_PLATFORM_PERCENT + grandPct === totalPct;

  return (
    <div className="pb-10 min-h-screen">
      <div className="px-4 py-3 border-b border-border sticky top-0 bg-card z-10">
        <div className="flex items-center gap-3">
          <Link href="/business/hub" className="text-xs text-primary font-medium">
            ← {lang === "en" ? "Tools" : "工具"}
          </Link>
        </div>
        <h1 className="text-lg font-semibold mt-1">
          {lang === "en" ? "My templates" : "我的模版"}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {lang === "en"
            ? "Fee/discount rules only — not sellable. Sell under Voucher products."
            : "只存费率/折扣规则，不能直接卖。真正上架请用「券产品」。"}
        </p>
      </div>

      <div className="px-4 mt-3">
        <Link
          href="/business/products"
          className="block rounded-2xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-[11px] leading-relaxed"
        >
          <span className="font-medium text-foreground">
            {lang === "en" ? "Next step: " : "下一步："}
          </span>
          <span className="text-muted-foreground">
            {lang === "en"
              ? "Create sellable products from default packs (with purchase links)."
              : "在「券产品」用默认包创建可售卖线（带购买链接）。"}
          </span>
          <span className="text-primary font-medium ml-1">→</span>
        </Link>
      </div>

      <div className="px-4 mt-4 space-y-6">
        {/* 我的 */}
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-2">
            {lang === "en" ? "Saved" : "已保存"}
          </h2>
          {loading ? (
            <p className="text-xs text-muted-foreground">…</p>
          ) : mine.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {lang === "en"
                ? "None yet — copy a platform template below."
                : "暂无。请从下方拷贝平台模版。"}
            </p>
          ) : (
            <ul className="space-y-2">
              {mine.map((m) => (
                <Card key={m.id} className="border-border">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {m.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {m.baseNameZh}
                          {m.isVoucher && m.discountPercent != null
                            ? ` · ${lang === "en" ? "discount" : "折扣"} ${m.discountPercent}%`
                            : ""}
                          {m.isExclusive && m.exclusiveTotalPercent != null
                            ? ` · ${m.exclusiveTotalPercent}% = ${m.exclusiveSmallPrizePercent}+${m.exclusivePlatformFeePercent}+${m.exclusiveGrandPoolPercent}`
                            : ""}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {m.enabledTiers.map((a) => `S$${a}`).join(" / ")}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <Button
                          className="h-8 text-xs px-3"
                          onClick={() => createCampaign(m.id)}
                        >
                          {lang === "en" ? "Use" : "用此创建"}
                        </Button>
                        <button
                          type="button"
                          className="text-[10px] text-muted-foreground"
                          onClick={() => archive(m.id)}
                        >
                          {lang === "en" ? "Archive" : "归档"}
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </ul>
          )}
        </section>

        {/* 平台可拷贝 */}
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-2">
            {lang === "en" ? "Copy from platform" : "从平台拷贝"}
          </h2>
          <div className="space-y-2">
            {copyable.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openCopy(c)}
                className="w-full text-left rounded-2xl border border-border bg-card p-3 hover:border-primary/40 transition-colors"
              >
                <p className="text-sm font-semibold">
                  {c.icon} {lang === "en" ? c.nameEn : c.nameZh}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {lang === "en" ? c.taglineEn : c.taglineZh}
                </p>
              </button>
            ))}
          </div>
        </section>

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
      </div>

      {/* 拷贝弹层 */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-card w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold">
              {lang === "en" ? "Copy template" : "拷贝模版"}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {editing.icon}{" "}
              {lang === "en" ? editing.nameEn : editing.nameZh}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">
                  {lang === "en" ? "Name" : "模版名称"}
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                />
              </div>

              {editing.kind === "voucher_discount" ? (
                <div>
                  <label className="text-xs text-muted-foreground">
                    {lang === "en"
                      ? `Discount % (${editing.discountPercentMin}–${editing.discountPercentMax})`
                      : `折扣率 %（${editing.discountPercentMin}–${editing.discountPercentMax}）`}
                  </label>
                  <Input
                    type="number"
                    min={editing.discountPercentMin}
                    max={editing.discountPercentMax}
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                    className="mt-1"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {lang === "en"
                      ? `Pay ${100 - discount} get 100`
                      : `付 ${100 - discount} 得 100`}
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground">
                      {lang === "en" ? "Total fee %" : "总扣点 %"}
                    </label>
                    <Input
                      type="number"
                      min={5}
                      max={30}
                      value={totalPct}
                      onChange={(e) => onTotalChange(Number(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">
                      {lang === "en" ? "Small prize %" : "小奖比例 %"}
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={25}
                      value={smallPct}
                      onChange={(e) => onSmallChange(Number(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">
                      {lang === "en" ? "Platform fee % (locked)" : "平台服务费 %（不可改）"}
                    </label>
                    <Input
                      type="number"
                      value={FEE_PLATFORM_PERCENT}
                      disabled
                      className="mt-1 opacity-60"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">
                      {lang === "en" ? "Grand prize %" : "大奖比例 %"}
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={25}
                      value={grandPct}
                      onChange={(e) => onGrandChange(Number(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                  <p
                    className={`text-[11px] ${
                      sumOk ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                    }`}
                  >
                    {smallPct} + {FEE_PLATFORM_PERCENT} + {grandPct} ={" "}
                    {smallPct + FEE_PLATFORM_PERCENT + grandPct}
                    {sumOk
                      ? lang === "en"
                        ? " ✓ matches total"
                        : " ✓ 等于总扣点"
                      : lang === "en"
                        ? ` ✗ must equal ${totalPct}`
                        : ` ✗ 须等于总扣点 ${totalPct}`}
                  </p>
                </>
              )}
            </div>

            <div className="flex gap-2 mt-5">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setEditing(null)}
              >
                {lang === "en" ? "Cancel" : "取消"}
              </Button>
              <Button
                className="flex-1"
                loading={saving}
                disabled={!sumOk || !name.trim()}
                onClick={saveCopy}
              >
                {lang === "en" ? "Save copy" : "保存拷贝"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

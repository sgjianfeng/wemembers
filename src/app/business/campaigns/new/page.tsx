"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { useLang } from "@/components/i18n/LanguageProvider";
import { VoucherTypePicker } from "@/components/voucher/VoucherTypePicker";
import type { ProductKind } from "@/lib/product-kind";

interface GrandPrizeEdit {
  id: string;
  name: string;
  icon: string;
  targetCents: number;
}

interface TemplateDto {
  id: string;
  nameZh: string;
  nameEn: string;
  icon: string;
  taglineZh: string;
  taglineEn: string;
  lockedSummaryZh: string;
  editable: string[];
  rules: {
    allowDiscount: boolean;
    discountPercentDefault: number;
    discountPercentMin: number;
    discountPercentMax: number;
    sellerCommissionPercent: number;
    platformFeePercent: number;
    prizePoolPercent: number;
    shareSellingDefault: boolean;
    tiers: { amountSgd: number; enabledByDefault: boolean }[];
  };
  prizePack?: {
    grandPrizes?: {
      id: string;
      name?: string;
      nameZh?: string;
      icon: string;
      targetCents: number;
    }[];
  } | null;
}

const PRIZE_ICONS = ["📲", "📱", "🚗", "🎁", "💻", "🎧", "⌚", "🎮", "☕", "🍰", "🎫", "🏆", "💎", "🛵"];

interface PartnerOption {
  id: string;
  businessName: string | null;
  name: string | null;
}

const colors = ["#FF6B35", "#1A6EFF", "#16A34A", "#DC2626", "#8B5CF6", "#F59E0B", "#EC4899", "#06B6D4"];

type BusinessTpl = {
  id: string;
  name: string;
  baseTemplateId: string;
  kind: string;
  discountPercent: number | null;
  exclusiveTotalPercent: number | null;
  exclusiveSmallPrizePercent: number | null;
  exclusivePlatformFeePercent: number;
  exclusiveGrandPoolPercent: number | null;
  enabledTiers: number[];
};

export default function NewCampaignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preBizTpl = searchParams.get("businessTemplateId");
  const { t: tr, lang } = useLang();
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [bizTemplates, setBizTemplates] = useState<BusinessTpl[]>([]);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [step, setStep] = useState<"kind" | "pick" | "configure">("kind");
  const [productKind, setProductKind] = useState<ProductKind | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [businessTemplateId, setBusinessTemplateId] = useState<string | null>(
    preBizTpl
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#1A6EFF");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [discountPercent, setDiscountPercent] = useState(20);
  // 抽奖默认三档；代金模板会在选模板时改成含 S$10 的默认
  const [enabledTiers, setEnabledTiers] = useState<number[]>([50, 100, 200]);
  const [shareSelling, setShareSelling] = useState(true);
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [grandPrizes, setGrandPrizes] = useState<GrandPrizeEdit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => templates.find((t) => t.id === templateId) || null,
    [templates, templateId]
  );

  useEffect(() => {
    (async () => {
      const [tr, pr, bt] = await Promise.all([
        fetch("/api/business/campaigns/templates"),
        fetch("/api/business/partners"),
        fetch("/api/business/templates"),
      ]);
      if (tr.ok) {
        const j = await tr.json();
        setTemplates(j.data || []);
      }
      if (pr.ok) {
        const j = await pr.json();
        const list = j.data || [];
        const opts: PartnerOption[] = [];
        for (const row of list) {
          if (row.status && row.status !== "active") continue;
          if (row.partner?.id) {
            opts.push({
              id: row.partner.id,
              businessName: row.partner.businessName ?? null,
              name: null,
            });
          }
          if (row.business?.id) {
            opts.push({
              id: row.business.id,
              businessName: row.business.businessName ?? null,
              name: null,
            });
          }
        }
        const seen = new Set<string>();
        setPartners(opts.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))));
      }
      let mine: BusinessTpl[] = [];
      if (bt.ok) {
        const j = await bt.json();
        mine = j.data?.mine || [];
        setBizTemplates(mine);
      }

      // URL 预选企业模版 → 直接进配置
      if (preBizTpl && mine.length) {
        const m = mine.find((x) => x.id === preBizTpl);
        if (m) {
          setBusinessTemplateId(m.id);
          setTemplateId(m.baseTemplateId);
          setProductKind("self_use");
          setDiscountPercent(m.discountPercent ?? 10);
          setEnabledTiers(
            m.enabledTiers?.length ? m.enabledTiers : [50, 100, 200]
          );
          setShareSelling(false);
          setName(m.name);
          setStep("configure");
        }
      }
    })();
  }, [preBizTpl]);

  const visibleTemplates = useMemo(() => {
    if (productKind === "self_use") {
      // 自用代金 + 独享 15%/10%；旧 voucher_discount/draw_standard 不再作为自用入口
      return templates.filter(
        (t) =>
          t.id === "self_use_voucher" ||
          t.id === "exclusive_draw_15" ||
          t.id === "exclusive_draw_10"
      );
    }
    // 分发：共赢模版；隐藏纯自用/独享模版
    return templates.filter(
      (t) =>
        t.id !== "self_use_voucher" &&
        t.id !== "exclusive_draw_15" &&
        t.id !== "exclusive_draw_10"
    );
  }, [templates, productKind]);

  function pickBusinessTemplate(m: BusinessTpl) {
    setBusinessTemplateId(m.id);
    setTemplateId(m.baseTemplateId);
    setProductKind("self_use");
    setDiscountPercent(m.discountPercent ?? 10);
    setEnabledTiers(m.enabledTiers?.length ? m.enabledTiers : [50, 100, 200]);
    setShareSelling(false);
    setSelectedPartners([]);
    setName(m.name);
    setGrandPrizes([]);
    setStep("configure");
  }

  function pickTemplate(t: TemplateDto) {
    setBusinessTemplateId(null);
    setTemplateId(t.id);
    setDiscountPercent(t.rules.discountPercentDefault);
    if (productKind === "self_use") {
      const tiers = t.rules.tiers
        .filter((x) => x.enabledByDefault)
        .map((x) => x.amountSgd);
      setEnabledTiers(
        tiers.length
          ? tiers
          : t.id.startsWith("exclusive_draw")
            ? [50, 100, 200]
            : [10, 20, 50, 100, 200]
      );
      setShareSelling(false);
      setSelectedPartners([]);
      setGrandPrizes(
        t.id.startsWith("exclusive_draw")
          ? (t.prizePack?.grandPrizes || []).map((g) => ({
              id: g.id,
              name: g.name || g.nameZh || g.id,
              icon: g.icon,
              targetCents: g.targetCents,
            }))
          : []
      );
    } else {
      setEnabledTiers(
        t.rules.tiers.filter((x) => x.enabledByDefault).map((x) => x.amountSgd)
      );
      setShareSelling(t.rules.shareSellingDefault || t.id === "share_boost");
      setGrandPrizes(
        (t.prizePack?.grandPrizes || []).map((g) => ({
          id: g.id,
          name: g.name || g.nameZh || g.id,
          icon: g.icon,
          targetCents: g.targetCents,
        }))
      );
    }
    setName("");
    setDescription("");
    setStep("configure");
    setError("");
  }

  function updateGrandPrize(index: number, patch: Partial<GrandPrizeEdit>) {
    setGrandPrizes((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...patch } : p))
    );
  }

  function toggleTier(amount: number) {
    setEnabledTiers((prev) =>
      prev.includes(amount) ? prev.filter((a) => a !== amount) : [...prev, amount].sort((a, b) => a - b)
    );
  }

  function togglePartner(id: string) {
    setSelectedPartners((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleCreate() {
    if (!templateId) return;
    if (!name.trim()) {
      setError(tr("campaignNew.errName"));
      return;
    }
    if (enabledTiers.length === 0) {
      setError(tr("campaignNew.errTiers"));
      return;
    }
    setLoading(true);
    setError("");

    const res = await fetch("/api/business/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(businessTemplateId
          ? { businessTemplateId }
          : { templateId }),
        productKind: productKind || "distribution",
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        startDate,
        endDate,
        discountPercent:
          businessTemplateId
            ? undefined
            : selected?.rules.allowDiscount
              ? discountPercent
              : 0,
        enabledTiers: businessTemplateId ? undefined : enabledTiers,
        shareSellingEnabled:
          productKind === "self_use"
            ? false
            : templateId === "share_boost"
              ? true
              : shareSelling,
        partnerIds: productKind === "self_use" ? [] : selectedPartners,
        grandPrizes:
          !businessTemplateId && grandPrizes.length > 0
            ? grandPrizes.map((g) => ({
                id: g.id,
                name: g.name.trim(),
                icon: g.icon,
                targetCents: g.targetCents,
              }))
            : undefined,
      }),
    });

    if (res.ok) {
      const d = await res.json();
      // 自用/独享：去活动页勾选门店上架
      router.push(
        productKind === "self_use"
          ? `/business/campaigns/${d.data.id}?stores=1`
          : `/business/campaigns/${d.data.id}`
      );
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || tr("campaignNew.errCreate"));
      setLoading(false);
    }
  }

  const selectedTitle =
    lang === "en"
      ? selected?.nameEn || selected?.nameZh
      : selected?.nameZh;
  const selectedTagline =
    lang === "en"
      ? selected?.taglineEn || selected?.taglineZh
      : selected?.taglineZh;

  if (step === "kind") {
    return (
      <div className="pb-8 min-h-screen">
        <div className="px-4 py-3 border-b border-border">
          <h1 className="text-lg font-semibold">{tr("campaignNew.kindTitle")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{tr("campaignNew.kindSubtitle")}</p>
        </div>
        <div className="px-4 mt-4">
          <VoucherTypePicker value={productKind} onChange={setProductKind} />
          <Button
            className="w-full mt-6"
            disabled={!productKind}
            onClick={() => {
              setStep("pick");
              setError("");
            }}
          >
            {tr("campaignNew.next")}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "pick") {
    return (
      <div className="pb-8 min-h-screen">
        <div className="px-4 py-3 border-b border-border">
          <button
            type="button"
            className="text-xs text-primary font-medium mb-1"
            onClick={() => setStep("kind")}
          >
            {tr("campaignNew.backKind")}
          </button>
          <h1 className="text-lg font-semibold">{tr("campaignNew.pickTitle")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {productKind === "self_use"
              ? tr("campaignNew.pickSelfHint")
              : tr("campaignNew.pickDistHint")}
          </p>
        </div>

        <div className="px-4 mt-4 space-y-3">
          {productKind === "self_use" && (
            <div className="rounded-2xl border border-emerald-100 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/35/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                  {lang === "en" ? "My copies" : "我的拷贝模版"}
                </p>
                <Link
                  href="/business/templates"
                  className="text-[11px] text-primary font-medium"
                >
                  {lang === "en" ? "Manage / copy" : "管理/拷贝"}
                </Link>
              </div>
              {bizTemplates.length === 0 ? (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400/70 mt-1">
                  {lang === "en"
                    ? "Copy a platform template to customize discount or exclusive fees."
                    : "可拷贝平台模版，改折扣或独享总率/小奖/大奖（平台 2% 不可改）。"}
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {bizTemplates.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => pickBusinessTemplate(m)}
                      className="w-full text-left rounded-xl bg-card border border-emerald-100 dark:border-emerald-800/50 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-foreground">
                        {m.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {m.discountPercent != null
                          ? `${lang === "en" ? "discount" : "折扣"} ${m.discountPercent}%`
                          : ""}
                        {m.exclusiveTotalPercent != null
                          ? ` · ${m.exclusiveTotalPercent}% (${m.exclusiveSmallPrizePercent}+${m.exclusivePlatformFeePercent}+${m.exclusiveGrandPoolPercent})`
                          : ""}
                      </p>
                    </button>
                  ))}
                </ul>
              )}
            </div>
          )}
          {visibleTemplates.length === 0 && bizTemplates.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {tr("campaignNew.loadingTemplates")}
            </p>
          )}
          {visibleTemplates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => pickTemplate(tpl)}
              className="w-full text-left"
            >
              <Card className="hover:border-primary/40 transition-colors active:scale-[0.99]">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{tpl.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {lang === "en" ? tpl.nameEn || tpl.nameZh : tpl.nameZh}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {lang === "en" ? tpl.taglineEn || tpl.taglineZh : tpl.taglineZh}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                        {tpl.lockedSummaryZh}
                      </p>
                    </div>
                    <span className="text-primary text-xs font-medium shrink-0">
                      {tr("campaignNew.useTemplate")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}

          <p className="text-[11px] text-muted-foreground text-center pt-2 px-2">
            {tr("network.footerHint")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-4 min-h-screen flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <button
          type="button"
          onClick={() => setStep("pick")}
          className="text-sm text-muted-foreground"
        >
          {tr("campaignNew.backTemplates")}
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold truncate">
            {selected?.icon} {selectedTitle || tr("campaignNew.configure")}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{selectedTagline}</p>
        </div>
      </div>

      <div className="flex-1 px-4 mt-4 space-y-4">
        <Card className="border-blue-100 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/35/60">
          <CardContent className="p-3">
            <p className="text-xs font-medium text-blue-900">{tr("network.bannerTitle")}</p>
            <p className="text-[11px] text-blue-800/80 mt-1 leading-relaxed">
              {tr("network.bannerBody")}
            </p>
          </CardContent>
        </Card>

        {selected && (
          <Card className="bg-muted/50 border-border">
            <CardContent className="p-3">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">
                {tr("campaignNew.lockedRules")}
              </p>
              <p className="text-xs text-foreground leading-relaxed">{selected.lockedSummaryZh}</p>
            </CardContent>
          </Card>
        )}

        <Input
          label={tr("campaignNew.name")}
          placeholder={tr("campaignNew.namePh")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label={tr("campaignNew.desc")}
          placeholder={tr("campaignNew.descPh")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            {tr("campaignNew.color")}
          </label>
          <div className="flex gap-2">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full transition-transform ${
                  color === c ? "scale-125 ring-2 ring-offset-2 ring-muted-foreground" : ""
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label={tr("campaignNew.startDate")}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Input
            label={tr("campaignNew.endDate")}
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        {selected?.editable?.includes("grandPrizes") && grandPrizes.length > 0 && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-foreground">
                {tr("campaignNew.grandPrizes")}
              </label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {tr("campaignNew.grandPrizesHint")}
              </p>
            </div>
            {grandPrizes.map((g, idx) => (
              <Card key={g.id} className="border-border">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {PRIZE_ICONS.map((ic) => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => updateGrandPrize(idx, { icon: ic })}
                        className={`w-8 h-8 rounded-lg text-base ${
                          g.icon === ic ? "bg-blue-50 dark:bg-blue-950/35 ring-2 ring-primary" : "bg-muted/50"
                        }`}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                  <Input
                    label={tr("campaignNew.prizeName")}
                    value={g.name}
                    onChange={(e) => updateGrandPrize(idx, { name: e.target.value })}
                    placeholder={tr("campaignNew.prizeNamePh")}
                  />
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      {tr("campaignNew.targetSgd")}
                    </label>
                    <input
                      type="number"
                      min={100}
                      max={1000000}
                      step={100}
                      value={Math.round(g.targetCents / 100)}
                      onChange={(e) =>
                        updateGrandPrize(idx, {
                          targetCents: Math.round(Number(e.target.value || 0) * 100),
                        })
                      }
                      className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {tr("campaignNew.targetHint")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {selected?.rules.allowDiscount && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {tr("campaignNew.discountRate", {
                min: selected.rules.discountPercentMin,
                max: selected.rules.discountPercentMax,
              })}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={selected.rules.discountPercentMin}
                max={selected.rules.discountPercentMax}
                value={discountPercent}
                onChange={(e) => setDiscountPercent(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm font-semibold text-primary w-12 text-right">
                {discountPercent}%
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {tr("campaignNew.discountExample", {
                paid: (50 * (100 - discountPercent) / 100).toFixed(0),
                commission: ((50 * (100 - discountPercent) / 100) * 0.05).toFixed(2),
              })}
            </p>
          </div>
        )}

        {selected && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              {tr("campaignNew.openTiers")}
            </label>
            <div className="flex flex-wrap gap-2">
              {selected.rules.tiers.map((tier) => {
                const on = enabledTiers.includes(tier.amountSgd);
                return (
                  <button
                    key={tier.amountSgd}
                    type="button"
                    onClick={() => toggleTier(tier.amountSgd)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                      on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    S${tier.amountSgd}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {templateId !== "share_boost" && selected?.editable.includes("shareSelling") && (
          <label className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
            <div>
              <p className="text-sm font-medium text-foreground">{tr("campaignNew.shareSelling")}</p>
              <p className="text-[11px] text-muted-foreground">{tr("campaignNew.shareSellingHint")}</p>
            </div>
            <input
              type="checkbox"
              checked={shareSelling}
              onChange={(e) => setShareSelling(e.target.checked)}
              className="h-5 w-5"
            />
          </label>
        )}

        {templateId === "share_boost" && (
          <Card className="bg-violet-50 border-violet-100">
            <CardContent className="p-3">
              <p className="text-xs text-violet-700">{tr("campaignNew.shareBoostLocked")}</p>
            </CardContent>
          </Card>
        )}

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            {tr("campaignNew.invitePartners")}
          </label>
          {partners.length === 0 ? (
            <p className="text-xs text-muted-foreground">{tr("campaignNew.noPartners")}</p>
          ) : (
            <div className="space-y-2">
              {partners.map((p) => {
                const on = selectedPartners.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePartner(p.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-sm border ${
                      on
                        ? "border-primary bg-blue-50 dark:bg-blue-950/35 text-foreground"
                        : "border-border bg-card text-foreground"
                    }`}
                  >
                    <span>{p.businessName || p.name || p.id.slice(0, 8)}</span>
                    <span className="text-xs">
                      {on ? tr("campaignNew.selected") : tr("campaignNew.select")}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
      </div>

      <div className="px-4 py-3 border-t border-border bg-card">
        <Button className="w-full" size="lg" onClick={handleCreate} loading={loading}>
          {tr("campaignNew.create")}
        </Button>
      </div>
    </div>
  );
}

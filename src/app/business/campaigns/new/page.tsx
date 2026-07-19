"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { useLang } from "@/components/i18n/LanguageProvider";

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

export default function NewCampaignPage() {
  const router = useRouter();
  const { t: tr, lang } = useLang();
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [step, setStep] = useState<"pick" | "configure">("pick");
  const [templateId, setTemplateId] = useState<string | null>(null);

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
      const [tr, pr] = await Promise.all([
        fetch("/api/business/campaigns/templates"),
        fetch("/api/business/partners"),
      ]);
      if (tr.ok) {
        const j = await tr.json();
        setTemplates(j.data || []);
      }
      if (pr.ok) {
        const j = await pr.json();
        const list = j.data || [];
        // Each row links two businesses; collect both ends (create API ignores self)
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
    })();
  }, []);

  function pickTemplate(t: TemplateDto) {
    setTemplateId(t.id);
    setDiscountPercent(t.rules.discountPercentDefault);
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
        templateId,
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        startDate,
        endDate,
        discountPercent: selected?.rules.allowDiscount ? discountPercent : 0,
        enabledTiers,
        shareSellingEnabled: templateId === "share_boost" ? true : shareSelling,
        partnerIds: selectedPartners,
        grandPrizes:
          grandPrizes.length > 0
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
      router.push(`/business/campaigns/${d.data.id}`);
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

  if (step === "pick") {
    return (
      <div className="pb-8 min-h-screen">
        <div className="px-4 py-3 border-b border-slate-100">
          <h1 className="text-lg font-semibold">{tr("campaignNew.pickTitle")}</h1>
          <p className="text-xs text-slate-400 mt-0.5">{tr("campaignNew.pickSubtitle")}</p>
        </div>

        <div className="px-4 mt-4 space-y-3">
          {templates.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">
              {tr("campaignNew.loadingTemplates")}
            </p>
          )}
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => pickTemplate(tpl)}
              className="w-full text-left"
            >
              <Card className="hover:border-[#1A6EFF]/40 transition-colors active:scale-[0.99]">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{tpl.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {lang === "en" ? tpl.nameEn || tpl.nameZh : tpl.nameZh}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {lang === "en" ? tpl.taglineEn || tpl.taglineZh : tpl.taglineZh}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                        {tpl.lockedSummaryZh}
                      </p>
                    </div>
                    <span className="text-[#1A6EFF] text-xs font-medium shrink-0">
                      {tr("campaignNew.useTemplate")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}

          <p className="text-[11px] text-slate-400 text-center pt-2 px-2">
            {tr("network.footerHint")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-4 min-h-screen flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setStep("pick")}
          className="text-sm text-slate-500"
        >
          {tr("campaignNew.backTemplates")}
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold truncate">
            {selected?.icon} {selectedTitle || tr("campaignNew.configure")}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{selectedTagline}</p>
        </div>
      </div>

      <div className="flex-1 px-4 mt-4 space-y-4">
        <Card className="border-blue-100 bg-blue-50/60">
          <CardContent className="p-3">
            <p className="text-xs font-medium text-blue-900">{tr("network.bannerTitle")}</p>
            <p className="text-[11px] text-blue-800/80 mt-1 leading-relaxed">
              {tr("network.bannerBody")}
            </p>
          </CardContent>
        </Card>

        {selected && (
          <Card className="bg-slate-50 border-slate-100">
            <CardContent className="p-3">
              <p className="text-[11px] font-medium text-slate-500 mb-1">
                {tr("campaignNew.lockedRules")}
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">{selected.lockedSummaryZh}</p>
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
          <label className="block text-sm font-medium text-slate-700 mb-2">
            {tr("campaignNew.color")}
          </label>
          <div className="flex gap-2">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full transition-transform ${
                  color === c ? "scale-125 ring-2 ring-offset-2 ring-slate-400" : ""
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
              <label className="block text-sm font-medium text-slate-700">
                {tr("campaignNew.grandPrizes")}
              </label>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {tr("campaignNew.grandPrizesHint")}
              </p>
            </div>
            {grandPrizes.map((g, idx) => (
              <Card key={g.id} className="border-slate-100">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {PRIZE_ICONS.map((ic) => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => updateGrandPrize(idx, { icon: ic })}
                        className={`w-8 h-8 rounded-lg text-base ${
                          g.icon === ic ? "bg-blue-50 ring-2 ring-[#1A6EFF]" : "bg-slate-50"
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
                    <label className="block text-sm font-medium text-slate-700 mb-1">
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
                    <p className="text-[10px] text-slate-400 mt-1">
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
            <label className="block text-sm font-medium text-slate-700 mb-1">
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
              <span className="text-sm font-semibold text-[#1A6EFF] w-12 text-right">
                {discountPercent}%
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {tr("campaignNew.discountExample", {
                paid: (50 * (100 - discountPercent) / 100).toFixed(0),
                commission: ((50 * (100 - discountPercent) / 100) * 0.05).toFixed(2),
              })}
            </p>
          </div>
        )}

        {selected && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
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
                      on ? "bg-[#1A6EFF] text-white" : "bg-slate-100 text-slate-500"
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
          <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div>
              <p className="text-sm font-medium text-slate-800">{tr("campaignNew.shareSelling")}</p>
              <p className="text-[11px] text-slate-400">{tr("campaignNew.shareSellingHint")}</p>
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
          <label className="block text-sm font-medium text-slate-700 mb-2">
            {tr("campaignNew.invitePartners")}
          </label>
          {partners.length === 0 ? (
            <p className="text-xs text-slate-400">{tr("campaignNew.noPartners")}</p>
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
                        ? "border-[#1A6EFF] bg-blue-50 text-slate-900"
                        : "border-slate-100 bg-white text-slate-600"
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

      <div className="px-4 py-3 border-t border-slate-100 bg-white">
        <Button className="w-full" size="lg" onClick={handleCreate} loading={loading}>
          {tr("campaignNew.create")}
        </Button>
      </div>
    </div>
  );
}

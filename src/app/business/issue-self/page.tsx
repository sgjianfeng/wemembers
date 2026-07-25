"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { useLang } from "@/components/i18n/LanguageProvider";
import { VoucherTypeBadge } from "@/components/voucher/VoucherTypeBadge";

type CampaignOpt = {
  id: string;
  name: string;
  productKind?: string;
  status?: string;
  type?: string;
};
type StoreOpt = { id: string; name: string };

const QUICK_VOUCHER = [10, 20, 50, 100];
const QUICK_DRAW = [50, 100, 200];

export default function IssueSelfPage() {
  const { t, lang } = useLang();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignOpt[]>([]);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [amountSgd, setAmountSgd] = useState("100");
  /** 0 = 无折扣；10 = 付 90 得 100 */
  const [discountPercent, setDiscountPercent] = useState(10);
  const [phone, setPhone] = useState("");
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    shortCode: string;
    balanceSgd: string;
    paidSgd?: string;
    discountPercent?: number;
    campaignName?: string;
    isDraw?: boolean;
    instantPrize?: { name: string; icon: string; valueSgd: string } | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadCampaignsAndStores() {
    const [cRes, sRes] = await Promise.all([
      fetch("/api/business/campaigns"),
      fetch("/api/business/stores"),
    ]);
    if (cRes.ok) {
      const j = await cRes.json();
      const list = (j.data || []).filter(
        (c: CampaignOpt) =>
          c.productKind === "self_use" &&
          (c.status === "active" || c.status === "draft")
      );
      setCampaigns(
        list.map((c: CampaignOpt & { type?: string }) => ({
          id: c.id,
          name: c.name,
          productKind: c.productKind,
          status: c.status,
          type: c.type,
        }))
      );
      if (list[0] && !campaignId) setCampaignId(list[0].id);
      else if (list[0]) setCampaignId((id) => id || list[0].id);
    }
    if (sRes.ok) {
      const j = await sRes.json();
      const list = j.data || [];
      const opts = list.map((s: { id: string; name: string }) => ({
        id: s.id,
        name: s.name,
      }));
      setStores(opts);
      if (opts[0] && !storeId) setStoreId(opts[0].id);
    }
  }

  useEffect(() => {
    void loadCampaignsAndStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function bootstrapCampaign() {
    setBootstrapping(true);
    setError("");
    try {
      const end = new Date();
      end.setFullYear(end.getFullYear() + 1);
      const res = await fetch("/api/business/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: "voucher_discount",
          productKind: "self_use",
          name:
            lang === "en"
              ? "Self-use counter vouchers"
              : "自用券（柜台现金）",
          description:
            lang === "en"
              ? "Group stores · paid at sale · no platform settle"
              : "集团门店可核 · 售出即收款 · 核销不入平台钱包",
          color: "#64748B",
          startDate: new Date().toISOString().slice(0, 10),
          endDate: end.toISOString().slice(0, 10),
          discountPercent: 10, // template min 8%; cash issue still uses face=paid
          enabledTiers: [10, 20, 50, 100],
          shareSellingEnabled: false,
          partnerIds: [],
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "创建失败");
      } else {
        setCampaignId(j.data.id);
        await loadCampaignsAndStores();
      }
    } catch {
      setError("网络错误");
    }
    setBootstrapping(false);
  }

  async function submit() {
    if (!cashConfirmed) {
      setError(
        lang === "en"
          ? "Confirm cash received first"
          : "请先勾选：已收到现金"
      );
      return;
    }
    const amt = Number(amountSgd);
    if (!Number.isFinite(amt) || amt < 1) {
      setError(lang === "en" ? "Invalid amount" : "请输入有效金额");
      return;
    }
    const disc = isDrawCamp ? 0 : Math.min(90, Math.max(0, discountPercent));
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/voucher/issue-self", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          storeId,
          faceSgd: amt,
          discountPercent: disc,
          customerPhone: phone.trim() || undefined,
          paymentMethod: "cash",
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "失败");
      } else {
        setResult({
          shortCode: j.data.shortCode,
          balanceSgd: j.data.balanceSgd,
          paidSgd: j.data.paidSgd,
          discountPercent: j.data.discountPercent,
          campaignName: j.data.campaignName,
          isDraw: j.data.isDraw,
          instantPrize: j.data.instantPrize || null,
        });
        setCashConfirmed(false);
      }
    } catch {
      setError("网络错误");
    }
    setLoading(false);
  }

  const selectedCamp = campaigns.find((c) => c.id === campaignId);
  const isDrawCamp =
    selectedCamp?.type === "lucky_draw_v2" ||
    selectedCamp?.type === "lucky_draw";
  const quickAmounts = isDrawCamp ? QUICK_DRAW : QUICK_VOUCHER;
  const faceNum = Number(amountSgd) || 0;
  const discApply = isDrawCamp ? 0 : Math.min(90, Math.max(0, discountPercent));
  const paidPreview =
    Math.round(faceNum * (100 - discApply)) / 100;

  async function copyCode() {
    if (!result?.shortCode) return;
    try {
      await navigator.clipboard.writeText(result.shortCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="pb-10">
      <div className="px-4 py-3 border-b border-slate-100 bg-white sticky top-0 z-10">
        <button
          type="button"
          className="text-xs text-[#1A6EFF] font-medium"
          onClick={() => router.push("/business")}
        >
          ← {lang === "en" ? "Back" : "返回"}
        </button>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="text-lg font-semibold">{t("issueSelf.title")}</h1>
          <VoucherTypeBadge kind="self_use" size="sm" />
        </div>
        <p className="text-xs text-slate-400 mt-0.5">{t("issueSelf.subtitle")}</p>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Counter steps */}
        <div className="rounded-2xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-[11px] text-slate-500 leading-relaxed">
          {lang === "en" ? (
            <>
              1) Take cash · 2) Issue voucher · 3) Give customer the{" "}
              <strong>6-digit code</strong> · 4) Redeem at counter when they spend
            </>
          ) : (
            <>
              ① 收现金 → ② 点下方发券 → ③ 把 <strong>6 位短码</strong> 给顾客（或写在小票）→
              ④ 消费时在「扫码核销」输入短码
            </>
          )}
        </div>

        {campaigns.length === 0 ? (
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm text-slate-600">
                {lang === "en"
                  ? "No self-use campaign yet. Create one in one tap."
                  : "还没有自用券活动。一键创建即可开卖。"}
              </p>
              <Button
                className="w-full h-12"
                loading={bootstrapping}
                onClick={() => void bootstrapCampaign()}
              >
                {lang === "en" ? "Create self-use campaign" : "一键创建自用券活动"}
              </Button>
              <button
                type="button"
                className="w-full text-xs text-[#1A6EFF]"
                onClick={() => router.push("/business/campaigns/new")}
              >
                {lang === "en" ? "Or full create flow →" : "或完整创建流程 →"}
              </button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div>
              <label className="text-xs font-medium text-slate-500">
                {lang === "en" ? "Campaign" : "活动"}
              </label>
              <select
                className="mt-1 w-full h-12 rounded-xl border border-slate-200 px-3 text-sm bg-white"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.status === "draft" ? " (draft)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500">
                {lang === "en" ? "Store" : "门店"}
              </label>
              <select
                className="mt-1 w-full h-12 rounded-xl border border-slate-200 px-3 text-sm bg-white"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500">
                {lang === "en" ? "Face value (spendable)" : "面值（可花）"}
              </label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {quickAmounts.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAmountSgd(String(a))}
                    className={`h-11 min-w-[4.5rem] px-3 rounded-full text-sm font-semibold tabular-nums border transition-colors ${
                      Number(amountSgd) === a
                        ? "bg-[#1A6EFF] text-white border-[#1A6EFF]"
                        : "bg-white text-slate-700 border-slate-200"
                    }`}
                  >
                    S${a}
                  </button>
                ))}
              </div>
              <Input
                className="mt-2"
                type="number"
                min={1}
                step={1}
                value={amountSgd}
                onChange={(e) => setAmountSgd(e.target.value)}
              />
            </div>

            {!isDrawCamp && (
              <div>
                <label className="text-xs font-medium text-slate-500">
                  {lang === "en" ? "Discount" : "折扣（自用代金）"}
                </label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {[0, 10, 20].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDiscountPercent(d)}
                      className={`h-10 px-3 rounded-full text-sm font-semibold border ${
                        discountPercent === d
                          ? "bg-slate-800 text-white border-slate-800"
                          : "bg-white text-slate-700 border-slate-200"
                      }`}
                    >
                      {d === 0
                        ? lang === "en"
                          ? "No disc."
                          : "无折扣"
                        : `${d}%`}
                    </button>
                  ))}
                </div>
                <div className="mt-3 rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">
                  <p className="text-xs text-slate-400">
                    {lang === "en" ? "Customer pays" : "应收现金"}
                  </p>
                  <p className="text-2xl font-bold tabular-nums text-slate-900 mt-0.5">
                    S${paidPreview.toFixed(2)}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {lang === "en"
                      ? `Pay S$${paidPreview.toFixed(0)} get S$${faceNum || 0} to spend`
                      : `付 S$${paidPreview.toFixed(0)} 得 S$${faceNum || 0} 可花`}
                    {discApply > 0 ? ` · −${discApply}%` : ""}
                  </p>
                </div>
              </div>
            )}

            <Input
              label={t("issueSelf.phone")}
              placeholder={t("issueSelf.phonePh")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="text-[10px] text-slate-400 -mt-2">
              {lang === "en"
                ? "Optional. Without phone, customer uses the short code only."
                : "可选。不填手机也能用短码核销。"}
            </p>

            <label className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white p-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 rounded border-slate-300"
                checked={cashConfirmed}
                onChange={(e) => setCashConfirmed(e.target.checked)}
              />
              <span className="text-sm text-slate-700 leading-snug">
                {lang === "en"
                  ? `I have received S$${paidPreview.toFixed(2)} cash (or store payment)`
                  : `我已收到现金 S$${paidPreview.toFixed(2)}（或店内收款）`}
              </span>
            </label>

            <Button
              className="w-full h-12 text-base font-semibold"
              loading={loading}
              onClick={() => void submit()}
              disabled={!campaignId || !storeId || !cashConfirmed}
            >
              {t("issueSelf.submit")}
            </Button>
          </>
        )}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        {result && (
          <Card className="border-green-200 bg-green-50 overflow-hidden">
            <div className="h-1.5 bg-slate-500" />
            <CardContent className="p-5 text-center space-y-3">
              <p className="text-sm font-medium text-green-800">
                {t("issueSelf.ok")}
                {result.isDraw
                  ? lang === "en"
                    ? " · exclusive draw"
                    : " · 独享抽奖"
                  : ""}
              </p>
              <p className="text-xs text-slate-600">
                {lang === "en" ? "Paid" : "实收"} S$
                {result.paidSgd ?? result.balanceSgd}
                {" · "}
                {lang === "en" ? "Spendable" : "可花"} S${result.balanceSgd}
                {result.discountPercent
                  ? ` · −${result.discountPercent}%`
                  : ""}
              </p>
              {result.instantPrize && (
                <div className="rounded-xl bg-white/80 border border-violet-100 px-3 py-2">
                  <p className="text-[10px] text-violet-600 font-medium">
                    {lang === "en" ? "Instant prize (store pays)" : "即时小奖（本店兑付）"}
                  </p>
                  <p className="text-lg font-semibold text-slate-900 mt-0.5">
                    {result.instantPrize.icon} {result.instantPrize.name}
                    <span className="text-sm font-normal text-slate-500 ml-1">
                      S${result.instantPrize.valueSgd}
                    </span>
                  </p>
                </div>
              )}
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                {lang === "en" ? "Show this code to staff" : "核销短码（给顾客 / 写小票）"}
              </p>
              <p className="text-4xl font-bold font-mono tracking-[0.25em] text-slate-900 tabular-nums">
                {result.shortCode}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => void copyCode()}
                >
                  {copied
                    ? lang === "en"
                      ? "Copied"
                      : "已复制"
                    : lang === "en"
                      ? "Copy code"
                      : "复制短码"}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    setResult(null);
                    setPhone("");
                    setCashConfirmed(false);
                  }}
                >
                  {lang === "en" ? "Next sale" : "再卖一张"}
                </Button>
              </div>
              <button
                type="button"
                className="text-xs text-[#1A6EFF] font-medium"
                onClick={() => router.push("/business/scan")}
              >
                {lang === "en" ? "Go to redeem →" : "去核销台 →"}
              </button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

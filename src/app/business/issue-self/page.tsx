"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { useLang } from "@/components/i18n/LanguageProvider";
import { VoucherTypeBadge } from "@/components/voucher/VoucherTypeBadge";
import { ArrowLeft, Copy } from "lucide-react";
import { parseRulesSnapshot } from "@/lib/templates";
import { cn } from "@/lib/utils";
import {
  ISSUE_REASONS,
  isNoPayReason,
  type IssueReasonId,
} from "@/lib/issue-self";

type CampaignOpt = {
  id: string;
  name: string;
  productKind?: string;
  status?: string;
  type?: string;
  rulesSnapshot?: string | null;
  discountPercent: number;
  enabledTiers: number[];
  packKind: string | null;
  minSpendMultiplier: number;
  /** 折扣是否由产品固定（不可在柜台改） */
  discountLocked: boolean;
};

type StoreOpt = { id: string; name: string };

const FALLBACK_VOUCHER_TIERS = [10, 20, 50, 100];
const FALLBACK_DRAW_TIERS = [50, 100];

function mapCampaign(raw: Record<string, unknown>): CampaignOpt {
  const snap = parseRulesSnapshot(
    typeof raw.rulesSnapshot === "string" ? raw.rulesSnapshot : null
  );
  let enabledTiers: number[] = Array.isArray(snap?.enabledTiers)
    ? (snap!.enabledTiers as number[]).filter(
        (n) => Number.isFinite(n) && n > 0
      )
    : [];
  if (!enabledTiers.length && typeof raw.voucherTiers === "string") {
    try {
      const tiers = JSON.parse(raw.voucherTiers) as { min?: number }[];
      enabledTiers = tiers
        .map((t) => Number(t.min))
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b);
    } catch {
      /* ignore */
    }
  }
  const packKind =
    snap && typeof (snap as { packKind?: string }).packKind === "string"
      ? String((snap as { packKind?: string }).packKind)
      : null;
  const type = typeof raw.type === "string" ? raw.type : "";
  const isDraw = type === "lucky_draw_v2" || type === "lucky_draw";
  let discountPercent = Number(snap?.discountPercent) || 0;
  // 9 折卡固定 10%；原价包固定 0；其它模版用 snapshot
  if (packKind === "discount_10") discountPercent = 10;
  else if (packKind === "face_open" || packKind === "face_threshold")
    discountPercent = 0;
  else if (isDraw) discountPercent = 0;

  // 产品包自带折扣 → 柜台不可改，避免和线上 SKU 不一致
  const discountLocked =
    isDraw ||
    packKind === "discount_10" ||
    packKind === "face_open" ||
    packKind === "face_threshold" ||
    packKind === "exclusive_ballot";

  return {
    id: String(raw.id),
    name: String(raw.name || ""),
    productKind:
      typeof raw.productKind === "string" ? raw.productKind : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
    type,
    rulesSnapshot:
      typeof raw.rulesSnapshot === "string" ? raw.rulesSnapshot : null,
    discountPercent,
    enabledTiers,
    packKind,
    minSpendMultiplier: Number(snap?.minSpendMultiplier) || 0,
    discountLocked,
  };
}

export default function IssueSelfPage() {
  const { t, lang } = useLang();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignOpt[]>([]);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [amountSgd, setAmountSgd] = useState("100");
  /** 仅未锁定产品可改；锁定时以产品规则为准 */
  const [discountPercent, setDiscountPercent] = useState(0);
  const [phone, setPhone] = useState("");
  const [issueReason, setIssueReason] = useState<IssueReasonId>("cash_sale");
  const [issueNote, setIssueNote] = useState("");
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
    noPay?: boolean;
    issueReason?: string;
    issueNote?: string | null;
    instantPrize?: { name: string; icon: string; valueSgd: string } | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<
    Array<{
      id: string;
      shortCode: string | null;
      faceSgd: string;
      paidSgd: string;
      issueReasonZh: string;
      issueReasonEn: string;
      issueNote: string | null;
      customerPhone: string | null;
      campaignName: string | null;
      createdAt: string;
      noPay: boolean;
    }>
  >([]);

  async function loadCampaignsAndStores() {
    const [cRes, sRes] = await Promise.all([
      fetch("/api/business/campaigns"),
      fetch("/api/business/stores"),
    ]);
    if (cRes.ok) {
      const j = await cRes.json();
      const list = (j.data || [])
        .filter(
          (c: { productKind?: string; status?: string }) =>
            c.productKind === "self_use" &&
            (c.status === "active" || c.status === "draft")
        )
        .map((c: Record<string, unknown>) => mapCampaign(c));
      setCampaigns(list);
      if (list[0]) {
        setCampaignId((id) =>
          list.some((c: CampaignOpt) => c.id === id) ? id : list[0].id
        );
      }
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

  async function loadHistory() {
    try {
      const res = await fetch("/api/voucher/issue-self?take=30");
      if (res.ok) {
        const j = await res.json();
        setHistory(j.data || []);
      }
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void loadCampaignsAndStores();
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCamp = useMemo(
    () => campaigns.find((c) => c.id === campaignId) || null,
    [campaigns, campaignId]
  );
  const isDrawCamp =
    selectedCamp?.type === "lucky_draw_v2" ||
    selectedCamp?.type === "lucky_draw";
  const noPay = isNoPayReason(issueReason);

  // 抽奖活动不能选无支付
  useEffect(() => {
    if (isDrawCamp && noPay) {
      setIssueReason("cash_sale");
    }
  }, [isDrawCamp, noPay]);

  const quickAmounts = useMemo(() => {
    if (selectedCamp?.enabledTiers?.length) return selectedCamp.enabledTiers;
    return isDrawCamp ? FALLBACK_DRAW_TIERS : FALLBACK_VOUCHER_TIERS;
  }, [selectedCamp, isDrawCamp]);

  // 切换活动：同步折扣与默认档
  useEffect(() => {
    if (!selectedCamp) return;
    setDiscountPercent(selectedCamp.discountPercent);
    setCashConfirmed(false);
    setAmountSgd((prev) => {
      const n = Number(prev);
      if (selectedCamp.enabledTiers.length) {
        if (selectedCamp.enabledTiers.includes(n)) return prev;
        return String(selectedCamp.enabledTiers[0]);
      }
      const fallback = isDrawCamp ? FALLBACK_DRAW_TIERS : FALLBACK_VOUCHER_TIERS;
      if (fallback.includes(n)) return prev;
      return String(fallback[0]);
    });
  }, [selectedCamp?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const discApply =
    isDrawCamp || noPay
      ? 0
      : selectedCamp?.discountLocked
        ? selectedCamp.discountPercent
        : Math.min(90, Math.max(0, discountPercent));
  const faceNum = Number(amountSgd) || 0;
  const paidPreview = noPay
    ? 0
    : Math.round(faceNum * (100 - discApply)) / 100;
  const minSpend =
    selectedCamp && selectedCamp.minSpendMultiplier > 0 && faceNum > 0
      ? faceNum * selectedCamp.minSpendMultiplier
      : 0;

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
          discountPercent: 10,
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
    if (noPay) {
      if (issueNote.trim().length < 4) {
        setError(
          lang === "en"
            ? "Note required (supplier / invoice / reason, min 4 chars)"
            : "无支付必须填备注（供应商/欠款单号/原因，至少 4 字）"
        );
        return;
      }
      if (!phone.trim()) {
        setError(
          lang === "en"
            ? "Phone required for no-pay issue (bind to account)"
            : "无支付必须填对方手机号（发到账户）"
        );
        return;
      }
      if (!cashConfirmed) {
        setError(
          lang === "en"
            ? "Confirm you authorize this no-pay issue"
            : "请勾选确认：授权本次无支付发券"
        );
        return;
      }
    } else if (!cashConfirmed) {
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
    if (
      selectedCamp?.enabledTiers?.length &&
      !selectedCamp.enabledTiers.includes(amt)
    ) {
      setError(
        lang === "en"
          ? `Pick a product tier: ${selectedCamp.enabledTiers.map((t) => `S$${t}`).join(", ")}`
          : `请选产品档位：${selectedCamp.enabledTiers.map((t) => `S$${t}`).join(" / ")}`
      );
      return;
    }
    const disc = noPay ? 0 : discApply;
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
          discountPercent: noPay ? undefined : disc,
          paidSgd: noPay ? 0 : undefined,
          issueReason,
          issueNote: issueNote.trim() || undefined,
          customerPhone: phone.trim() || undefined,
          paymentMethod: noPay ? issueReason : "cash",
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
          noPay: j.data.noPay,
          issueReason: j.data.issueReason,
          issueNote: j.data.issueNote,
          instantPrize: j.data.instantPrize || null,
        });
        setCashConfirmed(false);
        setIssueNote("");
        void loadHistory();
      }
    } catch {
      setError("网络错误");
    }
    setLoading(false);
  }

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

  const packHint = (() => {
    if (!selectedCamp) return null;
    if (isDrawCamp) {
      return lang === "en"
        ? "Exclusive draw · customer pays face · 15% fee from business balance"
        : "独享抽奖 · 顾客付面值 · 企业账户扣 15%（小奖+服务费+大奖）";
    }
    if (selectedCamp.packKind === "discount_10") {
      return lang === "en"
        ? "10% off card · pay 90% cash, customer gets 100% face (matches online SKU)"
        : "9 折卡 · 收 90% 现金，顾客得 100% 面值（与线上 SKU 一致，不可改折扣）";
    }
    if (selectedCamp.packKind === "face_threshold") {
      return lang === "en"
        ? `Face voucher · min spend ≈ face × ${selectedCamp.minSpendMultiplier || 10}`
        : `原价门槛代金 · 满约 券面×${selectedCamp.minSpendMultiplier || 10} 可用`;
    }
    if (selectedCamp.packKind === "face_open") {
      return lang === "en"
        ? "Face voucher · pay face, spend face · no extra discount at counter"
        : "原价无门槛 · 付多少抵多少 · 柜台不再另打折";
    }
    return null;
  })();

  return (
    <div className="pb-10">
      <div className="px-4 py-3 border-b border-border bg-card sticky top-0 z-10">
        <button
          type="button"
          className="text-xs text-primary font-medium flex items-center gap-0.5 active:scale-[0.97] transition-transform"
          onClick={() => router.push("/business")}
        >
          <ArrowLeft size={13} /> {lang === "en" ? "Back" : "返回"}
        </button>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <h1 className="text-lg font-semibold text-foreground">
            {t("issueSelf.title")}
          </h1>
          <VoucherTypeBadge kind="self_use" size="sm" isDraw={isDrawCamp} />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("issueSelf.subtitle")}
        </p>
      </div>

      <div className="px-4 mt-4 space-y-4">
        <div className="rounded-2xl bg-muted/50 border border-border px-3 py-2.5 text-[11px] text-muted-foreground leading-relaxed">
          {lang === "en" ? (
            noPay ? (
              <>
                <strong>No-pay issue</strong> (business only): pick reason → note
                (invoice/supplier) → phone → face → authorize → issue. Staff cannot
                do this.
              </>
            ) : (
              <>
                1) Collect cash · 2) Confirm below · 3) Issue · 4) Give{" "}
                <strong>6-digit code</strong> or phone · 5) Redeem later
              </>
            )
          ) : noPay ? (
            <>
              <strong>无支付发券</strong>（仅企业主）：选原因 → 填备注（供应商/欠款单号）→
              必填手机 → 选面值 → 勾选授权 → 发券。店员账号无法操作。
            </>
          ) : (
            <>
              ① 按「应收」收现金 → ② 勾选已收款 → ③ 发券 → ④ 短码或手机给顾客 → ⑤
              核销输入短码
            </>
          )}
        </div>

        {campaigns.length === 0 ? (
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                {lang === "en"
                  ? "No self-use campaign yet. Create one in one tap."
                  : "还没有自用券活动。一键创建即可开卖。"}
              </p>
              <Button
                className="w-full h-12"
                loading={bootstrapping}
                onClick={() => void bootstrapCampaign()}
              >
                {lang === "en"
                  ? "Create self-use campaign"
                  : "一键创建自用券活动"}
              </Button>
              <button
                type="button"
                className="w-full text-xs text-primary"
                onClick={() => router.push("/business/campaigns/new")}
              >
                {lang === "en" ? "Or full create flow →" : "或完整创建流程 →"}
              </button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {lang === "en"
                  ? "Activity / product line"
                  : "活动（对齐线上产品）"}
              </label>
              <select
                className="mt-1 w-full h-12 rounded-xl border border-border px-3 text-sm bg-card"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.status === "draft" ? " (draft)" : ""}
                    {c.type === "lucky_draw_v2" || c.type === "lucky_draw"
                      ? lang === "en"
                        ? " · draw"
                        : " · 抽奖"
                      : ""}
                  </option>
                ))}
              </select>
              {packHint && (
                <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                  {packHint}
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {lang === "en" ? "Store" : "门店"}
              </label>
              <select
                className="mt-1 w-full h-12 rounded-xl border border-border px-3 text-sm bg-card"
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

            {/* 发券原因：现金 vs 无支付 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {lang === "en" ? "Issue reason" : "发券原因"}
              </label>
              <div className="mt-1.5 grid grid-cols-1 gap-2">
                {ISSUE_REASONS.filter(
                  (r) => !(isDrawCamp && !r.needsPay)
                ).map((r) => {
                  const active = issueReason === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setIssueReason(r.id);
                        setCashConfirmed(false);
                      }}
                      className={cn(
                        "text-left rounded-xl border px-3 py-2.5 transition-all active:scale-[0.99]",
                        active
                          ? r.needsPay
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-amber-500 bg-amber-50 dark:bg-amber-950/40 ring-1 ring-amber-500/30"
                          : "border-border bg-card hover:border-muted-foreground/30"
                      )}
                    >
                      <p className="text-sm font-semibold text-foreground">
                        {lang === "en" ? r.en : r.zh}
                        {!r.needsPay && (
                          <span className="ml-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                            {lang === "en" ? "No pay · owner only" : "无支付 · 仅企业主"}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {lang === "en" ? r.descEn : r.descZh}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {noPay && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  {lang === "en"
                    ? "Note (required)"
                    : "备注（必填 · 供应商/欠款单号/原因）"}
                </label>
                <textarea
                  className="mt-1 w-full min-h-[72px] rounded-xl border border-amber-300/80 bg-card px-3 py-2 text-sm"
                  value={issueNote}
                  onChange={(e) => setIssueNote(e.target.value)}
                  placeholder={
                    lang === "en"
                      ? "e.g. Supplier ABC · invoice #123 · offset S$500 of AP"
                      : "例：供应商 ABC · 欠款单 #123 · 抵应付 S$500"
                  }
                  maxLength={500}
                />
                <p className="text-[10px] text-amber-800 dark:text-amber-300 mt-1">
                  {lang === "en"
                    ? "Record for audit. Without note, cannot issue."
                    : "写入发券台账备查。无备注不能发。"}
                </p>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {lang === "en"
                  ? "Face tier (spendable)"
                  : "面值档（可花 · 来自产品）"}
              </label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {quickAmounts.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAmountSgd(String(a))}
                    className={cn(
                      "h-11 min-w-[4.5rem] px-3 rounded-full text-sm font-semibold tabular-nums border transition-colors",
                      Number(amountSgd) === a
                        ? "bg-primary text-white border-primary"
                        : "bg-card text-foreground border-border"
                    )}
                  >
                    S${a}
                  </button>
                ))}
              </div>
              {selectedCamp?.enabledTiers?.length ? (
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  {lang === "en"
                    ? "Tiers locked to product SKU (same as online)."
                    : "档位与线上产品一致，不可随意改面值。"}
                </p>
              ) : (
                <Input
                  className="mt-2"
                  type="number"
                  min={1}
                  step={1}
                  value={amountSgd}
                  onChange={(e) => setAmountSgd(e.target.value)}
                />
              )}
            </div>

            {/* 折扣仅现金销售；无支付实收固定 0 */}
            {!isDrawCamp && !noPay && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  {lang === "en" ? "Cash vs face" : "实收 vs 可花"}
                </label>
                {selectedCamp?.discountLocked ? (
                  <div className="mt-1.5 rounded-2xl border border-border bg-muted/40 px-3 py-2.5">
                    <p className="text-sm font-semibold text-foreground">
                      {discApply > 0
                        ? lang === "en"
                          ? `${discApply}% off at sale`
                          : `售价折扣 ${discApply}%（产品规则）`
                        : lang === "en"
                          ? "Pay face = spend face"
                          : "原价 · 付多少抵多少"}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      {lang === "en"
                        ? "Set by product pack — not editable at counter."
                        : "由券产品规则决定，柜台不可另改。"}
                    </p>
                  </div>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {[0, 10, 20].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDiscountPercent(d)}
                        className={cn(
                          "h-10 px-3 rounded-full text-sm font-semibold border",
                          discountPercent === d
                            ? "bg-foreground text-background border-foreground"
                            : "bg-card text-foreground border-border"
                        )}
                      >
                        {d === 0
                          ? lang === "en"
                            ? "No disc."
                            : "无折扣"
                          : `${d}%`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div
              className={cn(
                "rounded-2xl px-4 py-3 border",
                noPay
                  ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300/60"
                  : isDrawCamp
                    ? "bg-brand/5 border-brand/20"
                    : "bg-primary/5 border-primary/20"
              )}
            >
              <p className="text-xs text-muted-foreground">
                {noPay
                  ? lang === "en"
                    ? "Cash collected"
                    : "实收现金（无支付）"
                  : lang === "en"
                    ? "Collect cash now"
                    : "应收现金"}
              </p>
              <p className="text-2xl font-bold tabular-nums text-foreground mt-0.5">
                S${(noPay ? 0 : isDrawCamp ? faceNum : paidPreview).toFixed(2)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                {noPay
                  ? lang === "en"
                    ? `No cash · customer can spend S$${faceNum || 0} (debt/gift offset)`
                    : `不收现金 · 对方可花 S$${faceNum || 0}（抵欠/赠送）`
                  : lang === "en"
                    ? `Pay S$${(isDrawCamp ? faceNum : paidPreview).toFixed(0)} · spend S$${faceNum || 0}`
                    : `收 S$${(isDrawCamp ? faceNum : paidPreview).toFixed(0)} · 可花 S$${faceNum || 0}`}
                {!noPay && discApply > 0 ? ` · −${discApply}%` : ""}
              </p>
              {minSpend > 0 && !noPay && (
                <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-1">
                  {lang === "en"
                    ? `Redeem min bill ≈ S$${minSpend.toFixed(0)}`
                    : `核销门槛约满 S$${minSpend.toFixed(0)}`}
                </p>
              )}
            </div>

            <Input
              label={
                noPay
                  ? lang === "en"
                    ? "Recipient phone (required)"
                    : "对方手机（必填 · 发到账户）"
                  : t("issueSelf.phone")
              }
              placeholder={t("issueSelf.phonePh")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground -mt-2">
              {noPay
                ? lang === "en"
                  ? "Required. Same phone to log in and see balance."
                  : "必填。对方用此手机登录后才能在余额里看到。"
                : lang === "en"
                  ? "Optional. Without phone, use short code only."
                  : "可选。不填手机也能用短码核销。"}
            </p>

            <label
              className={cn(
                "flex items-start gap-3 rounded-2xl border-2 bg-card p-3.5 cursor-pointer",
                noPay ? "border-amber-400/50" : "border-primary/25"
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 rounded border-border accent-primary"
                checked={cashConfirmed}
                onChange={(e) => setCashConfirmed(e.target.checked)}
              />
              <span className="text-sm text-foreground leading-snug">
                {noPay
                  ? lang === "en"
                    ? `I authorize no-pay issue of S$${faceNum.toFixed(2)} face (business owner only)`
                    : `我确认授权无支付发券 · 面值 S$${faceNum.toFixed(2)}（仅企业主，将记入台账）`
                  : lang === "en"
                    ? `I have received S$${(isDrawCamp ? faceNum : paidPreview).toFixed(2)} cash (or store payment)`
                    : `我已收到现金 S$${(isDrawCamp ? faceNum : paidPreview).toFixed(2)}（或店内收款）`}
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
          <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/35 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        {/* 发券台账 */}
        {history.length > 0 && (
          <div className="pt-2">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold text-foreground">
                {lang === "en" ? "Recent issues (audit)" : "最近发券（台账）"}
              </h3>
              <button
                type="button"
                className="text-[11px] text-primary font-medium"
                onClick={() => void loadHistory()}
              >
                {lang === "en" ? "Refresh" : "刷新"}
              </button>
            </div>
            <div className="space-y-2">
              {history.slice(0, 15).map((h) => (
                <div
                  key={h.id}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-[11px]",
                    h.noPay
                      ? "border-amber-200 bg-amber-50/80 dark:bg-amber-950/25"
                      : "border-border bg-card"
                  )}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-foreground">
                      {lang === "en" ? h.issueReasonEn : h.issueReasonZh}
                    </span>
                    <span className="tabular-nums text-muted-foreground shrink-0">
                      {new Date(h.createdAt).toLocaleString(
                        lang === "en" ? "en-SG" : "zh-CN",
                        { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
                      )}
                    </span>
                  </div>
                  <p className="text-foreground mt-0.5 tabular-nums">
                    {lang === "en" ? "Face" : "面值"} S${h.faceSgd}
                    {" · "}
                    {lang === "en" ? "Paid" : "实收"} S${h.paidSgd}
                    {h.shortCode ? ` · ${h.shortCode}` : ""}
                  </p>
                  <p className="text-muted-foreground mt-0.5 truncate">
                    {h.customerPhone || "—"}
                    {h.campaignName ? ` · ${h.campaignName}` : ""}
                  </p>
                  {h.issueNote && (
                    <p className="text-muted-foreground mt-0.5 line-clamp-2">
                      {h.issueNote}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {result && (
          <Card className="border-green-200 bg-green-50 dark:bg-green-950/35 overflow-hidden">
            <div className="h-1.5 bg-emerald-500/50" />
            <CardContent className="p-5 text-center space-y-3">
              <p className="text-sm font-medium text-green-800">
                {t("issueSelf.ok")}
                {result.noPay
                  ? lang === "en"
                    ? " · no-pay"
                    : " · 无支付"
                  : result.isDraw
                    ? lang === "en"
                      ? " · exclusive draw"
                      : " · 独享抽奖"
                    : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {lang === "en" ? "Paid" : "实收"} S$
                {result.paidSgd ?? "0.00"}
                {" · "}
                {lang === "en" ? "Spendable" : "可花"} S${result.balanceSgd}
                {result.discountPercent
                  ? ` · −${result.discountPercent}%`
                  : ""}
              </p>
              {result.issueNote && (
                <p className="text-[11px] text-muted-foreground bg-white/60 rounded-lg px-2 py-1.5">
                  {lang === "en" ? "Note" : "备注"}：{result.issueNote}
                </p>
              )}
              {result.instantPrize && (
                <div className="rounded-xl bg-white/80 border border-violet-100 px-3 py-2">
                  <p className="text-[10px] text-violet-600 font-medium">
                    {lang === "en"
                      ? "Instant prize (store pays)"
                      : "即时小奖（本店兑付）"}
                  </p>
                  <p className="text-lg font-semibold text-foreground mt-0.5">
                    {result.instantPrize.icon} {result.instantPrize.name}
                    <span className="text-sm font-normal text-muted-foreground ml-1">
                      S${result.instantPrize.valueSgd}
                    </span>
                  </p>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {lang === "en"
                  ? "Show this code to staff"
                  : "核销短码（给顾客 / 写小票）"}
              </p>
              <p className="text-4xl font-bold font-mono tracking-[0.25em] text-foreground tabular-nums">
                {result.shortCode}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => void copyCode()}
                >
                  {copied ? (
                    lang === "en" ? (
                      "Copied"
                    ) : (
                      "已复制"
                    )
                  ) : (
                    <>
                      <Copy size={14} />
                      {lang === "en" ? "Copy code" : "复制短码"}
                    </>
                  )}
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
                className="text-xs text-primary font-medium"
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

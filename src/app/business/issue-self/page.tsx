"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { useLang } from "@/components/i18n/LanguageProvider";
import { VoucherTypeBadge } from "@/components/voucher/VoucherTypeBadge";
import { ArrowLeft, Copy, Printer, Smartphone } from "lucide-react";
import { parseRulesSnapshot } from "@/lib/templates";
import { cn } from "@/lib/utils";
import {
  ISSUE_REASONS,
  isNoPayReason,
  type IssueReasonId,
} from "@/lib/issue-self";
import Link from "next/link";

/** 活动下挂的可发券产品 */
type ProductOpt = {
  id: string;
  name: string;
  type: string;
  productKind: string;
  status: string;
  packKind: string | null;
  enabledTiers: number[];
  description: string | null;
};

/** 活动（条款/日期/门店）+ 其下产品列表 */
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
  discountLocked: boolean;
  startDate?: string;
  endDate?: string;
  products: ProductOpt[];
};

type StoreOpt = { id: string; name: string };

type Channel = "digital" | "physical" | null;

const FALLBACK_VOUCHER_TIERS = [10, 20, 50, 100];
const FALLBACK_DRAW_TIERS = [50, 100];

function tiersFromProduct(p: {
  rulesSnapshot?: string | null;
  voucherTiers?: string | null;
}): number[] {
  const snap = parseRulesSnapshot(p.rulesSnapshot || null);
  let enabledTiers: number[] = Array.isArray(snap?.enabledTiers)
    ? (snap!.enabledTiers as number[]).filter(
        (n) => Number.isFinite(n) && n > 0
      )
    : [];
  if (!enabledTiers.length && p.voucherTiers) {
    try {
      const tiers = JSON.parse(p.voucherTiers) as { min?: number }[];
      enabledTiers = tiers
        .map((t) => Number(t.min))
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b);
    } catch {
      /* ignore */
    }
  }
  return enabledTiers;
}

function mapProduct(raw: Record<string, unknown>): ProductOpt {
  const snap = parseRulesSnapshot(
    typeof raw.rulesSnapshot === "string" ? raw.rulesSnapshot : null
  );
  const packKind =
    snap && typeof (snap as { packKind?: string }).packKind === "string"
      ? String((snap as { packKind?: string }).packKind)
      : null;
  return {
    id: String(raw.id),
    name: String(raw.name || ""),
    type: String(raw.type || ""),
    productKind: String(raw.productKind || "self_use"),
    status: String(raw.status || "active"),
    packKind,
    enabledTiers: tiersFromProduct({
      rulesSnapshot:
        typeof raw.rulesSnapshot === "string" ? raw.rulesSnapshot : null,
      voucherTiers:
        typeof raw.voucherTiers === "string" ? raw.voucherTiers : null,
    }),
    description: typeof raw.description === "string" ? raw.description : null,
  };
}

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
  if (packKind === "discount_10") discountPercent = 10;
  else if (packKind === "face_open" || packKind === "face_threshold")
    discountPercent = 0;
  else if (isDraw) discountPercent = 0;

  const discountLocked =
    isDraw ||
    packKind === "discount_10" ||
    packKind === "face_open" ||
    packKind === "face_threshold" ||
    packKind === "exclusive_ballot";

  const links = Array.isArray(raw.catalogProducts)
    ? (raw.catalogProducts as { product?: Record<string, unknown> }[])
    : [];
  const products = links
    .map((l) => l.product)
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map(mapProduct)
    .filter(
      (p) =>
        p.productKind === "self_use" &&
        (p.status === "active" || p.status === "draft")
    );

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
    startDate:
      raw.startDate instanceof Date
        ? raw.startDate.toISOString()
        : typeof raw.startDate === "string"
          ? raw.startDate
          : undefined,
    endDate:
      raw.endDate instanceof Date
        ? raw.endDate.toISOString()
        : typeof raw.endDate === "string"
          ? raw.endDate
          : undefined,
    products,
  };
}

export default function IssueSelfPage() {
  const { t, lang } = useLang();
  const router = useRouter();
  const searchParams = useSearchParams();
  /** cash = 柜台已收款购券；manage = 无支付发券（管理层） */
  const modeParam = searchParams.get("mode");
  const pageMode: "cash" | "manage" | "all" =
    modeParam === "cash" || modeParam === "manage" ? modeParam : "all";
  const [campaigns, setCampaigns] = useState<CampaignOpt[]>([]);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [productId, setProductId] = useState("");
  const [channel, setChannel] = useState<Channel>(null);
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
      // 活动优先：有条款/日期；含至少一款自用产品，或活动本身是自用/独享线
      const list = (j.data || [])
        .map((c: Record<string, unknown>) => mapCampaign(c))
        .filter(
          (c: CampaignOpt) =>
            (c.status === "active" || c.status === "draft") &&
            (c.productKind === "self_use" ||
              c.type === "lucky_draw_v2" ||
              c.type === "holiday" ||
              c.products.length > 0)
        ) as CampaignOpt[];
      setCampaigns(list);
      const prefCamp = searchParams.get("campaignId");
      const prefProd = searchParams.get("productId");
      if (prefCamp && list.some((c) => c.id === prefCamp)) {
        setCampaignId(prefCamp);
        const camp = list.find((c) => c.id === prefCamp);
        if (prefProd && camp?.products.some((p) => p.id === prefProd)) {
          setProductId(prefProd);
        }
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

  // 选活动 → 重置产品/渠道；仅一产品时自动选中
  useEffect(() => {
    if (!selectedCamp) {
      setProductId("");
      setChannel(null);
      return;
    }
    setChannel(null);
    setCashConfirmed(false);
    setResult(null);
    const prods = selectedCamp.products;
    if (prods.length === 1) {
      setProductId(prods[0].id);
    } else {
      setProductId((id) =>
        prods.some((p) => p.id === id) ? id : ""
      );
    }
  }, [selectedCamp]);

  const selectedProduct = useMemo(() => {
    if (!selectedCamp) return null;
    return selectedCamp.products.find((p) => p.id === productId) || null;
  }, [selectedCamp, productId]);

  // 选产品 → 同步档位
  useEffect(() => {
    if (!selectedProduct) return;
    setChannel(null);
    setCashConfirmed(false);
    setResult(null);
    if (selectedProduct.enabledTiers.length) {
      setAmountSgd(String(selectedProduct.enabledTiers[0]));
    } else if (selectedCamp?.enabledTiers?.length) {
      setAmountSgd(String(selectedCamp.enabledTiers[0]));
    }
  }, [selectedProduct]); // eslint-disable-line react-hooks/exhaustive-deps
  const isDrawCamp =
    selectedProduct?.type === "lucky_draw_v2" ||
    selectedProduct?.type === "lucky_draw" ||
    selectedProduct?.packKind === "exclusive_ballot" ||
    selectedCamp?.type === "lucky_draw_v2" ||
    selectedCamp?.type === "lucky_draw";
  const noPay = isNoPayReason(issueReason);

  const productTiers = useMemo(() => {
    if (selectedProduct?.enabledTiers?.length)
      return selectedProduct.enabledTiers;
    if (selectedCamp?.enabledTiers?.length) return selectedCamp.enabledTiers;
    return isDrawCamp ? FALLBACK_DRAW_TIERS : FALLBACK_VOUCHER_TIERS;
  }, [selectedProduct, selectedCamp, isDrawCamp]);

  // 按入口模式限制原因；抽奖活动不能选无支付
  useEffect(() => {
    if (pageMode === "cash") {
      setIssueReason("cash_sale");
      return;
    }
    if (pageMode === "manage") {
      const firstNoPay = ISSUE_REASONS.find((r) => !r.needsPay);
      if (firstNoPay && (issueReason === "cash_sale" || isDrawCamp)) {
        if (!isDrawCamp) setIssueReason(firstNoPay.id);
        else setIssueReason("cash_sale");
      }
      return;
    }
    if (isDrawCamp && noPay) {
      setIssueReason("cash_sale");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync on mode/camp
  }, [pageMode, isDrawCamp]);

  const visibleReasons = useMemo(() => {
    return ISSUE_REASONS.filter((r) => {
      if (isDrawCamp && !r.needsPay) return false;
      if (pageMode === "cash") return r.needsPay;
      if (pageMode === "manage") return !r.needsPay;
      return true;
    });
  }, [pageMode, isDrawCamp]);

  const quickAmounts = productTiers;
  const packKind =
    selectedProduct?.packKind || selectedCamp?.packKind || null;

  // 切换产品/活动：同步折扣
  useEffect(() => {
    if (selectedCamp) {
      setDiscountPercent(selectedCamp.discountPercent);
    } else if (isDrawCamp) {
      setDiscountPercent(0);
    }
    setCashConfirmed(false);
  }, [selectedCamp, selectedProduct, isDrawCamp]);

  const discountLocked =
    isDrawCamp ||
    packKind === "discount_10" ||
    packKind === "face_open" ||
    packKind === "face_threshold" ||
    packKind === "exclusive_ballot" ||
    !!selectedCamp?.discountLocked;

  const discApply =
    isDrawCamp || noPay
      ? 0
      : discountLocked
        ? selectedCamp?.discountPercent ??
          (packKind === "discount_10" ? 10 : 0)
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
    if (!selectedProduct && !selectedCamp) return null;
    if (isDrawCamp) {
      return lang === "en"
        ? "Exclusive draw product · digital code or printed paper · face 100/150/200 etc."
        : "独享抽奖产品 · 可发电子短码或印实体纸 · 档位见产品配置";
    }
    if (packKind === "discount_10") {
      return lang === "en"
        ? "10% off card · pay 90% cash, customer gets 100% face"
        : "9 折卡 · 收 90% 现金，顾客得 100% 面值";
    }
    if (packKind === "face_threshold") {
      return lang === "en"
        ? `Face voucher · min spend ≈ face × ${selectedCamp?.minSpendMultiplier || 10}`
        : `原价门槛代金 · 满约 券面×${selectedCamp?.minSpendMultiplier || 10} 可用`;
    }
    if (packKind === "face_open") {
      return lang === "en"
        ? "Face voucher · pay face, spend face"
        : "原价无门槛 · 付多少抵多少";
    }
    return lang === "en"
      ? "Select channel: digital short code or physical print batch"
      : "请先选渠道：电子短码（即时）或实体印刷（批量）";
  })();

  return (
    <div className="pb-10">
      <div className="px-4 py-3 border-b border-border bg-card sticky top-0 z-10">
        <button
          type="button"
          className="text-xs text-primary font-medium flex items-center gap-0.5 active:scale-[0.97] transition-transform"
          onClick={() => router.push("/business/offers")}
        >
          <ArrowLeft size={13} />{" "}
          {lang === "en" ? "Activity perks" : "← 活动券"}
        </button>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <h1 className="text-lg font-semibold text-foreground">
            {pageMode === "cash"
              ? lang === "en"
                ? "Cash sale issue"
                : "现金购券"
              : pageMode === "manage"
                ? lang === "en"
                  ? "Issue management"
                  : "发券管理"
                : t("issueSelf.title")}
          </h1>
          <VoucherTypeBadge kind="self_use" size="sm" isDraw={isDrawCamp} />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {pageMode === "cash"
            ? lang === "en"
              ? "Customer paid at counter · issue self/exclusive voucher · owners only"
              : "柜台已收款 → 按活动/产品发自用或独享券 · 仅企业管理层"
            : pageMode === "manage"
              ? lang === "en"
                ? "Debt / welfare / marketing issue · no payment · owners only"
                : "抵欠、福利、营销等无支付发券 · 仅企业管理层"
              : t("issueSelf.subtitle")}
        </p>
        {pageMode !== "all" && (
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => router.replace("/business/issue-self?mode=cash")}
              className={cn(
                "text-[11px] font-semibold px-2.5 py-1 rounded-full",
                pageMode === "cash"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {lang === "en" ? "Cash sale" : "现金购券"}
            </button>
            <button
              type="button"
              onClick={() => router.replace("/business/issue-self?mode=manage")}
              className={cn(
                "text-[11px] font-semibold px-2.5 py-1 rounded-full",
                pageMode === "manage"
                  ? "bg-amber-600 text-white"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {lang === "en" ? "Issue mgmt" : "发券管理"}
            </button>
          </div>
        )}
      </div>

      <div className="px-4 mt-4 space-y-4">
        <div className="rounded-2xl bg-muted/50 border border-border px-3 py-2.5 text-[11px] text-muted-foreground leading-relaxed">
          {lang === "en" ? (
            <>
              <strong>1 Activity</strong> (terms & dates) →{" "}
              <strong>2 Product</strong> (tiers) → <strong>3 Channel</strong>{" "}
              (digital code or paper print). Rights = activity + product.
            </>
          ) : (
            <>
              <strong>① 选活动</strong>（条款/日期）→ <strong>② 选券产品</strong>
              （档位）→ <strong>③ 渠道</strong>
              （电子短码 / 实体印刷）。权益 = 活动 + 产品组合。
            </>
          )}
        </div>

        {campaigns.length === 0 ? (
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-sm text-muted-foreground">
                {lang === "en"
                  ? "No activities. Create one and attach a product."
                  : "暂无活动。请先创建活动并挂上券产品。"}
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/business/campaigns")}
              >
                {lang === "en" ? "Campaigns →" : "活动管理 →"}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/business/products")}
              >
                {lang === "en" ? "Voucher products →" : "券产品 →"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* ① 活动（条款容器） */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {lang === "en" ? "1. Activity" : "① 活动（活动券）"}
              </label>
              <p className="text-[10px] text-muted-foreground mt-0.5 mb-1.5">
                {lang === "en"
                  ? "Terms, schedule, prize pool — pick the activity first."
                  : "条款、档期、奖池都在活动上；先选活动再选产品。"}
              </p>
              <div className="grid grid-cols-1 gap-2">
                {campaigns.map((c) => {
                  const active = campaignId === c.id;
                  const draw =
                    c.type === "lucky_draw_v2" || c.type === "lucky_draw";
                  const end =
                    c.endDate &&
                    new Date(c.endDate).toLocaleDateString(
                      lang === "en" ? "en-SG" : "zh-CN",
                      { month: "short", day: "numeric" }
                    );
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCampaignId(c.id)}
                      className={cn(
                        "text-left rounded-xl border px-3 py-2.5 transition-all active:scale-[0.99]",
                        active
                          ? "border-primary bg-primary/5 ring-1 ring-primary/25"
                          : "border-border bg-card"
                      )}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">
                          {c.name}
                        </p>
                        <VoucherTypeBadge
                          kind="self_use"
                          size="sm"
                          isDraw={draw}
                        />
                        {c.status === "draft" && (
                          <span className="text-[10px] text-amber-700">
                            draft
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {c.products.length}{" "}
                        {lang === "en" ? "product(s)" : "款产品"}
                        {end
                          ? ` · ${lang === "en" ? "until" : "至"} ${end}`
                          : ""}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ② 活动下的券产品 */}
            {selectedCamp && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  {lang === "en" ? "2. Product under activity" : "② 活动下的券产品"}
                </label>
                {selectedCamp.products.length === 0 ? (
                  <p className="mt-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    {lang === "en"
                      ? "No product linked. Attach a product in Campaigns."
                      : "该活动未挂券产品。请到活动管理勾选产品后再发券。"}
                  </p>
                ) : (
                  <div className="mt-1.5 grid grid-cols-1 gap-2">
                    {selectedCamp.products.map((p) => {
                      const active = productId === p.id;
                      const draw =
                        p.type === "lucky_draw_v2" ||
                        p.packKind === "exclusive_ballot";
                      const tiers =
                        p.enabledTiers.length > 0
                          ? p.enabledTiers.map((t) => `S$${t}`).join(" / ")
                          : selectedCamp.enabledTiers.length
                            ? selectedCamp.enabledTiers
                                .map((t) => `S$${t}`)
                                .join(" / ")
                            : "—";
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setProductId(p.id)}
                          className={cn(
                            "text-left rounded-xl border px-3 py-2.5 transition-all active:scale-[0.99]",
                            active
                              ? "border-primary bg-primary/5 ring-1 ring-primary/25"
                              : "border-border bg-card"
                          )}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-foreground">
                              {p.name}
                            </p>
                            <VoucherTypeBadge
                              kind="self_use"
                              size="sm"
                              isDraw={draw}
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {lang === "en" ? "Tiers" : "档位"} {tiers}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
                {packHint && selectedProduct && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                    {packHint}
                  </p>
                )}
              </div>
            )}

            {/* ③ 渠道：电子 vs 实体 */}
            {selectedCamp && selectedProduct && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  {lang === "en" ? "3. Channel" : "③ 发券渠道"}
                </label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setChannel("digital")}
                    className={cn(
                      "rounded-xl border p-3 text-left active:scale-[0.99]",
                      channel === "digital"
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border bg-card"
                    )}
                  >
                    <Smartphone size={18} className="text-primary mb-1" />
                    <p className="text-sm font-semibold">
                      {lang === "en" ? "Digital code" : "电子短码"}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {lang === "en"
                        ? "Issue now · phone/code to customer"
                        : "当场发码 · 报手机/短码给顾客"}
                    </p>
                  </button>
                  <Link
                    href={`/business/physical?from=offers&campaignId=${encodeURIComponent(selectedCamp.id)}`}
                    className={cn(
                      "rounded-xl border p-3 text-left active:scale-[0.99] block",
                      channel === "physical"
                        ? "border-amber-500 bg-amber-50 ring-1 ring-amber-500/30"
                        : "border-border bg-card"
                    )}
                    onClick={() => setChannel("physical")}
                  >
                    <Printer size={18} className="text-amber-700 mb-1" />
                    <p className="text-sm font-semibold">
                      {lang === "en" ? "Physical print" : "实体印刷"}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {lang === "en"
                        ? "Batch paper · same activity + product"
                        : "批量印纸 · 同一活动+产品"}
                    </p>
                  </Link>
                </div>
              </div>
            )}

            {/* ④ 电子发码表单 */}
            {selectedCamp && selectedProduct && channel === "digital" && (
              <>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {lang === "en" ? "4. Store" : "④ 门店"}
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
                {visibleReasons.map((r) => {
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
              {productTiers.length > 0 ? (
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
                {discountLocked ? (
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

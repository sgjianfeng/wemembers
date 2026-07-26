"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useLang } from "@/components/i18n/LanguageProvider";
import { BrandAvatar } from "@/components/ui/BrandAvatar";
import { QrScannerSheet } from "@/components/business/QrScannerSheet";
import { VoucherTypeBadge } from "@/components/voucher/VoucherTypeBadge";
import { resolveStoreLogo } from "@/lib/utils";
import Link from "next/link";
import type { ProductKind } from "@/lib/product-kind";

/** 店员核销台：线上券（手机）+ 实体券（纸） */
type Tab = "online" | "physical";

type StoreOption = {
  id: string;
  name: string;
  address?: string | null;
};

type ProductMode = "draw" | "voucher";

export default function ScanClient({
  storeId,
  storeName,
  stores = [],
  locked = false,
  businessLogo = null,
}: {
  storeId: string | null;
  storeName: string | null;
  stores?: StoreOption[];
  locked?: boolean;
  /** 企业品牌 logo；门店无专属图时使用 */
  businessLogo?: string | null;
}) {
  const { t, lang } = useLang();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("online");

  // ── Online prepaid voucher (代金 / 抽奖余额) ──
  const [voucherId, setVoucherId] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [voucherInfo, setVoucherInfo] = useState<{
    id: string;
    shortCode?: string | null;
    balanceSgd: string;
    balanceCents: number;
    amountSgd: string;
    paidSgd?: string;
    budgetPercent: number;
    productMode: ProductMode;
    productKind: ProductKind;
    isDraw: boolean;
    campaignName: string;
    customerName: string;
    customerPhone?: string;
    status: string;
  } | null>(null);
  type Candidate = {
    id: string;
    shortCode?: string | null;
    balanceSgd: string;
    amountSgd: string;
    productMode: ProductMode;
    productKind: ProductKind;
    isDraw: boolean;
    campaignName: string;
    customerName: string;
    customerPhone?: string;
    status: string;
  };
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [redeemAmountSgd, setRedeemAmountSgd] = useState("");
  const [voucherResult, setVoucherResult] = useState<{
    ok: boolean;
    message: string;
    remaining?: string;
    income?: string;
    fee?: string;
  } | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Physical ticket ──
  const [physicalCode, setPhysicalCode] = useState("");
  const [physicalLoading, setPhysicalLoading] = useState(false);
  const [physicalRedeeming, setPhysicalRedeeming] = useState(false);
  const [physicalSelling, setPhysicalSelling] = useState(false);
  const [sellPaidSgd, setSellPaidSgd] = useState("");
  const [sellPhone, setSellPhone] = useState("");
  const [physicalInfo, setPhysicalInfo] = useState<{
    code: string;
    status: string;
    type: string;
    title: string;
    valueSgd: string;
    paidSgd?: string;
    ticketStoreName: string;
    soldStoreName?: string | null;
    redeemedStoreName?: string | null;
    sameStore: boolean;
    storeOnlyError: string | null;
    canSell?: boolean;
    canRedeem?: boolean;
    canRedeemUnbound: boolean;
    canRedeemClaimed: boolean;
    needSellFirst?: boolean;
    suggestClaim: boolean;
    customer: { name: string | null } | null;
  } | null>(null);
  const [physicalMsg, setPhysicalMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  function needStoreMessage() {
    return lang === "en"
      ? "Pick a store for this redemption"
      : "请先选择本次核销的门店";
  }

  function parseVoucherInput(raw: string): string {
    let s = raw.trim();
    if (s.toLowerCase().startsWith("wmv:")) s = s.slice(4).trim();
    try {
      if (s.includes("://") || s.includes("?")) {
        const u = new URL(s, "https://local.invalid");
        const q = u.searchParams.get("id") || u.searchParams.get("voucherId");
        if (q) s = q;
      }
    } catch {
      /* ignore */
    }
    if (s.includes("/")) {
      const part = s.split("/").filter(Boolean).pop() || s;
      if (part.length > 10) s = part;
    }
    return s.trim();
  }

  function mapVoucherData(d: Record<string, unknown>) {
    const productMode: ProductMode =
      d.productMode === "draw" || d.campaignType === "lucky_draw_v2"
        ? "draw"
        : "voucher";
    const productKind: ProductKind =
      d.productKind === "self_use" ? "self_use" : "distribution";
    const isDraw =
      d.isDraw === true ||
      productMode === "draw" ||
      d.campaignType === "lucky_draw_v2";
    return {
      id: String(d.id),
      shortCode: (d.shortCode as string | null) || null,
      balanceSgd: String(d.balanceSgd),
      balanceCents: Number(d.balanceCents),
      amountSgd: String(d.amountSgd),
      paidSgd: d.paidSgd != null ? String(d.paidSgd) : undefined,
      budgetPercent:
        Number(d.budgetPercent) || (productMode === "draw" ? 20 : 0),
      productMode,
      productKind,
      isDraw,
      campaignName: String(d.campaignName || ""),
      customerName: String(d.customerName || ""),
      customerPhone: d.customerPhone ? String(d.customerPhone) : undefined,
      status: String(d.status || ""),
    };
  }

  async function lookupVoucher(rawId?: string) {
    const id = parseVoucherInput(rawId ?? voucherId);
    if (!id) return;
    setVoucherId(id);
    setLookupLoading(true);
    setVoucherInfo(null);
    setVoucherResult(null);
    setCandidates([]);
    try {
      const res = await fetch(
        `/api/voucher/lookup?q=${encodeURIComponent(id)}`
      );
      const json = await res.json();
      if (!res.ok) {
        setVoucherResult({
          ok: false,
          message: json.error || t("scan.lookupFail"),
        });
      } else if (json.candidates && Array.isArray(json.candidates)) {
        setCandidates(
          json.candidates.map((c: Record<string, unknown>) => {
            const m = mapVoucherData(c);
            return {
              id: m.id,
              shortCode: m.shortCode,
              balanceSgd: m.balanceSgd,
              amountSgd: m.amountSgd,
              productMode: m.productMode,
              productKind: m.productKind,
              isDraw: m.isDraw,
              campaignName: m.campaignName,
              customerName: m.customerName,
              customerPhone: m.customerPhone,
              status: m.status,
            };
          })
        );
      } else if (json.data) {
        const m = mapVoucherData(json.data);
        setVoucherInfo(m);
        setRedeemAmountSgd(m.balanceSgd);
        if (m.shortCode) setVoucherId(m.shortCode);
      }
    } catch {
      setVoucherResult({ ok: false, message: t("business.scan.networkError") });
    }
    setLookupLoading(false);
  }

  function onVoucherQueryChange(value: string) {
    setVoucherId(value);
    setCandidates([]);
    setVoucherInfo(null);
    setVoucherResult(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = parseVoucherInput(value);
    // 满 3 位自动搜候选；满 6 位短码也搜
    if (q.length < 3) return;
    searchTimer.current = setTimeout(() => {
      void lookupVoucher(q);
    }, 350);
  }

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  function pickCandidate(c: Candidate) {
    setCandidates([]);
    void lookupVoucher(c.shortCode || c.id);
  }

  async function redeemVoucher(full: boolean) {
    if (!voucherInfo) return;
    if (!storeId) {
      setVoucherResult({ ok: false, message: needStoreMessage() });
      return;
    }
    const amountSgd = full ? Number(voucherInfo.balanceSgd) : Number(redeemAmountSgd);
    if (!Number.isFinite(amountSgd) || amountSgd <= 0) {
      setVoucherResult({ ok: false, message: t("scan.invalidAmount") });
      return;
    }
    const amountCents = Math.round(amountSgd * 100);
    if (amountCents > voucherInfo.balanceCents) {
      setVoucherResult({ ok: false, message: t("scan.exceeds") });
      return;
    }

    setRedeemLoading(true);
    setVoucherResult(null);
    try {
      const res = await fetch("/api/voucher/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voucherId: voucherInfo.id,
          amountCents,
          storeId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setVoucherResult({ ok: false, message: json.error || t("scan.fail") });
      } else {
        const kind =
          json.data?.productKind === "self_use" ? "self_use" : "distribution";
        const draw = voucherInfo?.isDraw === true;
        setVoucherResult({
          ok: true,
          message:
            kind === "self_use"
              ? draw
                ? t("scan.successExclusive")
                : t("scan.successSelf")
              : draw
                ? t("scan.successCoWin")
                : t("scan.successDist"),
          remaining: json.data?.voucher?.remainingBalanceSgd,
          income: json.data?.usage?.storeIncomeSgd,
          fee: json.data?.usage?.feeSgd,
        });
        setVoucherInfo({
          ...voucherInfo,
          balanceSgd: json.data.voucher.remainingBalanceSgd,
          balanceCents: Math.round(Number(json.data.voucher.remainingBalanceSgd) * 100),
          status: json.data.voucher.status,
        });
        setRedeemAmountSgd(json.data.voucher.remainingBalanceSgd);
      }
    } catch {
      setVoucherResult({ ok: false, message: t("business.scan.networkError") });
    }
    setRedeemLoading(false);
  }

  function pickStore(id: string) {
    router.push(`/business/scan?storeId=${id}`);
  }

  async function lookupPhysical() {
    if (!physicalCode.trim()) return;
    if (!storeId) {
      setPhysicalMsg({ ok: false, text: needStoreMessage() });
      return;
    }
    setPhysicalLoading(true);
    setPhysicalInfo(null);
    setPhysicalMsg(null);
    try {
      const res = await fetch("/api/business/physical/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: physicalCode.trim(), storeId }),
      });
      const j = await res.json();
      if (!res.ok) {
        setPhysicalMsg({ ok: false, text: j.error || "查询失败" });
      } else {
        setPhysicalInfo(j.data);
        setPhysicalCode(j.data.code);
        // 默认实收 = 面值
        setSellPaidSgd(j.data.valueSgd || "");
        setSellPhone("");
      }
    } catch {
      setPhysicalMsg({ ok: false, text: t("business.scan.networkError") });
    }
    setPhysicalLoading(false);
  }

  async function sellPhysical() {
    if (!physicalInfo || !storeId) return;
    setPhysicalSelling(true);
    setPhysicalMsg(null);
    try {
      const res = await fetch("/api/business/physical/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: physicalInfo.code,
          storeId,
          paidSgd: sellPaidSgd === "" ? undefined : Number(sellPaidSgd),
          paymentMethod: "cash",
          customerPhone: sellPhone.trim() || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setPhysicalMsg({ ok: false, text: j.error || "售出登记失败" });
      } else {
        setPhysicalMsg({
          ok: true,
          text: j.data?.message || (lang === "en" ? "Sold" : "已登记售出"),
        });
        // 刷新详情
        const lr = await fetch("/api/business/physical/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: physicalInfo.code, storeId }),
        });
        const lj = await lr.json();
        if (lr.ok) setPhysicalInfo(lj.data);
      }
    } catch {
      setPhysicalMsg({ ok: false, text: t("business.scan.networkError") });
    }
    setPhysicalSelling(false);
  }

  async function redeemPhysical() {
    if (!physicalInfo || !storeId) return;
    setPhysicalRedeeming(true);
    setPhysicalMsg(null);
    try {
      const res = await fetch("/api/business/physical/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: physicalInfo.code, storeId }),
      });
      const j = await res.json();
      if (!res.ok) {
        setPhysicalMsg({ ok: false, text: j.error || "核销失败" });
      } else {
        setPhysicalMsg({
          ok: true,
          text: j.data?.message || "核销成功",
        });
        setPhysicalInfo({
          ...physicalInfo,
          status: "redeemed",
          canSell: false,
          canRedeem: false,
          canRedeemUnbound: false,
          canRedeemClaimed: false,
          redeemedStoreName: j.data?.redeemStoreName || storeName,
        });
      }
    } catch {
      setPhysicalMsg({ ok: false, text: t("business.scan.networkError") });
    }
    setPhysicalRedeeming(false);
  }

  // 企业未选店：先展示门店列表
  if (!locked && !storeId) {
    return (
      <div className="pb-4">
        <div className="px-4 py-3 border-b border-border">
          <h1 className="text-lg font-semibold">{t("business.scan.title")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {lang === "en"
              ? "Choose which store is redeeming"
              : "请选择本次核销的门店"}
          </p>
        </div>

        {stores.length === 0 ? (
          <div className="mx-4 mt-4 rounded-2xl border border-amber-100 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/40 p-4">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
              {lang === "en" ? "No stores yet" : "还没有门店"}
            </p>
            <p className="text-xs text-amber-800/80 dark:text-amber-400/80 mt-1">
              {lang === "en"
                ? "Add a store first, then redeem there."
                : "请先添加门店，再在该店核销。"}
            </p>
            <Link
              href="/business/stores"
              className="inline-flex mt-3 h-9 items-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground"
            >
              {lang === "en" ? "Add store" : "添加门店"}
            </Link>
          </div>
        ) : (
          <div className="px-4 mt-4 space-y-2">
            {stores.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pickStore(s.id)}
                className="w-full text-left rounded-xl border border-border bg-card p-3 hover:border-primary/40 active:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <BrandAvatar
                    src={resolveStoreLogo(null, businessLogo)}
                    name={s.name}
                    size={40}
                    rounded="xl"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {s.name}
                    </p>
                    {s.address && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {s.address}
                      </p>
                    )}
                    <p className="text-[11px] text-primary font-medium mt-0.5">
                      {lang === "en" ? "Redeem here →" : "在此店核销 →"}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-border">
        <h1 className="text-lg font-semibold">{t("business.scan.title")}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {storeName
            ? lang === "en"
              ? `Redeeming at · ${storeName}`
              : `核销门店 · ${storeName}`
            : locked
              ? lang === "en"
                ? "No store assigned"
                : "未绑定门店"
              : lang === "en"
                ? "No store selected"
                : "未选择门店"}
        </p>
        {!locked && storeId && stores.length > 1 && (
          <button
            type="button"
            onClick={() => router.push("/business/scan")}
            className="mt-1 text-[11px] font-medium text-primary"
          >
            {lang === "en" ? "Change store" : "更换门店"}
          </button>
        )}
      </div>

      {!storeId && (
        <div className="mx-4 mt-3 rounded-xl border border-amber-100 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/35 px-3 py-2.5 text-xs text-amber-900">
          {lang === "en"
            ? "No store assigned. Contact your company admin."
            : "未绑定门店，请联系企业管理员。"}
        </div>
      )}

      {/* 仅两种：线上券（手机） / 实体券（纸） */}
      <div className="px-4 mt-3 flex gap-1.5">
        <button
          type="button"
          onClick={() => setTab("online")}
          className={`flex-1 h-9 rounded-full text-[11px] font-medium ${
            tab === "online" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {t("scan.voucherTab")}
        </button>
        <button
          type="button"
          onClick={() => setTab("physical")}
          className={`flex-1 h-9 rounded-full text-[11px] font-medium ${
            tab === "physical" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {t("scan.physicalTab")}
        </button>
      </div>

      <p className="px-4 mt-2 text-[10px] text-muted-foreground text-center">
        {t("scan.twoPathsHint")}
      </p>

      {tab === "online" && (
        <div className="px-4 mt-4 space-y-4">
          <div className="bg-muted/50 rounded-xl p-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t("scan.voucherHint")}</p>
            <QrScannerSheet
              className="w-full h-11 rounded-full border-primary/30 text-primary font-semibold"
              disabled={!storeId}
              onScan={(raw) => {
                const id = parseVoucherInput(raw);
                setVoucherId(id);
                void lookupVoucher(id);
              }}
            />
            <div className="relative flex items-center gap-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] text-muted-foreground">
                {lang === "en" ? "or type short code" : "或输 6 位短码"}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <Input
              placeholder={t("scan.voucherPlaceholder")}
              value={voucherId}
              onChange={(e) => onVoucherQueryChange(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (text) {
                  e.preventDefault();
                  const id = parseVoucherInput(text);
                  setVoucherId(id);
                  void lookupVoucher(id);
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && lookupVoucher()}
              className="font-mono text-sm tracking-wider uppercase"
              autoCapitalize="characters"
              autoCorrect="off"
            />
            <Button className="w-full" onClick={() => lookupVoucher()} loading={lookupLoading}>
              {t("scan.lookup")}
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">{t("scan.lookupHelp")}</p>
          </div>

          {candidates.length > 0 && (
            <Card className="border-primary/20">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("scan.pickCandidate", { n: candidates.length })}
                </p>
                <ul className="space-y-1.5">
                  {candidates.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => pickCandidate(c)}
                        className="w-full text-left rounded-xl border border-border bg-card p-3 hover:border-primary/50 active:bg-muted/50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <VoucherTypeBadge
                                kind={c.productKind}
                                isDraw={c.isDraw}
                                size="sm"
                              />
                              <span className="text-sm font-semibold font-mono tracking-widest text-primary">
                                {c.shortCode || c.id.slice(0, 8)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {c.campaignName}
                              {c.customerName ? ` · ${c.customerName}` : ""}
                              {c.customerPhone ? ` · ${c.customerPhone}` : ""}
                            </p>
                          </div>
                          <p className="text-sm font-bold text-primary shrink-0 nums">
                            S${c.balanceSgd}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {voucherInfo && (
            <Card className="border-border">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {voucherInfo.campaignName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {voucherInfo.customerName || "—"}
                      {voucherInfo.customerPhone
                        ? ` · ${voucherInfo.customerPhone}`
                        : ""}
                    </p>
                    {voucherInfo.shortCode && (
                      <p className="text-base font-bold font-mono tracking-[0.2em] text-primary mt-1">
                        {voucherInfo.shortCode}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <VoucherTypeBadge
                      kind={voucherInfo.productKind}
                      isDraw={voucherInfo.isDraw}
                      size="sm"
                    />
                    <Badge
                      variant={voucherInfo.status === "active" ? "green" : "slate"}
                      size="sm"
                    >
                      {voucherInfo.status}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-primary/10 rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground">{t("scan.balance")}</p>
                    <p className="text-lg font-bold text-primary tabular-nums">
                      S${voucherInfo.balanceSgd}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground">{t("scan.face")}</p>
                    <p className="text-lg font-bold text-foreground tabular-nums">
                      S${voucherInfo.amountSgd}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {voucherInfo.productKind === "self_use"
                    ? voucherInfo.isDraw
                      ? t("scan.feeHintExclusive")
                      : t("scan.feeHintSelf")
                    : voucherInfo.isDraw
                      ? t("scan.feeHintDraw", {
                          pct: voucherInfo.budgetPercent || 20,
                          rest: 100 - (voucherInfo.budgetPercent || 20),
                        })
                      : t("scan.feeHintVoucher")}
                </p>
                <Input
                  label={t("scan.amountLabel")}
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={redeemAmountSgd}
                  onChange={(e) => setRedeemAmountSgd(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    loading={redeemLoading}
                    onClick={() => redeemVoucher(false)}
                    disabled={voucherInfo.balanceCents <= 0}
                  >
                    {t("scan.partial")}
                  </Button>
                  <Button
                    loading={redeemLoading}
                    onClick={() => redeemVoucher(true)}
                    disabled={voucherInfo.balanceCents <= 0}
                  >
                    {t("scan.full")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {voucherResult && (
            <Card
              className={
                voucherResult.ok
                  ? "border-green-200 bg-green-50 dark:bg-green-950/35"
                  : "border-red-200 bg-red-50 dark:bg-red-950/35"
              }
            >
              <CardContent className="p-4 text-center space-y-1">
                <p className="text-2xl">{voucherResult.ok ? "✅" : "❌"}</p>
                <p
                  className={`text-sm font-medium ${
                    voucherResult.ok ? "text-green-800" : "text-red-600"
                  }`}
                >
                  {voucherResult.message}
                </p>
                {voucherResult.ok && (
                  <>
                    {voucherInfo?.productKind !== "self_use" && (
                      <p className="text-xs text-green-700 dark:text-green-400">
                        {t("scan.income")} S${voucherResult.income} · {t("scan.fee")}{" "}
                        S${voucherResult.fee}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t("scan.remaining")} S${voucherResult.remaining}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <div className="p-3 bg-muted/50 rounded-xl">
            <ul className="text-[11px] text-muted-foreground space-y-1">
              <li>• {t("scan.tipOnline1")}</li>
              <li>• {t("scan.tipOnline2")}</li>
              <li>• {t("business.scan.tip4")}</li>
            </ul>
          </div>
        </div>
      )}

      {tab === "physical" && (
        <div className="px-4 mt-4 space-y-4">
          <div className="bg-muted/50 rounded-xl p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              {lang === "en"
                ? "Scan paper code: register cash sale first, then redeem at any group store."
                : "扫纸质码：先登记现金售出，再在集团任一门店核销。"}
            </p>
            <QrScannerSheet
              className="w-full h-11 rounded-full border-primary/30 text-primary font-semibold"
              disabled={!storeId}
              onScan={(raw) => {
                // 纸码可能是 PT-… 或 claim URL 含 code
                let code = raw.trim();
                try {
                  if (code.includes("://") || code.includes("/c/")) {
                    const u = new URL(code, "https://wemembers.store");
                    const part = u.pathname.split("/").filter(Boolean).pop();
                    if (part) code = part;
                    const q = u.searchParams.get("code");
                    if (q) code = q;
                  }
                } catch {
                  /* keep raw */
                }
                setPhysicalCode(code.toUpperCase());
                // 直接查：需要先 set 再调，用解析后的 code
                void (async () => {
                  if (!storeId) {
                    setPhysicalMsg({ ok: false, text: needStoreMessage() });
                    return;
                  }
                  setPhysicalLoading(true);
                  setPhysicalInfo(null);
                  setPhysicalMsg(null);
                  try {
                    const res = await fetch("/api/business/physical/lookup", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        code: code.trim(),
                        storeId,
                      }),
                    });
                    const j = await res.json();
                    if (!res.ok) {
                      setPhysicalMsg({ ok: false, text: j.error || "查询失败" });
                    } else {
                      setPhysicalInfo(j.data);
                      setPhysicalCode(j.data.code);
                    }
                  } catch {
                    setPhysicalMsg({
                      ok: false,
                      text: t("business.scan.networkError"),
                    });
                  }
                  setPhysicalLoading(false);
                })();
              }}
            />
            <div className="relative flex items-center gap-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] text-muted-foreground">
                {lang === "en" ? "or type" : "或输入"}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <Input
              placeholder="PT-XXXXXXXXXXXX"
              value={physicalCode}
              onChange={(e) => setPhysicalCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && lookupPhysical()}
              className="font-mono text-sm"
            />
            <Button className="w-full" onClick={lookupPhysical} loading={physicalLoading}>
              {t("scan.lookup")}
            </Button>
          </div>

          {physicalInfo && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {physicalInfo.title}
                  </p>
                  <Badge
                    variant={physicalInfo.type === "draw" ? "orange" : "blue"}
                    size="sm"
                  >
                    {physicalInfo.type === "draw"
                      ? t("scan.typeDraw")
                      : t("scan.typeVoucher")}
                  </Badge>
                </div>
                {physicalInfo.type === "voucher" && (
                  <p className="text-xl font-bold text-primary">
                    S${physicalInfo.valueSgd}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {lang === "en" ? "Print store" : "印刷店"}:{" "}
                  {physicalInfo.ticketStoreName}
                </p>
                {physicalInfo.soldStoreName && (
                  <p className="text-xs text-muted-foreground">
                    {lang === "en" ? "Sold at" : "售出店"}:{" "}
                    {physicalInfo.soldStoreName}
                    {physicalInfo.paidSgd != null
                      ? ` · ${lang === "en" ? "paid" : "实收"} S$${physicalInfo.paidSgd}`
                      : ""}
                  </p>
                )}
                {physicalInfo.redeemedStoreName && (
                  <p className="text-xs text-muted-foreground">
                    {lang === "en" ? "Redeemed at" : "核销店"}:{" "}
                    {physicalInfo.redeemedStoreName}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {t("scan.physicalStatus")}: {physicalInfo.status}
                  {physicalInfo.customer?.name
                    ? ` · ${t("scan.physicalBound")} ${physicalInfo.customer.name}`
                    : physicalInfo.status === "sold"
                      ? ` · ${lang === "en" ? "sold, unbound" : "已售未绑"}`
                      : ` · ${t("scan.physicalUnbound")}`}
                </p>
                {physicalInfo.needSellFirst && (
                  <p className="text-xs text-amber-800 bg-amber-50 dark:bg-amber-950/35 rounded-lg p-2">
                    {lang === "en"
                      ? "Not sold yet — register cash payment before redeem."
                      : "尚未售出：请先登记收款，再核销。"}
                  </p>
                )}
                {physicalInfo.suggestClaim && (
                  <p className="text-xs text-amber-800 bg-amber-50 dark:bg-amber-950/35 rounded-lg p-2">
                    {t("scan.physicalDrawBind")}
                  </p>
                )}

                {physicalInfo.canSell && (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    <p className="text-xs font-semibold text-foreground">
                      {lang === "en" ? "Cash sale" : "现金售出登记"}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground shrink-0">
                        {lang === "en" ? "Paid S$" : "实收 S$"}
                      </span>
                      <Input
                        value={sellPaidSgd}
                        onChange={(e) => setSellPaidSgd(e.target.value)}
                        inputMode="decimal"
                        className="h-9"
                        placeholder={physicalInfo.valueSgd}
                      />
                    </div>
                    <Input
                      label={
                        lang === "en"
                          ? "Customer phone (optional)"
                          : "顾客手机（可选）"
                      }
                      value={sellPhone}
                      onChange={(e) => setSellPhone(e.target.value)}
                      inputMode="tel"
                      placeholder="91234567"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {lang === "en"
                        ? "If phone is a registered customer, ticket binds to their account."
                        : "若手机号已注册顾客，将自动绑定到其账号。"}
                    </p>
                    <Button
                      className="w-full"
                      onClick={sellPhysical}
                      loading={physicalSelling}
                    >
                      {lang === "en"
                        ? "Confirm cash received & mark sold"
                        : "确认已收现金 · 标记售出"}
                    </Button>
                  </div>
                )}

                {(physicalInfo.canRedeem ||
                  physicalInfo.canRedeemUnbound ||
                  physicalInfo.canRedeemClaimed) && (
                  <Button
                    className="w-full mt-2"
                    onClick={redeemPhysical}
                    loading={physicalRedeeming}
                  >
                    {t("scan.physicalRedeem")}
                    {storeName
                      ? lang === "en"
                        ? ` @ ${storeName}`
                        : ` · ${storeName}`
                      : ""}
                  </Button>
                )}
                {physicalInfo.type === "draw" &&
                  physicalInfo.status !== "redeemed" &&
                  !physicalInfo.canRedeem && (
                    <p className="text-[11px] text-muted-foreground">
                      {t("scan.physicalDrawNoAnon")}
                    </p>
                  )}
              </CardContent>
            </Card>
          )}

          {physicalMsg && (
            <Card
              className={
                physicalMsg.ok
                  ? "border-green-200 bg-green-50 dark:bg-green-950/35"
                  : "border-red-200 bg-red-50 dark:bg-red-950/35"
              }
            >
              <CardContent className="p-4 text-center text-sm">
                {physicalMsg.ok ? "✅ " : "❌ "}
                {physicalMsg.text}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

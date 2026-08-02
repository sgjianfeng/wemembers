"use client";

/**
 * 本店国庆操作台：门店已锁定，双路径（购券扫码 / 收银凭票）
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useLang } from "@/components/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

type CampaignOpt = {
  id: string;
  name: string;
  minSpendCents: number;
  giftCouponCents: number;
  validDays: number;
  status: string;
};

type GrantRow = {
  id: string;
  channel: string;
  phone: string;
  receiptAmountCents: number;
  status: string;
  issuedAt: string | null;
  campaignName: string;
};

export function NdpDeskClient({
  storeId,
  storeName,
  initialCampaignId,
  canComp,
  backHref,
}: {
  storeId: string;
  storeName: string;
  initialCampaignId?: string | null;
  /** 企业主可「管理层特批」；店员仅凭票 */
  canComp: boolean;
  backHref: string;
}) {
  const { lang } = useLang();
  const zh = lang !== "en";

  const [campaigns, setCampaigns] = useState<CampaignOpt[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [campaignId, setCampaignId] = useState(initialCampaignId || "");
  const [phone, setPhone] = useState("");
  const [amountSgd, setAmountSgd] = useState("");
  const [receiptNote, setReceiptNote] = useState("");
  const [channel, setChannel] = useState<"receipt" | "comp">("receipt");
  const [path, setPath] = useState<"choose" | "receipt">("choose");
  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ocrHint, setOcrHint] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/business/promo/ndp/issue");
    if (!res.ok) return;
    const j = await res.json();
    const list = (j.data?.campaigns || []) as CampaignOpt[];
    setCampaigns(list);
    setGrants(
      ((j.data?.grants || []) as GrantRow[]).filter(
        (g) => !storeName || true
      )
    );
    if (list.length) {
      setCampaignId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        if (initialCampaignId && list.some((c) => c.id === initialCampaignId)) {
          return initialCampaignId;
        }
        return list[0].id;
      });
    }
  }, [initialCampaignId, storeName]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = campaigns.find((c) => c.id === campaignId);
  const minSgd = ((selected?.minSpendCents ?? 12000) / 100).toFixed(0);
  const giftSgd = ((selected?.giftCouponCents ?? 6100) / 100).toFixed(0);
  const scanHref = `/business/scan?storeId=${encodeURIComponent(storeId)}`;

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function onReceiptPhoto(file: File | null | undefined) {
    if (!file) return;
    setErr(null);
    setOcrHint(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setOcrLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/business/promo/ndp/receipt-ocr", {
        method: "POST",
        body: form,
      });
      const j = await res.json();
      if (!res.ok) {
        setOcrHint(
          j.error ||
            (zh
              ? "识别失败，请手动填金额与单号后四位"
              : "OCR failed — enter amount & last 4 manually")
        );
        return;
      }
      const d = j.data || {};
      if (typeof d.amountSgd === "string" && d.amountSgd) {
        setAmountSgd(d.amountSgd);
      }
      if (typeof d.receiptLast4 === "string" && d.receiptLast4) {
        setReceiptNote(d.receiptLast4);
      } else if (typeof d.receiptNumber === "string" && d.receiptNumber) {
        setReceiptNote(String(d.receiptNumber).replace(/\D/g, "").slice(-4));
      }
      setOcrHint(
        d.message ||
          (zh
            ? "请核对金额与单号后四位"
            : "Please verify amount and last 4 digits")
      );
    } catch {
      setOcrHint(
        zh
          ? "网络错误，请手动填写金额与单号后四位"
          : "Network error — fill amount & last 4 manually"
      );
    } finally {
      setOcrLoading(false);
    }
  }

  async function submit() {
    setLoading(true);
    setErr(null);
    setMsg(null);
    setLastOk(false);
    try {
      const res = await fetch("/api/business/promo/ndp/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          storeId,
          customerPhone: phone,
          channel,
          receiptAmountSgd: channel === "receipt" ? amountSgd : undefined,
          receiptNote:
            channel === "comp"
              ? receiptNote || "comp"
              : receiptNote || undefined,
          compReason: channel === "comp" ? receiptNote || "comp" : undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error || (zh ? "发放失败" : "Failed"));
        return;
      }
      setMsg(j.data?.message || (zh ? "发放成功" : "Issued"));
      setLastOk(true);
      setPhone("");
      setAmountSgd("");
      setReceiptNote("");
      await load();
    } catch {
      setErr(zh ? "网络错误" : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pb-24">
      <div className="px-4 py-3 border-b border-border sticky top-0 bg-card z-10">
        <div className="flex items-center justify-between gap-2">
          <Link href={backHref} className="text-xs font-medium text-primary">
            ← {zh ? "本店活动券" : "Store offers"}
          </Link>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100">
            {zh ? "本店" : "Store"} · {storeName}
          </span>
        </div>
        <h1 className="text-lg font-semibold mt-1.5">
          {zh ? "活动券核销" : "Activity redeem"}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {zh
            ? `本店已锁定 · 满 S$${minSgd} 送 S$${giftSgd} · 购券扫码或收银凭票`
            : `Store locked · spend S$${minSgd} → S$${giftSgd} · scan or cash bill`}
        </p>
      </div>

      <div className="px-4 py-4 space-y-3">
        {campaigns.length === 0 ? (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4 text-sm text-amber-900">
              {zh
                ? "暂无国庆活动。请企业主到「活动券」开启默认活动。"
                : "No NDP campaign. Owner should enable defaults from Offers."}
              {canComp && (
                <Link
                  href="/business/ndp-issue"
                  className="block mt-2 font-semibold text-primary"
                >
                  {zh ? "去配置 →" : "Setup →"}
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              {zh ? "活动" : "Campaign"}
            </span>
            <select
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {path === "choose" && campaigns.length > 0 && (
          <>
            <p className="text-xs font-semibold text-foreground pt-1">
              {zh ? "本活动怎么发赠券？" : "How to issue this activity gift?"}
            </p>

            {/* 购券路径：跳转通用核销（满额自动触发满赠逻辑） */}
            <Link href={scanHref} className="block">
              <Card className="border-[#1A6EFF]/30 active:scale-[0.99] transition-transform">
                <CardContent className="p-4">
                  <p className="text-[10px] font-bold text-[#1A6EFF] uppercase tracking-wide">
                    {zh ? "顾客已有预付券" : "Has prepaid voucher"}
                  </p>
                  <p className="text-sm font-semibold text-foreground mt-1">
                    {zh
                      ? "扫顾客预付券码（本活动核销）"
                      : "Scan prepaid voucher (this activity)"}
                  </p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                    {zh
                      ? `核销满 S$${minSgd} 时按活动规则自动发 S$${giftSgd}。从本操作台进入，门店已锁定。`
                      : `Redeem ≥ S$${minSgd} auto-issues S$${giftSgd}. Entered from this desk with store locked.`}
                  </p>
                  <p className="mt-3 text-xs font-semibold text-[#1A6EFF]">
                    {zh ? "去扫码核销 →" : "Scan to redeem →"}
                  </p>
                </CardContent>
              </Card>
            </Link>

            {/* 收银路径：本台专属，因为「发 61」无法通用 */}
            <button
              type="button"
              className="w-full text-left"
              onClick={() => setPath("receipt")}
            >
              <Card className="border-rose-200 active:scale-[0.99] transition-transform">
                <CardContent className="p-4">
                  <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wide">
                    {zh ? "收银买单 · 本活动发赠券" : "Cash bill · issue gift"}
                  </p>
                  <p className="text-sm font-semibold text-foreground mt-1">
                    {zh
                      ? "没买预付券 · 看小票发活动赠券"
                      : "No prepaid · issue activity gift from bill"}
                  </p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                    {zh
                      ? "拍小票（金额+编号入镜）→ 填手机 → 发活动赠券。"
                      : "Photo of bill (amount + number) → phone → issue gift."}
                  </p>
                  <p className="mt-3 text-xs font-semibold text-rose-700">
                    {zh ? "拍照 / 填手机与金额 →" : "Photo / phone & amount →"}
                  </p>
                </CardContent>
              </Card>
            </button>
          </>
        )}

        {path === "receipt" && campaigns.length > 0 && (
          <Card className="border-l-4 border-l-rose-600">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">
                  {zh ? "路径 B · 填表发券" : "Path B · Issue form"}
                </p>
                <button
                  type="button"
                  className="text-xs font-medium text-primary"
                  onClick={() => setPath("choose")}
                >
                  {zh ? "← 返回选路径" : "← Back"}
                </button>
              </div>

              {canComp && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setChannel("receipt")}
                    className={cn(
                      "flex-1 py-2 rounded-full text-xs font-semibold",
                      channel === "receipt"
                        ? "bg-rose-600 text-white"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {zh ? "凭小票" : "Receipt"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setChannel("comp")}
                    className={cn(
                      "flex-1 py-2 rounded-full text-xs font-semibold",
                      channel === "comp"
                        ? "bg-amber-600 text-white"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {zh ? "管理层特批" : "Comp"}
                  </button>
                </div>
              )}

              <div className="rounded-xl border border-[#1A6EFF]/25 bg-[#1A6EFF]/5 p-3 space-y-2">
                <p className="text-xs font-bold text-foreground">
                  1. {zh ? "顾客手机号" : "Customer mobile"}
                </p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {zh
                    ? "口头问号码，8 位即可。赠券绑到这个号。"
                    : "8-digit SG mobile. Gift binds to this number."}
                </p>
                <Input
                  className="h-12 text-base"
                  inputMode="tel"
                  placeholder="91234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              {channel === "receipt" ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 space-y-3">
                  <div>
                    <p className="text-xs font-bold text-foreground">
                      2. {zh ? "拍小票（推荐）" : "Photo of bill (recommended)"}
                    </p>
                    <ul className="mt-1.5 text-[11px] text-rose-900/80 leading-relaxed space-y-0.5 list-disc pl-4">
                      <li>
                        {zh
                          ? "请拍清：实付金额（TOTAL）与小票编号"
                          : "Capture TOTAL amount and receipt number clearly"}
                      </li>
                      <li>
                        {zh
                          ? "尽量平放、光线足、无反光；编号与金额都入镜"
                          : "Flat, bright, no glare — number + amount in frame"}
                      </li>
                      <li>
                        {zh
                          ? "能识别则自动填金额与后四位，务必再核对"
                          : "We auto-fill amount & last 4 when possible — always verify"}
                      </li>
                    </ul>
                  </div>

                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      void onReceiptPhoto(f);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={albumInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      void onReceiptPhoto(f);
                      e.target.value = "";
                    }}
                  />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={ocrLoading}
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex-1 h-11 rounded-full bg-rose-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-60"
                    >
                      {ocrLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Camera size={16} />
                      )}
                      {zh ? "拍照" : "Camera"}
                    </button>
                    <button
                      type="button"
                      disabled={ocrLoading}
                      onClick={() => albumInputRef.current?.click()}
                      className="flex-1 h-11 rounded-full bg-white border border-rose-200 text-rose-800 text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-60"
                    >
                      <ImageIcon size={16} />
                      {zh ? "相册" : "Album"}
                    </button>
                  </div>

                  {previewUrl && (
                    <div className="relative rounded-xl overflow-hidden border border-rose-100 bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="receipt"
                        className="w-full max-h-40 object-contain bg-muted/30"
                      />
                      {ocrLoading && (
                        <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                          <p className="text-xs font-medium text-white flex items-center gap-1.5">
                            <Loader2 size={14} className="animate-spin" />
                            {zh ? "识别中…" : "Reading…"}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {ocrHint && (
                    <p className="text-[11px] text-rose-900 bg-white/80 border border-rose-100 rounded-lg px-2.5 py-2 leading-relaxed">
                      {ocrHint}
                    </p>
                  )}

                  <p className="text-xs font-bold text-foreground pt-1">
                    3.{" "}
                    {zh
                      ? `金额（≥ S$${minSgd}）与单号后四位`
                      : `Amount (≥ S$${minSgd}) & last 4`}
                  </p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-muted-foreground">
                      S$
                    </span>
                    <Input
                      className="h-14 pl-10 text-2xl font-bold tabular-nums"
                      inputMode="decimal"
                      placeholder="128.50"
                      value={amountSgd}
                      onChange={(e) => setAmountSgd(e.target.value)}
                    />
                  </div>
                  <Input
                    className="mt-1"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder={
                      zh
                        ? "小票编号后 4 位（建议填写，防重复）"
                        : "Receipt last 4 (recommended)"
                    }
                    value={receiptNote}
                    onChange={(e) => setReceiptNote(e.target.value)}
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                  <p className="text-xs font-bold">
                    2. {zh ? "特批原因" : "Comp reason"}
                  </p>
                  <Input
                    placeholder={zh ? "VIP / 客诉" : "VIP / complaint"}
                    value={receiptNote}
                    onChange={(e) => setReceiptNote(e.target.value)}
                  />
                </div>
              )}

              {err && (
                <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
                  {err}
                </p>
              )}
              {msg && (
                <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
                  {msg}
                </p>
              )}

              <Button
                className="w-full h-12 rounded-full text-base font-semibold"
                disabled={
                  loading ||
                  !campaignId ||
                  !phone.trim() ||
                  (channel === "receipt" && !amountSgd.trim()) ||
                  (channel === "comp" && !receiptNote.trim())
                }
                onClick={() => void submit()}
              >
                {loading
                  ? zh
                    ? "发放中…"
                    : "Issuing…"
                  : zh
                    ? `确认发放 S$${giftSgd}`
                    : `Issue S$${giftSgd}`}
              </Button>
              {lastOk && (
                <p className="text-[11px] text-center text-muted-foreground">
                  {zh
                    ? "可继续为下一位顾客填写"
                    : "Ready for the next customer"}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {grants.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              {zh ? "最近发放" : "Recent issues"}
            </p>
            <div className="space-y-1.5">
              {grants.slice(0, 8).map((g) => (
                <div
                  key={g.id}
                  className="rounded-xl border border-border px-3 py-2 text-xs flex justify-between gap-2"
                >
                  <span className="font-medium truncate">
                    {g.phone} · {g.channel === "comp" ? "Comp" : "Receipt"}
                  </span>
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    {g.receiptAmountCents > 0
                      ? `S$${(g.receiptAmountCents / 100).toFixed(0)}`
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

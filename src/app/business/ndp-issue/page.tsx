"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useLang } from "@/components/i18n/LanguageProvider";

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
  expiresAt: string | null;
  campaignName: string;
  storeName: string | null;
  couponQr: string | null;
  drawWeight: number | null;
  shortCode: string | null;
};

type StoreOpt = { id: string; name: string };

export default function NdpIssuePage() {
  const { lang } = useLang();
  const zh = lang !== "en";

  const [campaigns, setCampaigns] = useState<CampaignOpt[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [phone, setPhone] = useState("");
  const [amountSgd, setAmountSgd] = useState("");
  const [receiptNote, setReceiptNote] = useState("");
  const [channel, setChannel] = useState<"receipt" | "comp">("receipt");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    expiresAt: string;
    qrCode: string;
    drawWeight: number;
    multiple: number;
  } | null>(null);
  const [setupInfo, setSetupInfo] = useState<{
    tableUrl: string;
    counterUrl: string;
    slug: string;
    buyVoucherSlug?: string | null;
  } | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);

  const load = useCallback(async () => {
    const [gRes, sRes, setupRes] = await Promise.all([
      fetch("/api/business/promo/ndp/issue"),
      fetch("/api/business/stores"),
      fetch("/api/business/promo/ndp/setup"),
    ]);
    if (gRes.ok) {
      const j = await gRes.json();
      const list = (j.data?.campaigns || []) as CampaignOpt[];
      setCampaigns(list);
      setGrants(j.data?.grants || []);
      if (list.length && !campaignId) setCampaignId(list[0].id);
    }
    if (sRes.ok) {
      const j = await sRes.json();
      const list = (j.data || j.stores || []) as StoreOpt[];
      // API may return { data: Store[] } or nested
      const normalized = Array.isArray(list)
        ? list
        : Array.isArray(j.data?.stores)
          ? j.data.stores
          : [];
      setStores(
        normalized.map((s: StoreOpt) => ({ id: s.id, name: s.name }))
      );
      if (normalized.length && !storeId) setStoreId(normalized[0].id);
    }
    if (setupRes.ok) {
      const j = await setupRes.json();
      if (j.data?.tableUrl) {
        setSetupInfo({
          tableUrl: j.data.tableUrl,
          counterUrl: j.data.counterUrl,
          slug: j.data.slug,
          buyVoucherSlug: j.data.buyVoucherSlug,
        });
      }
    }
  }, [campaignId, storeId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSetup() {
    setSetupLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/business/promo/ndp/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error || (zh ? "配置失败" : "Setup failed"));
        return;
      }
      setSetupInfo({
        tableUrl: j.data.tableUrl,
        counterUrl: j.data.counterUrl,
        slug: j.data.slug,
        buyVoucherSlug: j.data.buyVoucherSlug,
      });
      setMsg(
        zh
          ? "国庆活动已就绪，可打印下方二维码贴桌/前台"
          : "NDP campaign ready — print QR codes below"
      );
      await load();
    } catch {
      setErr(zh ? "网络错误" : "Network error");
    } finally {
      setSetupLoading(false);
    }
  }

  const selected = campaigns.find((c) => c.id === campaignId);
  const minSgd = ((selected?.minSpendCents ?? 12000) / 100).toFixed(0);
  const giftSgd = ((selected?.giftCouponCents ?? 6100) / 100).toFixed(0);

  async function submit() {
    setLoading(true);
    setErr(null);
    setMsg(null);
    setLastResult(null);
    try {
      const res = await fetch("/api/business/promo/ndp/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          storeId: storeId || undefined,
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
      setLastResult({
        expiresAt: j.data.giftCoupon.expiresAt,
        qrCode: j.data.giftCoupon.qrCode,
        drawWeight: j.data.drawEntry.drawWeight,
        multiple: j.data.drawEntry.weightMultiple,
      });
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
    <div className="min-h-screen bg-background pb-24">
      <div className="px-4 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">
            {zh ? "国庆满赠发券" : "NDP Gift Issue"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {zh
              ? `满 S$${minSgd} → 送 S$${giftSgd} + 1 次大奖机会（购券约 5 倍）`
              : `Spend S$${minSgd} → S$${giftSgd} + 1 grand chance (~5× if buy voucher)`}
          </p>
        </div>
        <Link
          href="/business"
          className="text-sm text-primary font-medium"
        >
          {zh ? "返回" : "Back"}
        </Link>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* 双路径流程说明 */}
        <Card className="border-border bg-card">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">
              {zh ? "国庆满赠 · 两种发放路径" : "NDP gift · two issue paths"}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {zh
                ? "共同点：顾客最终都拿到「S$61 赠券（下次用）」；区别在钱怎么付、店员点哪里。"
                : "Both paths end with an S$61 next-visit gift. Differs by how the customer paid."}
            </p>
            <div className="space-y-2.5">
              <div className="rounded-xl border border-[#1A6EFF]/25 bg-[#1A6EFF]/5 p-3">
                <p className="text-[11px] font-bold text-[#1A6EFF]">
                  {zh ? "路径 A · 购券后扫码核销（自动发 61）" : "Path A · Buy voucher then scan redeem"}
                </p>
                <ol className="mt-1.5 space-y-1 text-[11px] text-foreground/90 leading-relaxed list-decimal pl-4">
                  <li>
                    {zh
                      ? "顾客扫桌码/前台码 → 选「购预付券」→ Stripe 付款"
                      : "Customer scans table/counter QR → buy prepaid voucher"}
                  </li>
                  <li>
                    {zh
                      ? "到店消费时，店员打开「扫码核销」扫顾客券码"
                      : "At redeem, staff open Scan & redeem the voucher code"}
                  </li>
                  <li>
                    {zh
                      ? `核销金额 ≥ S$${minSgd} 时，系统自动发 S$${giftSgd} 到顾客钱包（无需本页）`
                      : `If redeem ≥ S$${minSgd}, system auto-issues S$${giftSgd} (no need this page)`}
                  </li>
                </ol>
                <Link
                  href="/business/scan"
                  className="mt-2 inline-flex text-xs font-semibold text-[#1A6EFF]"
                >
                  {zh ? "打开扫码核销 →" : "Open scan desk →"}
                </Link>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3">
                <p className="text-[11px] font-bold text-rose-700">
                  {zh ? "路径 B · 现金结账 · 凭票发券（本页）" : "Path B · Cash receipt issue (this page)"}
                </p>
                <ol className="mt-1.5 space-y-1 text-[11px] text-foreground/90 leading-relaxed list-decimal pl-4">
                  <li>
                    {zh
                      ? "顾客正常买单（不买预付券），结账金额 ≥ 门槛"
                      : "Customer pays cash/card as usual, bill ≥ threshold"}
                  </li>
                  <li>
                    {zh
                      ? "店员在本页：填手机号 + 小票金额（可看小票/收据）"
                      : "Staff on this page: phone + receipt amount"}
                  </li>
                  <li>
                    {zh
                      ? `确认后发放 S$${giftSgd} 赠券 + 低权重大奖签（抽奖机会约为购券的 1/5）`
                      : `Issue S$${giftSgd} gift + low-weight grand draw (~1/5 of buy path)`}
                  </li>
                </ol>
                <p className="mt-2 text-[10px] text-rose-800/80 leading-snug">
                  {zh
                    ? "下方表单即路径 B。路径 A 不会在本页出现——在「扫码核销」完成。"
                    : "Form below = Path B. Path A happens only on Scan & redeem."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Launch setup */}
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">
              {zh ? "默认活动 · 一键配置" : "Default activities · setup"}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {zh
                ? "补齐三类：① 长期原价代金 ② 大奖倒计时购券 ③ 国庆满赠（桌码/前台码 + 核销≥120 自动发 61）。已有则跳过。"
                : "Ensure three defaults: ① evergreen face credit ② grand countdown draw ③ National Day gift (QR + auto S$61 on redeem ≥120)."}
            </p>
            <Button
              type="button"
              className="w-full rounded-full"
              disabled={setupLoading}
              onClick={runSetup}
            >
              {setupLoading
                ? zh
                  ? "配置中…"
                  : "Setting up…"
                : setupInfo
                  ? zh
                    ? "刷新默认活动 / 国庆码"
                    : "Refresh defaults / NDP QR"
                  : zh
                    ? "一键开启默认活动"
                    : "Enable default activities"}
            </Button>
            {setupInfo && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white border border-border p-2 text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">
                      {zh ? "桌码" : "Table"}
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/campaign/qr?slug=${encodeURIComponent(setupInfo.slug)}&ndp=1&from=table&size=200&format=png`}
                      alt="table qr"
                      className="w-full aspect-square object-contain"
                    />
                    <a
                      href={setupInfo.tableUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-primary break-all"
                    >
                      {zh ? "打开页面" : "Open"}
                    </a>
                  </div>
                  <div className="rounded-xl bg-white border border-border p-2 text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">
                      {zh ? "前台码" : "Counter"}
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/campaign/qr?slug=${encodeURIComponent(setupInfo.slug)}&ndp=1&from=counter&size=200&format=png`}
                      alt="counter qr"
                      className="w-full aspect-square object-contain"
                    />
                    <a
                      href={setupInfo.counterUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-primary break-all"
                    >
                      {zh ? "打开页面" : "Open"}
                    </a>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground break-all">
                  Table: {setupInfo.tableUrl}
                </p>
                {setupInfo.buyVoucherSlug && (
                  <p className="text-[10px] text-muted-foreground">
                    {zh ? "购券关联" : "Buy linked"}: /voucher/
                    {setupInfo.buyVoucherSlug}
                  </p>
                )}
                <Link
                  href="/business/scan"
                  className="block text-center text-xs font-semibold text-primary"
                >
                  {zh ? "去核销台（购券路径自动发 61）→" : "Go to scan desk →"}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#E11D48] shadow-sm">
          <CardContent className="p-4 space-y-4">
            <div>
              <p className="text-sm font-bold text-foreground">
                {zh
                  ? "前台操作：顾客现金买单后，发 S$" + giftSgd
                  : "Counter: issue S$" + giftSgd + " after cash bill"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                {zh
                  ? "适用：顾客没有买预付券，只是正常结账。你看纸质/POS 小票，问顾客手机号，填下面两格即可。不用扫收据拍照。"
                  : "For customers who did not buy a prepaid voucher. Read the paper/POS bill, ask for mobile, fill the two fields. No receipt photo needed."}
              </p>
            </div>

            {/* 场景切换：凭小票 vs 管理层赠送 */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setChannel("receipt")}
                className={`flex-1 py-2.5 rounded-full text-sm font-semibold ${
                  channel === "receipt"
                    ? "bg-[#E11D48] text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {zh ? "① 凭小票发（日常）" : "① From receipt"}
              </button>
              <button
                type="button"
                onClick={() => setChannel("comp")}
                className={`flex-1 py-2.5 rounded-full text-sm font-semibold ${
                  channel === "comp"
                    ? "bg-amber-600 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {zh ? "② 管理层特批" : "② Comp"}
              </button>
            </div>

            {campaigns.length === 0 ? (
              <p className="text-sm text-amber-800 bg-amber-50 rounded-xl p-3 leading-relaxed">
                {zh
                  ? "还没有国庆活动。请先点上方「一键开启默认活动」，或到活动列表创建国庆满赠。"
                  : "No NDP campaign yet. Tap setup above, or create a National Day campaign."}
              </p>
            ) : (
              <>
                {/* 步骤 0：活动 / 门店（管理层先确认） */}
                <div className="rounded-xl bg-muted/40 border border-border p-3 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {zh ? "准备（一般不用改）" : "Prep (usually leave as is)"}
                  </p>
                  <label className="block">
                    <span className="text-xs font-medium text-foreground">
                      {zh ? "用哪个国庆活动" : "Which NDP campaign"}
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
                  {stores.length > 0 && (
                    <label className="block">
                      <span className="text-xs font-medium text-foreground">
                        {zh ? "在哪家店发的" : "Which store"}
                      </span>
                      <select
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                        value={storeId}
                        onChange={(e) => setStoreId(e.target.value)}
                      >
                        {stores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                {/* 步骤 1：手机 */}
                <div className="rounded-xl border border-[#1A6EFF]/30 bg-[#1A6EFF]/5 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1A6EFF] text-white text-xs font-bold">
                      1
                    </span>
                    <p className="text-sm font-bold text-foreground">
                      {zh ? "问顾客手机号" : "Ask for mobile number"}
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed pl-9">
                    {zh
                      ? "口头问「方便留个手机吗？用来收国庆赠券」。新加坡号 8 位即可，如 9123 4567。券会绑到这个号码的顾客账号（没有会自动按手机建号）。"
                      : "Ask for an 8-digit SG mobile. The gift binds to that account."}
                  </p>
                  <Input
                    className="mt-1 h-12 text-base"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder={zh ? "例如 91234567" : "e.g. 91234567"}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                {/* 步骤 2：小票金额 */}
                {channel === "receipt" ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E11D48] text-white text-xs font-bold">
                        2
                      </span>
                      <p className="text-sm font-bold text-foreground">
                        {zh
                          ? `看小票，填本单金额（须 ≥ S$${minSgd}）`
                          : `Enter bill total (min S$${minSgd})`}
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed pl-9">
                      {zh
                        ? "拿顾客的纸质小票或 POS 屏，看「应付/实付」总额，原样填入。例如小票写 $128.50，就填 128.50。系统会检查是否满门槛，不够会提示。"
                        : "Read the total payable on the paper/POS receipt. e.g. 128.50. System checks the minimum spend."}
                    </p>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-semibold text-muted-foreground">
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
                    <label className="block pl-0">
                      <span className="text-[11px] text-muted-foreground">
                        {zh
                          ? "小票号后 4 位（可选，防同一张票发两次）"
                          : "Last 4 of bill no. (optional, anti-duplicate)"}
                      </span>
                      <Input
                        className="mt-1"
                        value={receiptNote}
                        onChange={(e) => setReceiptNote(e.target.value)}
                        placeholder={zh ? "例如 4821" : "e.g. 4821"}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-600 text-white text-xs font-bold">
                        2
                      </span>
                      <p className="text-sm font-bold text-foreground">
                        {zh ? "特批原因（必填）" : "Comp reason (required)"}
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed pl-9">
                      {zh
                        ? "仅企业主/管理层：未达门槛也要送时使用。写清楚原因备查。"
                        : "Owner/manager only when bill is below threshold."}
                    </p>
                    <Input
                      className="mt-1"
                      value={receiptNote}
                      onChange={(e) => setReceiptNote(e.target.value)}
                      placeholder={zh ? "例如 VIP / 客诉补偿" : "e.g. VIP / complaint"}
                    />
                  </div>
                )}

                {/* 步骤 3：确认 */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
                      3
                    </span>
                    <p className="text-sm font-bold text-foreground">
                      {zh ? "核对后点按钮" : "Confirm and issue"}
                    </p>
                  </div>
                  <ul className="text-[11px] text-muted-foreground leading-relaxed pl-9 space-y-0.5 list-disc">
                    <li>
                      {zh
                        ? `发放内容：S$${giftSgd} 赠券（下次再用）+ 1 次大奖抽奖机会`
                        : `Issues S$${giftSgd} gift + 1 grand draw entry`}
                    </li>
                    <li>
                      {zh
                        ? "顾客用该手机登录 WeMembers 钱包即可看到券"
                        : "Customer sees it after login with that mobile"}
                    </li>
                    <li>
                      {zh
                        ? "有效期从现在起算（默认 30 天）"
                        : "Validity starts now (default 30 days)"}
                    </li>
                  </ul>
                </div>

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
                {lastResult && (
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
                    <p className="font-semibold text-foreground">
                      {zh ? "发放成功" : "Issued"}
                    </p>
                    <p className="tabular-nums text-muted-foreground">
                      {zh ? "有效至" : "Expires"}{" "}
                      {new Date(lastResult.expiresAt).toLocaleString(
                        zh ? "zh-CN" : "en-SG"
                      )}
                    </p>
                    <p className="font-mono text-xs break-all">
                      QR {lastResult.qrCode}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {zh ? "大奖权重" : "Draw weight"} {lastResult.drawWeight}{" "}
                      · {zh ? "购券约为" : "Paid ≈"}{" "}
                      {lastResult.multiple.toFixed(1)}×
                    </p>
                  </div>
                )}

                <Button
                  className="w-full rounded-full h-12 text-base font-semibold"
                  disabled={
                    loading ||
                    !campaignId ||
                    !phone.trim() ||
                    (channel === "receipt" && !amountSgd.trim()) ||
                    (channel === "comp" && !receiptNote.trim())
                  }
                  onClick={submit}
                >
                  {loading
                    ? zh
                      ? "发放中…"
                      : "Issuing…"
                    : zh
                      ? `确认发放 S$${giftSgd} 赠券`
                      : `Issue S$${giftSgd} gift`}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <div>
          <h2 className="text-sm font-semibold mb-2">
            {zh ? "最近发放" : "Recent"}
          </h2>
          <div className="space-y-2">
            {grants.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {zh ? "暂无记录" : "No grants yet"}
              </p>
            )}
            {grants.map((g) => (
              <Card key={g.id} className="border-slate-100">
                <CardContent className="p-3 flex justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {g.phone} · {g.channel === "comp" ? "Comp" : "Receipt"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {g.campaignName}
                      {g.storeName ? ` · ${g.storeName}` : ""}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {g.issuedAt
                        ? new Date(g.issuedAt).toLocaleString(
                            zh ? "zh-CN" : "en-SG"
                          )
                        : "—"}
                      {g.receiptAmountCents > 0
                        ? ` · S$${(g.receiptAmountCents / 100).toFixed(2)}`
                        : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0 text-xs text-muted-foreground">
                    {g.drawWeight != null && <p>w={g.drawWeight}</p>}
                    {g.shortCode && (
                      <p className="font-mono">{g.shortCode}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

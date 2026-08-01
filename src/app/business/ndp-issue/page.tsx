"use client";

/**
 * 国庆配置页（企业主）：一键默认活动 + 可选全局发券
 * 现场发券请走「本店活动券 → 国庆操作台」/business/ndp-desk?storeId=
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { useLang } from "@/components/i18n/LanguageProvider";

export default function NdpIssueSetupPage() {
  const { lang } = useLang();
  const zh = lang !== "en";
  const sp = useSearchParams();
  const qStore = sp.get("storeId");

  // 若带了 storeId，现场发券应去操作台
  useEffect(() => {
    if (qStore) {
      window.location.replace(
        `/business/ndp-desk?storeId=${encodeURIComponent(qStore)}`
      );
    }
  }, [qStore]);

  const [setupInfo, setSetupInfo] = useState<{
    tableUrl: string;
    counterUrl: string;
    slug: string;
    buyVoucherSlug?: string | null;
  } | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    const [setupRes, sRes] = await Promise.all([
      fetch("/api/business/promo/ndp/setup"),
      fetch("/api/business/stores"),
    ]);
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
    if (sRes.ok) {
      const j = await sRes.json();
      const list = (j.data || j.stores || []) as { id: string; name: string }[];
      const normalized = Array.isArray(list)
        ? list
        : Array.isArray(j.data?.stores)
          ? j.data.stores
          : [];
      setStores(
        normalized.map((s: { id: string; name: string }) => ({
          id: s.id,
          name: s.name,
        }))
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
          ? "默认活动已就绪。请到「门店 → 本店活动券 → 国庆操作台」做现场发券。"
          : "Defaults ready. Use Store → Offers → NDP desk for counter work."
      );
      await load();
    } catch {
      setErr(zh ? "网络错误" : "Network error");
    } finally {
      setSetupLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-4 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">
            {zh ? "国庆活动配置" : "NDP setup"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {zh
              ? "企业主：开启默认活动。现场发券请进本店操作台。"
              : "Owner: enable defaults. Counter work uses store NDP desk."}
          </p>
        </div>
        <Link href="/business/offers" className="text-sm text-primary font-medium">
          {zh ? "活动券" : "Offers"}
        </Link>
      </div>

      <div className="px-4 py-4 space-y-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 space-y-2 text-[11px] text-muted-foreground leading-relaxed">
            <p className="text-sm font-semibold text-foreground">
              {zh ? "现场怎么做？" : "Counter workflow"}
            </p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>
                {zh
                  ? "底栏「门店」→ 选一家店 →「本店活动券」"
                  : "Stores → pick outlet → store offers"}
              </li>
              <li>
                {zh
                  ? "展开「国庆满赠」→「国庆操作台」"
                  : "Expand NDP → NDP desk"}
              </li>
              <li>
                {zh
                  ? "路径 A 扫码 / 路径 B 填手机+小票金额"
                  : "Path A scan / Path B phone + bill"}
              </li>
            </ol>
          </CardContent>
        </Card>

        {stores.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-semibold">
                {zh ? "快捷进本店操作台" : "Open store desk"}
              </p>
              {stores.map((s) => (
                <Link
                  key={s.id}
                  href={`/business/ndp-desk?storeId=${encodeURIComponent(s.id)}`}
                  className="block rounded-xl border border-border px-3 py-2.5 text-sm font-medium active:bg-muted/50"
                >
                  {s.name}
                  <span className="text-primary text-xs ml-2">
                    {zh ? "操作台 →" : "Desk →"}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold">
              {zh ? "默认活动 · 一键配置" : "Default activities"}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {zh
                ? "补齐：长期代金 · 大奖倒计时 · 国庆满赠。已有则刷新码。"
                : "Evergreen · grand countdown · NDP. Refresh QR if exists."}
            </p>
            <Button
              type="button"
              className="w-full rounded-full"
              disabled={setupLoading}
              onClick={() => void runSetup()}
            >
              {setupLoading
                ? zh
                  ? "配置中…"
                  : "Setting up…"
                : zh
                  ? "一键开启 / 刷新"
                  : "Enable / refresh"}
            </Button>
            {msg && (
              <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
                {msg}
              </p>
            )}
            {err && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
                {err}
              </p>
            )}
            {setupInfo && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="rounded-xl bg-white border p-2 text-center">
                  <p className="text-[10px] text-muted-foreground mb-1">
                    {zh ? "桌码" : "Table"}
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/campaign/qr?slug=${encodeURIComponent(setupInfo.slug)}&ndp=1&from=table&size=200&format=png`}
                    alt="table"
                    className="w-full aspect-square object-contain"
                  />
                </div>
                <div className="rounded-xl bg-white border p-2 text-center">
                  <p className="text-[10px] text-muted-foreground mb-1">
                    {zh ? "前台码" : "Counter"}
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/campaign/qr?slug=${encodeURIComponent(setupInfo.slug)}&ndp=1&from=counter&size=200&format=png`}
                    alt="counter"
                    className="w-full aspect-square object-contain"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

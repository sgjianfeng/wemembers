"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { useLang } from "@/components/i18n/LanguageProvider";
import { VoucherTypeBadge } from "@/components/voucher/VoucherTypeBadge";

type CampaignOpt = { id: string; name: string; productKind?: string };
type StoreOpt = { id: string; name: string };

export default function IssueSelfPage() {
  const { t } = useLang();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignOpt[]>([]);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [amountSgd, setAmountSgd] = useState("10");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    shortCode: string;
    balanceSgd: string;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const [cRes, sRes] = await Promise.all([
        fetch("/api/business/campaigns?status=active"),
        fetch("/api/business/stores"),
      ]);
      if (cRes.ok) {
        const j = await cRes.json();
        const list = (j.data || []).filter(
          (c: CampaignOpt) => c.productKind === "self_use"
        );
        setCampaigns(
          list.map((c: { id: string; name: string; productKind?: string }) => ({
            id: c.id,
            name: c.name,
            productKind: c.productKind,
          }))
        );
        if (list[0]) setCampaignId(list[0].id);
      }
      if (sRes.ok) {
        const j = await sRes.json();
        const list = j.data || j.stores || [];
        const opts = list.map((s: { id: string; name: string }) => ({
          id: s.id,
          name: s.name,
        }));
        setStores(opts);
        if (opts[0]) setStoreId(opts[0].id);
      }
    })();
  }, []);

  async function submit() {
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
          amountSgd: Number(amountSgd),
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
        });
      }
    } catch {
      setError("网络错误");
    }
    setLoading(false);
  }

  return (
    <div className="pb-8">
      <div className="px-4 py-3 border-b border-slate-100">
        <button
          type="button"
          className="text-xs text-[#1A6EFF] font-medium"
          onClick={() => router.push("/business")}
        >
          ← 返回
        </button>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="text-lg font-semibold">{t("issueSelf.title")}</h1>
          <VoucherTypeBadge kind="self_use" size="sm" />
        </div>
        <p className="text-xs text-slate-400 mt-0.5">{t("issueSelf.subtitle")}</p>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {campaigns.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-sm text-slate-500">
              请先创建「自用券」活动，再来发券。
              <Button
                className="w-full mt-3"
                variant="outline"
                onClick={() => router.push("/business/campaigns/new")}
              >
                去创建
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div>
              <label className="text-xs text-slate-500">活动</label>
              <select
                className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 text-sm"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">门店</label>
              <select
                className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 text-sm"
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
            <Input
              label={t("issueSelf.amount")}
              type="number"
              min={1}
              step={1}
              value={amountSgd}
              onChange={(e) => setAmountSgd(e.target.value)}
            />
            <Input
              label={t("issueSelf.phone")}
              placeholder={t("issueSelf.phonePh")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Button
              className="w-full h-12"
              loading={loading}
              onClick={() => void submit()}
              disabled={!campaignId || !storeId}
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
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-5 text-center space-y-2">
              <p className="text-sm font-medium text-green-800">
                {t("issueSelf.ok")}
              </p>
              <p className="text-3xl font-bold font-mono tracking-[0.2em] text-[#1A6EFF] tabular-nums">
                {result.shortCode}
              </p>
              <p className="text-sm text-slate-600">
                余额 S${result.balanceSgd}
              </p>
              <p className="text-[11px] text-slate-400">
                请让顾客出示短码或到「我的余额」出示核销码
              </p>
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => {
                  setResult(null);
                  setPhone("");
                }}
              >
                再发一张
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

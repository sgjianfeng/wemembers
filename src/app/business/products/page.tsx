"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useLang } from "@/components/i18n/LanguageProvider";

type Product = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  productKind: string;
  status: string;
  slug: string | null;
  buyPath: string | null;
  activityCount: number;
  voucherCount: number;
  enabledTiers?: number[];
};

const PACKS = [
  {
    id: "discount_10",
    nameZh: "9折优惠卡",
    nameEn: "10% off store card",
    descZh: "付90得100 · 档 10/20/50/100/200 · 热门展示",
    descEn: "Pay 90 get 100 · tiers 10–200 · shown in hot",
  },
  {
    id: "face_open",
    nameZh: "原价无门槛代金（门店基础）",
    nameEn: "Face voucher base (store only)",
    descZh: "付多少抵多少 · 不进首页热门 · 门店列表可见",
    descEn: "Pay face · store catalog only · not on home hot",
  },
  {
    id: "face_threshold",
    nameZh: "原价门槛代金（门店基础）",
    nameEn: "Face min-spend base (store only)",
    descZh: "券面×10 门槛 · 不进首页热门",
    descEn: "Min spend ×10 · store catalog only",
  },
  {
    id: "exclusive_ballot",
    nameZh: "投箱大奖·独享 15%",
    nameEn: "Ballot draw 15%",
    descZh: "50/100 · 3%+2%+10% · 可打入箱票 · 热门",
    descEn: "50/100 · exclusive 15% · hot feed",
  },
] as const;

export default function BusinessProductsPage() {
  const { lang } = useLang();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [packKind, setPackKind] = useState<string>("discount_10");
  const [name, setName] = useState("");
  const [createTiers, setCreateTiers] = useState<number[]>([10, 20, 50, 100, 200]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const CREATE_PRESETS = [2, 5, 10, 20, 50, 100, 200, 500] as const;

  useEffect(() => {
    // Default tiers per pack when switching pack
    if (packKind === "exclusive_ballot") setCreateTiers([50, 100]);
    else if (packKind === "discount_10") setCreateTiers([10, 20, 50, 100, 200]);
    else setCreateTiers([10, 20, 50, 100]);
  }, [packKind]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/business/products");
      if (res.ok) {
        const j = await res.json();
        setProducts(j.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const p = PACKS.find((x) => x.id === packKind);
    if (p && !name) {
      setName(lang === "en" ? p.nameEn : p.nameZh);
    }
  }, [packKind, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/business/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          packKind,
          enabledTiers: createTiers,
          status: "active",
          createShelfActivity: true,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "fail");
        return;
      }
      setName("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setBusyId(id);
    try {
      await fetch(`/api/business/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="pb-8 min-h-screen">
      <div className="px-4 py-3 border-b border-border sticky top-0 bg-background/95 z-10 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/business" className="text-xs text-primary font-medium">
            ← {lang === "en" ? "Home" : "概览"}
          </Link>
        </div>
        <h1 className="text-lg font-semibold text-foreground mt-1">
          {lang === "en" ? "Voucher products" : "券产品"}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {lang === "en"
            ? "What customers buy. One product = one sellable line with its own link."
            : "顾客实际购买的东西。一个产品 = 一条可售卖线，自带购买链接。"}
        </p>
      </div>

      <div className="px-4 mt-3">
        <div className="rounded-2xl border border-border bg-muted/40 px-3 py-2.5">
          <p className="text-[11px] font-medium text-foreground mb-1.5">
            {lang === "en" ? "Four layers (do this order)" : "四层结构（按这个顺序）"}
          </p>
          <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside leading-relaxed">
            <li>
              {lang === "en" ? (
                <>
                  <span className="text-foreground font-medium">Template</span> — fee/discount rules
                  (More → Tools → My templates)
                </>
              ) : (
                <>
                  <span className="text-foreground font-medium">模版</span>
                  ：费率/折扣规则（更多 → 工具 → 我的模版）
                </>
              )}
            </li>
            <li>
              {lang === "en" ? (
                <>
                  <span className="text-foreground font-medium">Product</span> — this page; create &amp;
                  activate
                </>
              ) : (
                <>
                  <span className="text-foreground font-medium">券产品</span>
                  ：本页创建并上架
                </>
              )}
            </li>
            <li>
              {lang === "en" ? (
                <>
                  <span className="text-foreground font-medium">Activity</span> — pick which products
                  run together
                </>
              ) : (
                <>
                  <span className="text-foreground font-medium">活动</span>
                  ：勾选要一起卖的产品
                </>
              )}
            </li>
            <li>
              {lang === "en" ? (
                <>
                  <span className="text-foreground font-medium">Store</span> — store opts into the
                  activity
                </>
              ) : (
                <>
                  <span className="text-foreground font-medium">门店</span>
                  ：门店选择参与哪个活动
                </>
              )}
            </li>
          </ol>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">
              {lang === "en" ? "New from default pack" : "用默认包创建"}
            </p>
            <div className="space-y-2">
              {PACKS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPackKind(p.id);
                    setName(lang === "en" ? p.nameEn : p.nameZh);
                  }}
                  className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                    packKind === p.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card"
                  }`}
                >
                  <p className="text-sm font-medium text-foreground">
                    {lang === "en" ? p.nameEn : p.nameZh}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {lang === "en" ? p.descEn : p.descZh}
                  </p>
                </button>
              ))}
            </div>
            <Input
              label={lang === "en" ? "Product name" : "产品名称"}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                {lang === "en" ? "Face values (SGD)" : "可选面额（新币）"}
              </p>
              <div className="flex flex-wrap gap-2">
                {CREATE_PRESETS.map((amount) => {
                  const on = createTiers.includes(amount);
                  return (
                    <button
                      key={amount}
                      type="button"
                      onClick={() =>
                        setCreateTiers((prev) => {
                          if (prev.includes(amount)) {
                            if (prev.length <= 1) return prev;
                            return prev.filter((x) => x !== amount);
                          }
                          return [...prev, amount].sort((a, b) => a - b);
                        })
                      }
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        on
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      S${amount}
                    </button>
                  );
                })}
              </div>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <Button
              className="w-full"
              loading={creating}
              disabled={!name.trim() || createTiers.length === 0}
              onClick={create}
            >
              {lang === "en" ? "Create & activate" : "创建并上架"}
            </Button>
            <p className="text-[10px] text-muted-foreground">
              {lang === "en"
                ? "Also creates a shelf activity with all stores enabled. Edit under Activities."
                : "会同步创建一个「常驻活动」并启用全部门店。可在「活动」里改门店与组合。"}
            </p>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-sm font-semibold text-foreground mb-2">
            {lang === "en" ? "Your products" : "我的券产品"}
          </h2>
          {loading ? (
            <p className="text-xs text-muted-foreground">…</p>
          ) : products.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {lang === "en" ? "None yet." : "还没有产品，用上方默认包创建。"}
            </p>
          ) : (
            <ul className="space-y-2">
              {[...products]
                .sort((a, b) => {
                  const rank = (s: string) =>
                    s === "active" ? 0 : s === "draft" ? 1 : 2;
                  return rank(a.status) - rank(b.status);
                })
                .map((p) => (
                <Card key={p.id}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/business/products/${p.id}`}
                        className="min-w-0 flex-1 active:opacity-80"
                      >
                        <p className="text-sm font-semibold text-foreground truncate">
                          {p.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {p.type === "lucky_draw_v2"
                            ? lang === "en"
                              ? "Draw"
                              : "抽奖"
                            : lang === "en"
                              ? "Voucher"
                              : "代金"}
                          {" · "}
                          {p.status === "active"
                            ? lang === "en"
                              ? "On shelf"
                              : "已上架"
                            : p.status === "archived"
                              ? lang === "en"
                                ? "Off"
                                : "已下架"
                              : lang === "en"
                                ? "Draft"
                                : "草稿"}
                          {" · "}
                          {lang === "en" ? "in activities" : "活动"}{" "}
                          {p.activityCount}
                          {" · "}
                          {lang === "en" ? "sold" : "已售"} {p.voucherCount}
                        </p>
                        {p.enabledTiers && p.enabledTiers.length > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {p.enabledTiers.map((a) => `S$${a}`).join(" / ")}
                          </p>
                        )}
                        {p.buyPath && p.status === "active" && (
                          <p className="text-[10px] text-primary mt-1 break-all">
                            {p.buyPath}
                          </p>
                        )}
                        <p className="text-[10px] text-primary/80 mt-1 font-medium">
                          {lang === "en"
                            ? "Tap to edit face values →"
                            : "点进设置面额 →"}
                        </p>
                      </Link>
                      <div className="flex flex-col gap-1 shrink-0">
                        {p.status !== "active" ? (
                          <Button
                            className="h-8 text-xs px-3"
                            loading={busyId === p.id}
                            onClick={() => setStatus(p.id, "active")}
                          >
                            {lang === "en" ? "Activate" : "上架"}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            className="h-8 text-xs px-3"
                            loading={busyId === p.id}
                            onClick={() => setStatus(p.id, "archived")}
                          >
                            {lang === "en" ? "Archive" : "下架"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground text-center pb-4">
          <Link href="/business/campaigns" className="text-primary font-medium">
            {lang === "en" ? "Manage activities →" : "管理活动（勾选产品、门店）→"}
          </Link>
          {" · "}
          <Link href="/business/templates" className="text-primary font-medium">
            {lang === "en" ? "My templates" : "我的模版"}
          </Link>
        </p>
      </div>
    </div>
  );
}
